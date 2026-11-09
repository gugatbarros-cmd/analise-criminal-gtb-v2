import sqlite3

import pytest
from fastapi.testclient import TestClient
from test_imports import csv_bytes

from gtb.api import main
from gtb.db.store import Store
from gtb.security.local_auth import AuthManager


def test_local_auth_hashes_passwords_and_revokes_sessions(tmp_path):
    path = tmp_path / "auth.sqlite3"
    manager = AuthManager(path)
    assert not manager.has_users()
    with pytest.raises(PermissionError):
        manager.create_user("viewer", "Abcdefg!2345", "viewer")
    manager.create_user("admin", "Abcdefg!2345", "admin")
    assert manager.authenticate("admin", "incorrect-password") is None
    session = manager.authenticate("admin", "Abcdefg!2345")
    assert session["role"] == "admin"
    with sqlite3.connect(path) as db:
        assert b"Abcdefg!2345" not in path.read_bytes()
        assert db.execute("SELECT token_hash FROM sessions").fetchone()[0] != session["token"]
    manager.create_user("reader", "Reader!12345", "viewer", session)
    assert manager.authenticate("reader", "Reader!12345")["role"] == "viewer"
    assert manager.user_for_token(session["token"])["username"] == "admin"
    manager.revoke(session["token"])
    assert manager.user_for_token(session["token"]) is None


def test_repeated_wrong_passwords_throttle_login(tmp_path):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "Abcdefg!2345", "admin")
    for _ in range(5):
        assert manager.authenticate("admin", "wrong-password") is None
    assert manager.authenticate("admin", "Abcdefg!2345") is None


def test_new_password_policy_requires_twelve_characters_and_preserves_old_login(tmp_path):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    for password in ("Short!1", "lowercase!1", "UPPERCASE!1", "NoSpecial1", "Abc def12"):
        with pytest.raises(ValueError):
            manager.create_user("admin", password, "admin")
    manager.create_user("admin", "Abcdef!12345", "admin")
    assert manager.authenticate("admin", "Abcdef!12345") is not None
    # Uma conta criada antes da nova regra continua autenticando pela hash armazenada.
    old_password = "legacy-password-123"
    with sqlite3.connect(manager.path) as db:
        salt = db.execute("SELECT salt FROM users WHERE username = 'admin'").fetchone()[0]
        import hashlib
        digest = hashlib.scrypt(old_password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
        db.execute("UPDATE users SET password_hash = ? WHERE username = 'admin'", (digest,))
    assert manager.authenticate("admin", old_password) is not None


def test_admin_can_revoke_edit_and_reset_all_local_accounts(tmp_path):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "Admin!123456", "admin")
    admin = manager.authenticate("admin", "Admin!123456")
    manager.create_user("reader", "Reader!12345", "viewer", admin)
    reader = manager.authenticate("reader", "Reader!12345")
    assert {item["username"] for item in manager.users()} == {"admin", "reader"}
    manager.update_user("reader", "analyst", "revoked", admin)
    assert manager.user_for_token(reader["token"]) is None
    assert manager.authenticate("reader", "Reader!12345") is None
    assert next(item for item in manager.users() if item["username"] == "reader")["status"] == "revoked"
    manager.update_user("reader", "analyst", "active", admin)
    assert manager.authenticate("reader", "Reader!12345")["role"] == "analyst"
    manager.reset_password("reader", "Temporary!12345", admin)
    assert manager.authenticate("reader", "Reader!12345") is None
    temporary = manager.authenticate("reader", "Temporary!12345")
    assert temporary["must_change_password"] is True
    manager.change_password("reader", "Temporary!12345", "NewPassword!12345", temporary["token"])
    assert manager.user_for_token(temporary["token"])["must_change_password"] is False
    assert manager.authenticate("reader", "NewPassword!12345") is not None
    with pytest.raises(ValueError):
        manager.update_user("admin", "viewer", "revoked", admin)


def test_existing_account_database_migrates_without_losing_login(tmp_path):
    path = tmp_path / "auth.sqlite3"
    import hashlib
    salt = b"synthetic-salt" * 2
    digest = hashlib.scrypt(b"Legacy!123", salt=salt, n=2**14, r=8, p=1, dklen=32)
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE users (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt BLOB NOT NULL, password_hash BLOB NOT NULL, created_at TEXT NOT NULL)")
        db.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)", ("admin", "admin", salt, digest, "2026-01-01T00:00:00Z"))
    manager = AuthManager(path)
    assert manager.authenticate("admin", "Legacy!123") is not None
    assert manager.users()[0]["status"] == "active"


def test_temporary_password_blocks_api_until_changed(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(main, "auth_manager", manager)
    manager.create_user("admin", "Admin!123456", "admin")
    admin = manager.authenticate("admin", "Admin!123456")
    manager.create_user("reader", "Reader!12345", "viewer", admin)
    client = TestClient(main.app)
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}
    reset = client.post("/auth/users/reader/reset", json={"password": "Temporary!12345"}, headers=admin_headers)
    assert reset.status_code == 200
    reader = client.post("/auth/login", json={"username": "reader", "password": "Temporary!12345"}).json()
    reader_headers = {"Authorization": f"Bearer {reader['token']}"}
    assert client.get("/auth/me", headers=reader_headers).json()["must_change_password"] is True
    assert client.get("/indicators/summary", headers=reader_headers).status_code == 403
    changed = client.post("/auth/password", json={"current_password": "Temporary!12345", "new_password": "NewPassword!12345"}, headers=reader_headers)
    assert changed.status_code == 200
    assert client.get("/auth/me", headers=reader_headers).json()["must_change_password"] is False


def test_api_requires_local_login_and_enforces_roles(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(main, "auth_manager", manager)
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    assert client.get("/health").json()["mode"] == "setup"
    assert client.get("/indicators/summary").status_code == 503
    manager.create_user("admin", "Admin!123456", "admin")
    assert client.get("/health").json()["mode"] == "local"
    assert client.get("/indicators/summary").status_code == 401
    login = client.post("/auth/login", json={"username": "admin",
                                               "password": "Admin!123456"})
    assert login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    assert client.get("/auth/me", headers=admin_headers).json()["role"] == "admin"
    assert client.post("/auth/users", json={"username": "reader", "role": "viewer",
                                             "password": "Reader!12345"},
                       headers=admin_headers).status_code == 200
    reader = client.post("/auth/login", json={"username": "reader",
                                                "password": "Reader!12345"}).json()
    reader_headers = {"Authorization": f"Bearer {reader['token']}"}
    assert reader["must_change_password"] is True
    assert client.post("/auth/password", json={"current_password": "Reader!12345",
                                                "new_password": "ReaderNew!12345"},
                       headers=reader_headers).status_code == 200
    assert client.get("/indicators/summary", headers=reader_headers).status_code == 200
    assert client.get("/auth/users", headers=reader_headers).status_code == 403
    content = csv_bytes([{"Número da ocorrência": "TEST-1", "Data": "05/01/2026",
                          "Cidade": "Igaci", "Natureza": "Roubo consumado"}])
    assert client.post("/imports/ocorrencias", content=content,
                       headers=reader_headers | {"X-Filename": "test.csv"}).status_code == 403
    assert client.post("/imports/ocorrencias", content=content,
                       headers=admin_headers | {"X-Filename": "test.csv"}).status_code == 200
    assert client.post("/auth/logout", headers=admin_headers).status_code == 200
    assert client.get("/indicators/summary", headers=admin_headers).status_code == 401


def test_api_rejects_unknown_browser_origin_and_host(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "Admin!123456", "admin")
    monkeypatch.setattr(main, "auth_manager", manager)
    client = TestClient(main.app)
    assert client.get("/health", headers={"Origin": "https://malicious.invalid"}).status_code == 403
    assert client.get("/health", headers={"Host": "malicious.invalid"}).status_code == 400


@pytest.mark.parametrize("origin", ["http://127.0.0.1:8000", "http://localhost:8000"])
def test_packaged_browser_can_setup_login_import_and_logout(tmp_path, monkeypatch, origin):
    monkeypatch.setattr(main, "auth_manager", AuthManager(tmp_path / "auth.sqlite3"))
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app, base_url="http://127.0.0.1:8000")
    headers = {"Origin": origin}
    account = {"username": "synthetic-admin", "password": "Synthetic!123"}
    # A rota estática é montada apenas pelo executável; a API isolada devolve
    # 404, sem exigir autenticação para a imagem da própria tela de login.
    assert client.get("/logo-10bpm-3d-ui.png", headers=headers).status_code == 404
    for asset in ("/assets/index.js", "/assets/index.css"):
        response = client.get(asset, headers=headers)
        assert response.status_code == 404
        assert response.headers["access-control-allow-origin"] == origin
    setup = client.post("/auth/setup", json=account, headers=headers)
    assert setup.status_code == 200, setup.text
    login = client.post("/auth/login", json=account, headers=headers)
    assert login.status_code == 200, login.text
    session = headers | {"Authorization": f"Bearer {login.json()['token']}"}
    assert client.get("/auth/me", headers=session).status_code == 200
    content = csv_bytes([{"Número da ocorrência": "TEST-PACKAGED-1", "Data": "05/01/2026",
                          "Cidade": "Igaci", "Natureza": "Roubo consumado"}])
    imported = client.post("/imports/ocorrencias", content=content,
                           headers=session | {"X-Filename": "synthetic.csv"})
    assert imported.status_code == 200, imported.text
    assert client.get("/indicators/summary", headers=session).json()["cvp"] == 1
    assert client.post("/auth/logout", headers=session).status_code == 200
    assert client.get("/auth/me", headers=session).status_code == 401


@pytest.mark.parametrize("origin", ["https://malicious.invalid", "null",
                                  "http://127.0.0.1:8001", "http://localhost.evil.invalid:8000"])
def test_packaged_browser_still_blocks_untrusted_origins(tmp_path, monkeypatch, origin):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(main, "auth_manager", manager)
    result = TestClient(main.app).post("/auth/setup", headers={"Origin": origin},
                                     json={"username": "admin", "password": "long-password-123"})
    assert result.status_code == 403
    assert not manager.has_users()
