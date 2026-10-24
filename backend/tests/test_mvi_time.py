"""Horários MVI: cobertura e faixas respeitam fonte, elegibilidade e filtros."""

from test_imports import cad, csv_bytes, neac

from gtb.db.store import Store
from gtb.indicators.mvi_time import mvi_hour, time_band


def test_time_parser_prefers_explicit_and_does_not_impute_midnight():
    assert mvi_hour({"Hora da ocorrência": "19:35", "Data": "05/01/2026 23:10"}) == 19
    assert mvi_hour({"Data": "05/01/2026 00:10"}) == 0
    assert mvi_hour({"Data": "05/01/2026"}) is None
    assert mvi_hour({"Hora": "25:40"}) is None
    assert mvi_hour({"Hora": "1835"}) == 18
    assert mvi_hour({"Hora": "18h"}) == 18
    assert mvi_hour({"Hora": "0,75"}) == 18
    assert time_band(23) == "22h–00h"


def test_time_profile_is_source_specific_and_counts_only_eligible_current_rows(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(**{"Hora da ocorrência": "18:35"}),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Hora da ocorrência": "19:10"}),
        cad(**{"Número da ocorrência": "CAD-003", "Nº NIC": "NIC-333",
               "Cidade ocorrência": "Igaci", "Hora da ocorrência": "21:30"}),
        cad(**{"Número da ocorrência": "CAD-004", "Nº NIC": "NIC-444",
               "Hora da ocorrência": "", "Data da ocorrência": "07/01/2026"}),
        cad(**{"Número da ocorrência": "CAD-005", "Nº NIC": "NIC-555",
               "Hora da ocorrência": "02:00", "Óbito?": "N"}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(Hora="23:55"),
    ]))
    cad_profile = store.mvi_analysis("mvi_cad")
    assert cad_profile["time_coverage"] == {"valid": 3, "total": 4}
    assert cad_profile["time_bands"] == [
        {"name": "18h–20h", "total": 2}, {"name": "20h–22h", "total": 1},
    ]
    assert cad_profile["city_time_bands"][0] == {
        "municipality": "Palmeira dos Índios", "total": 3, "valid": 2,
        "top_band": "18h–20h", "top_band_total": 2,
        "top_category": "Homicídio doloso",
    }
    assert store.mvi_analysis("mvi_cad", municipality="Igaci")["time_bands"] == [
        {"name": "20h–22h", "total": 1},
    ]
    assert store.mvi_analysis("mvi_neac")["time_bands"] == [
        {"name": "22h–00h", "total": 1},
    ]
    store.import_file("mvi_cad", "revision.csv", csv_bytes([
        cad(**{"Hora da ocorrência": "09:00"}),
    ]))
    assert store.mvi_analysis("mvi_cad")["time_bands"] == [
        {"name": "08h–10h", "total": 1},
        {"name": "18h–20h", "total": 1},
        {"name": "20h–22h", "total": 1},
    ]
