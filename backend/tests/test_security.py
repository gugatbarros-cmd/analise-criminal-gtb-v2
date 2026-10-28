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
        manager.create_user("viewer", "a-strong-password", "viewer")
    manager.create_user("admin", "a-strong-password", "admin")
    assert manager.authenticate("admin", "incorrect-password") is None
    session = manager.authenticate("admin", "a-strong-password")
    assert session["role"] == "admin"
    with sqlite3.connect(path) as db:
        assert b"a-strong-password" not in path.read_bytes()
        assert db.execute("SELECT token_hash FROM sessions").fetchone()[0] != session["token"]
    manager.create_user("reader", "reader-password-123", "viewer", session)
    assert manager.authenticate("reader", "reader-password-123")["role"] == "viewer"
    assert manager.user_for_token(session["token"])["username"] == "admin"
    manager.revoke(session["token"])
    assert manager.user_for_token(session["token"]) is None


def test_repeated_wrong_passwords_throttle_login(tmp_path):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "a-strong-password", "admin")
    for _ in range(5):
        assert manager.authenticate("admin", "wrong-password") is None
    assert manager.authenticate("admin", "a-strong-password") is None


def test_api_requires_local_login_and_enforces_roles(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(main, "auth_manager", manager)
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    assert client.get("/health").json()["mode"] == "setup"
    assert client.get("/indicators/summary").status_code == 503
    manager.create_user("admin", "administrator-password", "admin")
    assert client.get("/health").json()["mode"] == "local"
    assert client.get("/indicators/summary").status_code == 401
    login = client.post("/auth/login", json={"username": "admin",
                                               "password": "administrator-password"})
    assert login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    assert client.get("/auth/me", headers=admin_headers).json()["role"] == "admin"
    assert client.post("/auth/users", json={"username": "reader", "role": "viewer",
                                             "password": "reader-password-123"},
                       headers=admin_headers).status_code == 200
    reader = client.post("/auth/login", json={"username": "reader",
                                                "password": "reader-password-123"}).json()
    reader_headers = {"Authorization": f"Bearer {reader['token']}"}
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
    manager.create_user("admin", "administrator-password", "admin")
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
    account = {"username": "synthetic-admin", "password": "synthetic-password-123"}
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
