"""Guarnições fictícias mantêm escala, força-tarefa e outros recursos separados."""

from datetime import date
from pathlib import Path

from test_imports import csv_bytes

from gtb.db.store import Store
from gtb.indicators.teams import canonical_team, team_complexity, team_group, team_officers
from gtb.ingestion.adapters.normalize import normalize

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic" / "guarnicoes.csv"


def test_team_ranking_uses_roster_and_complexity(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    result = store.import_file("guarnicoes", "guarnicoes.csv", FIXTURE.read_bytes())
    assert result["inserted"] == 5
    analysis = store.teams_analysis()
    assert analysis["roster_occurrences"] == 3
    assert analysis["weighted_points"] == 11
    assert (analysis["teams"], analysis["officers"]) == (2, 3)
    assert (analysis["extra_occurrences"], analysis["unlisted_occurrences"]) == (1, 1)
    assert analysis["ranking"][0] == {"name": "RP 01", "occurrences": 2, "points": 7}
    assert analysis["officer_ranking"][0]["registration"] == "SYN001"
    assert store.teams_analysis(2026, "Igaci")["roster_occurrences"] == 2
    assert store.teams_analysis(2025)["roster_occurrences"] == 0
    assert store.records("guarnicoes")["total"] == 5
    january = store.teams_analysis(month=1)
    assert january["roster_occurrences"] == 2
    assert "RP 01" in january["available_teams"]
    assert store.teams_analysis(team_name="RP 01")["weighted_points"] == 7
    assert store.teams_analysis(start_date=date(2026, 2, 1))["roster_occurrences"] == 1
    assert store.records("guarnicoes", team_name="RP 01")["total"] == 2
    assert store.records("guarnicoes", month=2)["total"] == 2
    assert store.records("guarnicoes", team_name="RP 01")["items"][0]["team_officers"]


def test_team_identity_date_and_scope_are_conservative(tmp_path):
    row = {"N Ocorrência": "GUA-SYN-001", "Dt Hora Registro Ocorrência":
           "01/01/2026 às 12:30:00", "Cidade": "Igaci", "Nome da Equipe Recurso": "RP 1",
           "Tipicidade no Despacho": "Homicídio doloso", "Titular ou Apoio": "Titular"}
    normalized = normalize("guarnicoes", row)
    assert normalized.event_date == "2026-01-01"
    assert normalized.category == "RP 01"
    assert canonical_team("FT") == "GERAL — FORÇA-TAREFA"
    assert team_group("RECURSO EVENTUAL") == "unlisted"
    assert team_complexity("Homicídio doloso") == (5, "Crítico")
    assert team_officers("COMANDANTE DE EQUIPE AGENTE FICTÍCIO UM / MATR: SYN001")[0][
        "registration"] == "SYN001"
    store = Store(tmp_path / "data" / "gtb.duckdb")
    invalid = row | {"Nome da Equipe Recurso": ""}
    result = store.import_file("guarnicoes", "guarnicoes.csv", csv_bytes([row, invalid]))
    assert (result["inserted"], result["quarantined"]) == (1, 1)
