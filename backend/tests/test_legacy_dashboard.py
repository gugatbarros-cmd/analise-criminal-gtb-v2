"""Mesmo recorte e unidades do painel legado, usando registros sintéticos."""
from fastapi.testclient import TestClient
from test_arms import arm
from test_drugs import drug
from test_imports import csv_bytes

from gtb.api import main
from gtb.db.store import Store
from gtb.indicators.rules import domestic_triage


def test_dashboard_scope_counts_graphs_and_source_units(tmp_path, monkeypatch):
    store = Store(tmp_path / "data.duckdb")
    monkeypatch.setattr(main, "store", store)
    store.import_file("ocorrencias", "synthetic.csv", csv_bytes([
        {"Número da ocorrência": "SYN-1", "Data": "05/01/2026", "Cidade": "Igaci",
         "Natureza": "Roubo consumado"},
        {"Número da ocorrência": "SYN-2", "Data": "05/02/2026", "Cidade": "Arapiraca",
         "Natureza": "Roubo consumado"},
        {"Número da ocorrência": "SYN-3", "Data": "05/02/2026", "Cidade": "Igaci",
         "Natureza": "APOIO AO JUDICIÁRIO/FISCALIZAÇÃO DE MEDIDA PROTETIVA"},
        {"Número da ocorrência": "SYN-4", "Data": "05/01/2025", "Cidade": "Igaci",
         "Natureza": "Roubo consumado"},
        {"Número da ocorrência": "SYN-5", "Data": "05/03/2026", "Cidade": "Tanque d’Arca",
         "Natureza": "Tentativa de homicídio"},
    ]))
    store.import_file("armas", "arms.csv", csv_bytes([arm(), arm(**{
        "Número de série": "SYN-SECOND", "Situação": "Não apreendida",
        "Quantidade de armas": "5"})]))
    store.import_file("drogas", "drugs.csv", csv_bytes([drug(), drug(**{
        "ID OCOR DESPC ENVL DROG": "DRG-SYN-SECOND", "Quantidade apreendida": "4",
        "Unidade de medida": "unidades"})]))
    client = TestClient(main.app)
    scoped = client.get("/indicators/summary?year=2026&bpm_only=true").json()
    assert scoped["occurrences"] == 2
    assert scoped["cvp"] == 1
    assert scoped["tentativas"] == 1
    assert scoped["seized_arms"] == 2  # duas unidades, não dois registros apreendidos
    assert scoped["by_source"]["armas"] == 2
    assert scoped["by_source"]["drogas"] == 2
    assert scoped["drug_weight_grams"] == 500
    assert scoped["weighted_drug_records"] == 1
    for series in scoped["occurrence_charts"].values():
        assert sum(item["total"] for item in series) == scoped["occurrences"]
    assert scoped["source_coverage"]["ocorrencias"] == 5
    assert scoped["source_coverage"]["mvi_neac"] == 0
    assert store.summary(2026)["occurrences"] == 4  # auditoria preservada
    assert client.get("/indicators/crimes/analysis?kind=CVP&year=2026&municipality=Igaci").json()["total"] == 1
    assert client.get("/indicators/crimes/analysis?kind=invalid").status_code == 422


def test_cad_and_neac_graphs_never_change_each_other(tmp_path):
    store = Store(tmp_path / "data.duckdb")
    row = {"Número da ocorrência": "SYN-MVI", "Data": "05/01/2026", "Cidade": "Igaci",
           "Nome da vítima": "Pessoa Sintética", "Natureza": "Homicídio doloso",
           "Óbito": "S", "Envolvimento": "Vítima"}
    store.import_file("mvi_cad", "cad.csv", csv_bytes([row]))
    before = store.summary(2026, bpm_only=True)
    store.import_file("mvi_neac", "neac.csv", csv_bytes([row]))
    after = store.summary(2026, bpm_only=True)
    assert before["mvi_cad"] == after["mvi_cad"] == 1
    assert before["mvi_neac"] == 0 and after["mvi_neac"] == 1
    assert after["monthly"]["2026-01"]["mvi_cad"] == 1
    assert after["monthly"]["2026-01"]["mvi_neac"] == 1


def test_legacy_narrative_columns_are_reclassified_without_losing_originals(tmp_path):
    path = tmp_path / "data.duckdb"
    store = Store(path)
    base = {"Data": "05/01/2026", "Cidade": "Igaci", "Natureza": "Atendimento",
            "Texto do Despachante": "", "Texto para Divulgação": "", "Boletim Resumido": ""}
    store.import_file("ocorrencias", "synthetic.csv", csv_bytes([
        base | {"Número da ocorrência": "SYN-A", "Texto do Despachante": "Tentativa de homicídio"},
        base | {"Número da ocorrência": "SYN-B", "Texto para Divulgação": "Visita orientativa realizada"},
        base | {"Número da ocorrência": "SYN-C", "Boletim Resumido": "Cumprimento de mandado judicial"},
    ]))
    with store._connect() as db:
        originals = db.execute("SELECT natural_key,version,raw_json FROM record_versions ORDER BY natural_key").fetchall()
        db.execute("UPDATE source_types SET adapter_version = '0.1.17'")
        db.execute("UPDATE record_versions SET indicators = []")
    revised = Store(path)
    summary = revised.summary(2026)
    assert (summary["tentativas"], summary["visitas"], summary["mandados"]) == (1, 1, 1)
    with revised._connect() as db:
        assert db.execute("SELECT natural_key,version,raw_json FROM record_versions ORDER BY natural_key").fetchall() == originals
    assert list((tmp_path / "backups").glob('before-adapter-*.duckdb'))


def test_domestic_denial_and_victim_role_follow_legacy_rule():
    row = {"Tipificação no atendimento": "Violência doméstica", "Sexo": "F", "Envolvimento": "Vítima"}
    assert domestic_triage(row)["status"] == "recognized"
    conflict = row | {"Relato": "A equipe constatou: não houve violência doméstica."}
    assert domestic_triage(conflict)["status"] == "pending"
    assert domestic_triage(row | {"Solução": "Não foi trote"})["status"] == "recognized"
