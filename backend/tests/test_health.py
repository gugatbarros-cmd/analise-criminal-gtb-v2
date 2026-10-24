from fastapi.testclient import TestClient

from gtb.api.main import app


def test_health_contract() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.26", "mode": "local"}


def test_demo_mode_is_read_only(monkeypatch) -> None:
    monkeypatch.setenv("GTB_DEMO_MODE", "1")
    client = TestClient(app)
    assert client.get("/health").json()["mode"] == "demo"
    response = client.post("/imports/mvi_cad", content=b"teste",
                           headers={"X-Filename": "teste.csv"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Demonstração somente para consulta"
    assert client.get("/auth/me").status_code == 403


def test_cors_rejects_unknown_origin() -> None:
    response = TestClient(app).get("/health", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in response.headers
