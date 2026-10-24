from pathlib import Path

from fastapi.testclient import TestClient
from test_arms import arm
from test_drugs import drug
from test_imports import cad, csv_bytes, neac

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


def test_quarantine_api_pages_report_full_total(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([cad(), *[
        cad(**{"Número da ocorrência": "", "Nº NIC": f"NIC-{index}"})
        for index in range(4)
    ]])
    imported = client.post("/imports/mvi_cad", content=content,
                           headers={"X-Filename": "audit.csv"}).json()
    result = client.get(f"/imports/{imported['id']}/quarantine?page=2&size=2")
    assert result.status_code == 200
    assert result.json()["total"] == 4
    assert [item["row_number"] for item in result.json()["items"]] == [5, 6]
    assert client.get(f"/imports/{imported['id']}/quarantine?page=0").status_code == 422


def test_import_batch_history_has_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    first = client.post("/imports/mvi_cad", content=csv_bytes([cad()]),
                        headers={"X-Filename": "first.csv"}).json()
    client.post("/imports/mvi_cad", content=csv_bytes([
        cad(**{"Número da ocorrência": "CAD-002"})
    ]), headers={"X-Filename": "second.csv"})
    result = client.get("/imports?page=2&size=1")
    assert result.status_code == 200
    assert result.json()["total"] == 2
    assert result.json()["items"][0]["id"] == first["id"]
    assert client.get("/imports?size=101").status_code == 422


def test_arms_api_applies_the_same_filters_to_totals_and_records(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([arm(), arm(**{"Número de série": "SER-SYN-002", "Data": "18/02/2026",
                                        "Tipo": "Revólver", "Situação": "Não apreendida"})])
    assert client.post("/imports/armas", content=content,
                       headers={"X-Filename": "arms.csv"}).status_code == 200
    filtered = client.get("/indicators/arms/analysis?month=1&arm_type=Pistola&situation=Apreendida")
    assert filtered.json()["total"] == 2
    assert filtered.json()["records"] == 1
    assert client.get("/records/armas?month=1&arm_type=Pistola&situation=Apreendida").json()["total"] == 1
    assert client.get("/indicators/arms/analysis?month=13").status_code == 422


def test_drugs_api_filters_weight_and_records_together(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([drug(), drug(**{"ID OCOR DESPC ENVL DROG": "DRG-SYN-002",
                                          "Data apreensão": "05/03/2026",
                                          "Tipo de droga": "Crack", "Quantidade apreendida": "100",
                                          "Unidade de medida": "mg"})])
    assert client.post("/imports/drogas", content=content,
                       headers={"X-Filename": "drugs.csv"}).status_code == 200
    filtered = client.get("/indicators/drugs/analysis?month=3&drug_type=Crack")
    assert filtered.json()["total"] == 1
    assert filtered.json()["total_weight_grams"] == 0.1
    assert client.get("/records/drogas?month=3&drug_type=Crack").json()["total"] == 1
    assert client.get("/indicators/drugs/analysis?month=0").status_code == 422


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


def test_tco_api_filter_keeps_overlapping_cvp(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([{
        "Número da ocorrência": "O-1", "Data": "05/01/2026", "Cidade": "Igaci",
        "Natureza": "Roubo", "Solução": "ELABOROU TCO (PM)",
    }])
    assert client.post("/imports/ocorrencias", content=content,
                       headers={"X-Filename": "tco.csv"}).status_code == 200
    summary = client.get("/indicators/summary?year=2026").json()
    assert (summary["tco"], summary["cvp"]) == (1, 1)
    result = client.get("/records/ocorrencias?indicator=TCO")
    assert result.status_code == 200
    assert result.json()["total"] == 1
    assert result.json()["items"][0]["indicators"] == ["CVP", "TCO"]
    analysis = client.get("/indicators/tco/analysis?year=2026&municipality=Igaci")
    assert analysis.status_code == 200
    assert analysis.json()["total"] == 1
    assert analysis.json()["monthly"] == [{"period": "2026-01", "total": 1}]
    assert client.get("/indicators/tco/analysis?year=2025").json()["total"] == 0


def test_domestic_api_exposes_review_counts_and_evidence(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    content = csv_bytes([{
        "Número da ocorrência": "D-1", "Data": "05/01/2026", "Cidade": "Igaci",
        "Natureza": "Violência doméstica", "Tipificação geral": "Violência doméstica",
        "Sexo da vítima": "F",
    }])
    assert client.post("/imports/ocorrencias", content=content,
                       headers={"X-Filename": "domestic.csv"}).status_code == 200
    assert client.get("/indicators/summary").json()["domestica"] == 1
    analysis = client.get("/indicators/domestic/analysis?year=2026")
    assert analysis.status_code == 200
    assert analysis.json()["total"] == 1
    assert analysis.json()["reviews"] == {"pending": 0, "excluded": 0, "outside": 0}
    cases = client.get("/records/ocorrencias?indicator=Dom%C3%A9stica").json()
    assert cases["total"] == 1
    assert "Tipificação geral" in cases["items"][0]["action_evidence"]


def test_mvi_analysis_api_rejects_other_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    response = client.post("/imports/mvi_cad", content=csv_bytes([cad()]),
                           headers={"X-Filename": "cad.csv"})
    assert response.status_code == 200
    assert client.get("/indicators/mvi/mvi_cad/analysis?year=2026").json()["total"] == 1
    assert client.get("/indicators/mvi/mvi_neac/analysis?year=2026").json()["total"] == 0
    assert client.get("/indicators/mvi/ocorrencias/analysis").status_code == 404


def test_mvi_case_detail_keeps_sources_and_current_version_separate(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    original = cad(**{"Instrumento empregado": "Revólver", "Relato": "Texto CAD original"})
    assert client.post("/imports/mvi_cad", content=csv_bytes([original]),
                       headers={"X-Filename": "cad.csv"}).status_code == 200
    assert client.post("/imports/mvi_neac", content=csv_bytes([
        neac(**{"Nº NIC": "NIC-111", "Instrumento": "Faca",
                "Relato": "Texto NEAC original"}),
    ]), headers={"X-Filename": "neac.csv"}).status_code == 200
    cad_key = client.get("/records/mvi_cad").json()["items"][0]["natural_key"]
    neac_key = client.get("/records/mvi_neac").json()["items"][0]["natural_key"]
    assert cad_key == neac_key
    cad_detail = client.get(f"/mvi/mvi_cad/records/{cad_key}").json()
    neac_detail = client.get(f"/mvi/mvi_neac/records/{neac_key}").json()
    assert cad_detail["fields"]["Relato"] == "Texto CAD original"
    assert neac_detail["fields"]["Relato"] == "Texto NEAC original"
    assert cad_detail["version"] == 1
    assert client.post("/imports/mvi_cad", content=csv_bytes([
        original | {"Relato": "Texto CAD retificado"},
    ]), headers={"X-Filename": "cad-revisado.csv"}).status_code == 200
    revised = client.get(f"/mvi/mvi_cad/records/{cad_key}").json()
    assert revised["fields"]["Relato"] == "Texto CAD retificado"
    assert revised["version"] == 2
    assert revised["is_current"] is True
    cad_versions = client.get(f"/mvi/mvi_cad/records/{cad_key}/versions").json()["items"]
    neac_versions = client.get(f"/mvi/mvi_neac/records/{neac_key}/versions").json()["items"]
    assert [(item["version"], item["is_current"]) for item in cad_versions] == [
        (2, True), (1, False),
    ]
    assert [(item["version"], item["is_current"]) for item in neac_versions] == [(1, True)]
    old = client.get(f"/mvi/mvi_cad/records/{cad_key}?version=1").json()
    assert old["fields"]["Relato"] == "Texto CAD original"
    assert old["is_current"] is False
    assert old["batch_id"] != revised["batch_id"]
    assert client.get(f"/mvi/mvi_cad/records/{cad_key}?version=3").status_code == 404
    assert client.get("/mvi/ocorrencias/records/example").status_code == 404
    assert client.get("/mvi/mvi_cad/records/inexistente").status_code == 404
    assert client.get("/mvi/mvi_cad/records/inexistente/versions").status_code == 404


def test_operational_actions_api_keeps_filters_and_evidence(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    row = {"Número da ocorrência": "A-1", "Data": "05/01/2026", "Cidade": "Igaci",
           "Natureza": "Cumprimento de mandado", "Relato": "Visita preventiva"}
    assert client.post("/imports/ocorrencias", content=csv_bytes([row]),
                       headers={"X-Filename": "actions.csv"}).status_code == 200
    summary = client.get("/indicators/summary?year=2026&municipality=Igaci").json()
    assert (summary["mandados"], summary["visitas"]) == (1, 1)
    items = client.get("/records/ocorrencias?indicator=Mandados").json()["items"]
    assert len(items) == 1 and items[0]["action_evidence"]
    assert client.get("/indicators/operations/Mandados/analysis?year=2026").json()["total"] == 1
    assert client.get("/indicators/operations/Visitas/analysis?year=2025").json()["total"] == 0
    assert client.get("/indicators/operations/Outros/analysis").status_code == 404


def test_disturbance_api_exposes_classified_cases(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    row = {"Número da ocorrência": "S-1", "Data": "05/01/2026", "Cidade": "Igaci",
           "Natureza": "Perturbação do sossego", "Solução": "Elaborou TCO PM"}
    assert client.post("/imports/ocorrencias", content=csv_bytes([row]),
                       headers={"X-Filename": "sossego.csv"}).status_code == 200
    assert client.get("/indicators/summary").json()["sossego"] == 1
    assert client.get("/indicators/operations/Sossego/analysis").json()["total"] == 1
    item = client.get("/records/ocorrencias?indicator=Sossego").json()["items"][0]
    assert item["indicators"] == ["TCO", "Sossego"]
    assert "tipificação" in item["action_evidence"]


def test_teams_api_filters_match_record_relation(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(tmp_path / "gtb.duckdb"))
    client = TestClient(main.app)
    fixture = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic" / "guarnicoes.csv"
    assert client.post("/imports/guarnicoes", content=fixture.read_bytes(),
                       headers={"X-Filename": "guarnicoes.csv"}).status_code == 200
    params = "?year=2026&month=1&team_name=RP%2001"
    assert client.get("/indicators/teams/analysis" + params).json()["weighted_points"] == 7
    assert client.get("/records/guarnicoes" + params).json()["total"] == 2
    params = "?officer_registration=SYN001&nature_filter=Homic%C3%ADdio%20doloso"
    assert client.get("/indicators/teams/analysis" + params).json()["weighted_points"] == 5
    assert client.get("/records/guarnicoes" + params).json()["total"] == 1
    assert client.get("/indicators/teams/analysis?start_date=2026-02-01&end_date=2026-01-01").status_code == 422
    assert client.get("/records/drogas?team_name=RP%2001").status_code == 422
