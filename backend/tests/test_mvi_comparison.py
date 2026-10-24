"""Comparativo conservador entre CAD e NEAC sem somar vítimas."""

from test_imports import cad, csv_bytes, neac

from gtb.db.store import Store


def test_exact_candidate_comparison_preserves_both_source_totals(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Nome da vítima": "Ana Souza", "Cidade ocorrência": "Igaci"}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(**{"Nome Vítima": "MARIA APARECIDA SILVA", "Cidade": "Igaci"}),
        neac(**{"Número da ocorrência": "CAD-003", "Nome Vítima": "Ana Souza"}),
    ]))
    result = store.mvi_comparison()
    assert (result["cad_total"], result["neac_total"]) == (2, 2)
    assert (result["candidate_pairs"], result["cad_only"], result["neac_only"]) == (1, 1, 1)
    assert result["ambiguous"] == 0
    assert result["examples"][0]["same_date"] is True
    assert result["examples"][0]["same_municipality"] is False
    assert store.mvi_comparison(municipality="Igaci")["candidate_pairs"] == 0
    assert store.mvi_comparison(year=2025)["cad_total"] == 0


def test_comparison_excludes_ineligible_and_previous_versions(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Nome da vítima": "Maria Aparecida Silva"}),
        cad(**{"Número da ocorrência": "CAD-003", "Nº NIC": "NIC-444", "Óbito?": "N"}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(),
        neac(**{"Número da ocorrência": "CAD-002"}),
        neac(**{"Número da ocorrência": "CAD-003"}),
    ]))
    result = store.mvi_comparison()
    assert result["cad_total"] == 2
    assert result["neac_total"] == 3
    assert result["candidate_pairs"] == 2
    assert result["ambiguous"] == 0
    assert result["neac_only"] == 1
    store.import_file("mvi_cad", "revision.csv", csv_bytes([
        cad(**{"Óbito?": "N"}),
    ]))
    assert store.mvi_comparison()["candidate_pairs"] == 1
