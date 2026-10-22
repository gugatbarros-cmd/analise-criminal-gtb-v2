from fastapi.testclient import TestClient

from gtb.api.main import app


def test_health_contract() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.12", "mode": "local"}


def test_cors_rejects_unknown_origin() -> None:
    response = TestClient(app).get("/health", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in response.headers
