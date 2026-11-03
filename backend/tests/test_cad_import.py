"""A entrada CAD exige sessão local autorizada e período válido."""

import pytest
from fastapi.testclient import TestClient

from gtb.api import main
from gtb.cad.automation import CadImportManager, check_period
from gtb.db.store import Store


def test_cad_period_rejects_invalid_and_reversed_dates():
    check_period("2026-11-01", "2026-11-03")
    with pytest.raises(ValueError):
        check_period("2026-02-30", "2026-03-01")
    with pytest.raises(ValueError):
        check_period("2026-11-03", "2026-11-01")


def test_cad_start_rejects_bad_input_without_opening_browser(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    monkeypatch.setattr(main, "cad_import", manager)
    client = TestClient(main.app)
    response = client.post("/cad/start", json={
        "cpf": "12345678901", "password": "synthetic-only", "start_date": "2026-11-03",
        "end_date": "2026-11-01",
    })
    assert response.status_code == 422
    assert manager.status()["phase"] == "idle"
    assert client.get("/cad/status").json()["result"] is None


def test_viewer_cannot_start_cad(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    monkeypatch.setattr(main, "cad_import", manager)

    class ViewerAuth:
        def has_users(self):
            return True

        def user_for_token(self, _token):
            return {"username": "synthetic-viewer", "role": "viewer"}

    monkeypatch.setattr(main, "auth_manager", ViewerAuth())
    client = TestClient(main.app)
    response = client.post("/cad/start", json={
        "cpf": "12345678901", "password": "synthetic-only", "start_date": "2026-11-01",
        "end_date": "2026-11-03",
    })
    assert response.status_code == 403
    assert manager.status()["phase"] == "idle"
