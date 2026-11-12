from fastapi.testclient import TestClient

from gtb.api import main
from gtb.security.local_auth import AuthManager


def test_update_requires_admin_and_refuses_active_import(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "Abcdefg!2345", "admin")
    admin = manager.authenticate("admin", "Abcdefg!2345")
    manager.create_user("reader", "Reader!12345", "viewer", admin)
    reader = manager.authenticate("reader", "Reader!12345")
    monkeypatch.setattr(main, "auth_manager", manager)
    monkeypatch.setattr(main, "installed_updater_path", lambda: tmp_path / "atualizar-gtb.ps1")
    monkeypatch.setattr(main, "active_data_operations", 1)
    monkeypatch.setattr(main, "update_process", None)
    (tmp_path / "atualizar-gtb.ps1").write_text("", encoding="utf-8")
    client = TestClient(main.app)
    assert client.post("/system/update", headers={"Authorization": f"Bearer {reader['token']}"}).status_code == 403
    response = client.post("/system/update", headers={"Authorization": f"Bearer {admin['token']}"})
    assert response.status_code == 409
    assert "importação" in response.json()["detail"]


def test_update_status_reads_only_known_phases(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / "auth.sqlite3")
    manager.create_user("admin", "Abcdefg!2345", "admin")
    token = manager.authenticate("admin", "Abcdefg!2345")["token"]
    monkeypatch.setattr(main, "auth_manager", manager)
    status = tmp_path / "update-status.json"
    monkeypatch.setattr(main, "update_status_file", status)
    status.write_text('{"phase":"downloading","message":"Baixando...","progress":42}', encoding="utf-8")
    client = TestClient(main.app)
    assert client.get("/system/update/status", headers={"Authorization": f"Bearer {token}"}).json() == {
        "phase": "downloading", "message": "Baixando...", "progress": 42}
    status.write_text('{"phase":"downloading","message":"Baixando...","progress":120}', encoding="utf-8")
    assert client.get("/system/update/status", headers={"Authorization": f"Bearer {token}"}).json()["phase"] == "failed"
