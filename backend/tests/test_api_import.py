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


def test_cvp_records_api_filter(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([
        {"Número da ocorrência": "1", "Data": "05/01/2026", "Cidade": "Igaci",
         "Natureza": "Roubo consumado"},
        {"Número da ocorrência": "2", "Data": "06/01/2026", "Cidade": "Igaci",
         "Natureza": "Roubo tentado"},
    ])
    response = client.post("/imports/ocorrencias", content=content,
                           headers={"X-Filename": "cvp.csv"})
    assert response.status_code == 200
    assert client.get("/records/ocorrencias?category_prefix=CVP%20").json()["total"] == 2
    attempted = client.get("/records/ocorrencias?category_prefix=CVP%20Tentado").json()
    assert attempted["total"] == 1
    assert attempted["items"][0]["occurrence"] == "2"


def test_attempt_records_expose_solution_for_review(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([{
        "Número da ocorrência": "A-1", "Data": "05/01/2026", "Cidade": "Igaci",
        "Natureza": "Tentativa de homicídio", "Solução": "Atendimento confirmado",
    }])
    assert client.post("/imports/ocorrencias", content=content,
                       headers={"X-Filename": "attempt.csv"}).status_code == 200
    result = client.get("/records/ocorrencias?category_prefix=Tentativa%20de%20homic%C3%ADdio")
    assert result.status_code == 200
    assert result.json()["items"][0]["solution"] == "Atendimento confirmado"
