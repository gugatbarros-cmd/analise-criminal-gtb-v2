from fastapi.testclient import TestClient
from test_imports import cad, csv_bytes

from gtb.api import main
from gtb.db.store import Store


def test_local_import_and_filtered_summary(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    response = client.post(
        "/imports/mvi_cad?scope=partial",
        content=csv_bytes([cad()]),
        headers={"X-Filename": "cad.csv", "Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200
    assert response.json()["inserted"] == 1
    assert client.get("/indicators/summary?year=2026").json()["mvi_cad"] == 1
    assert client.get("/indicators/summary?year=2025").json()["mvi_cad"] == 0
    assert client.get("/records/mvi_cad").json()["total"] == 1
    assert client.get("/records/mvi_cad?year=2025").json()["total"] == 0
    assert client.get("/records/mvi_cad?victim=Maria&eligible_only=true").json()["total"] == 1
    assert len(client.get("/imports").json()["items"]) == 1


def test_rejects_unsafe_upload(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    response = client.post("/imports/unknown", content=b"data")
    assert response.status_code == 404
    response = client.post("/imports/mvi_cad", content=b"data", headers={"X-Filename": "x.exe"})
    assert response.status_code == 422
