from fastapi.testclient import TestClient

from gtb.api import main as api_module
from gtb.api.main import app
from gtb.security.local_auth import AuthManager


def test_health_contract() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.37", "mode": "local"}


def test_demo_mode_is_read_only(monkeypatch) -> None:
    monkeypatch.setenv("GTB_DEMO_MODE", "1")
    client = TestClient(app)
    assert client.get("/health").json()["mode"] == "demo"
    response = client.post("/imports/mvi_cad", content=b"teste",
                           headers={"X-Filename": "teste.csv"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Demonstração somente para consulta"
    assert client.get("/auth/me").status_code == 403
    assert client.post("/auth/setup", json={"username": "admin", "password": "long-password-123"}).status_code == 403


def test_first_admin_can_be_created_once_from_local_interface(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(api_module, "auth_manager", AuthManager(tmp_path / "auth.sqlite3"))
    client = TestClient(app)
    assert client.get("/health").json()["mode"] == "setup"
    assert client.get("/").status_code == 404  # a interface é montada só no executável
    response = client.post("/auth/setup", json={"username": "admin", "password": "strong-password-123"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert client.get("/health").json()["mode"] == "local"
    assert client.post("/auth/setup", json={"username": "other", "password": "strong-password-123"}).status_code == 409


def test_cors_rejects_unknown_origin() -> None:
    response = TestClient(app).get("/health", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in response.headers
