from test_imports import csv_bytes

from gtb.db.store import Store
from gtb.indicators.rules import domestic_triage


def test_domestic_triage_keeps_uncertain_and_negative_cases_separate():
    base = {"Natureza": "Violência doméstica", "Sexo da vítima": "F"}
    assert domestic_triage(base)["status"] == "pending"
    assert domestic_triage(base | {"Tipificação geral": "Violência doméstica"})[
        "status"] == "recognized"
    assert domestic_triage(base | {"Solução": "Fato não constatado"})[
        "status"] == "excluded"
    assert domestic_triage(base | {"Tipificação geral": "Violência doméstica",
                                   "Solução": "Fato não constatado"})["status"] == "pending"
    assert domestic_triage(base | {"Sexo da vítima": "M"})["status"] == "outside"
    assert domestic_triage({"Natureza": "Ameaça", "Nome da vítima": "Maria Silva"})[
        "status"] == "unrelated"
    assert domestic_triage({"Natureza": "Violência doméstica",
                            "Relato": "A vítima relatou que foi ameaçada pelo companheiro",
                            "Sexo da vítima": "F"})["status"] == "recognized"
    assert domestic_triage({"Natureza": "Violência doméstica",
                            "Relato": "A vítima relatou que não houve agressão",
                            "Sexo da vítima": "F"})["status"] == "pending"


def test_domestic_analysis_and_review_flags(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data": "05/01/2026", "Cidade": "Igaci", "Natureza": "Violência doméstica",
            "Sexo da vítima": "F", "Tipificação geral": "", "Solução": "", "Relato": ""}
    rows = [
        base | {"Número da ocorrência": "1", "Tipificação geral": "Violência doméstica"},
        base | {"Número da ocorrência": "2"},
        base | {"Número da ocorrência": "3", "Solução": "Fato não constatado"},
        base | {"Número da ocorrência": "4", "Sexo da vítima": "M"},
        base | {"Número da ocorrência": "5", "Tipificação geral": "Violência doméstica",
                "Solução": "Fato não constatado"},
    ]
    store.import_file("ocorrencias", "domestic.csv", csv_bytes(rows))
    assert store.summary()["domestica"] == 1
    analysis = store.domestic_analysis(2026, "Igaci")
    assert analysis["total"] == 1
    assert analysis["reviews"] == {"pending": 2, "excluded": 1, "outside": 1}
    recognized = store.records("ocorrencias", indicator="Doméstica")
    assert recognized["items"][0]["occurrence"] == "1"
    assert "Tipificação geral" in recognized["items"][0]["action_evidence"]
    assert store.records("ocorrencias", indicator="Doméstica:pending")["total"] == 2
