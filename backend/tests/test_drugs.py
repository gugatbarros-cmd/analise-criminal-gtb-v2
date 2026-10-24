"""Peso de drogas só é calculado quando a unidade é reconhecida."""

from datetime import date

import pytest
from test_imports import csv_bytes

from gtb.db.store import Store
from gtb.indicators.drugs import drug_weight_grams


def drug(**changes):
    return {"ID OCOR DESPC ENVL DROG": "DRG-SYN-001", "Data apreensão": "09/01/2026",
            "Cidade": "Igaci", "Tipo de droga": "Maconha", "Quantidade apreendida": "500",
            "Unidade de medida": "g", "Local da apreensão": "Via pública"} | changes


def test_drug_count_weight_and_coverage(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    result = store.import_file("drogas", "drugs.csv", csv_bytes([
        drug(),
        drug(**{"ID OCOR DESPC ENVL DROG": "DRG-SYN-002", "Tipo de droga": "Cocaína",
                "Quantidade apreendida": "0,5", "Unidade de medida": "kg"}),
        drug(**{"ID OCOR DESPC ENVL DROG": "DRG-SYN-003", "Tipo de droga": "Crack",
                "Quantidade apreendida": "100", "Unidade de medida": "mg",
                "Cidade": "Palmeira dos Índios", "Data apreensão": "03/03/2026"}),
        drug(**{"ID OCOR DESPC ENVL DROG": "DRG-SYN-004", "Tipo de droga": "Ecstasy",
                "Quantidade apreendida": "12", "Unidade de medida": "comprimidos"}),
    ]))
    assert result["inserted"] == 4
    analysis = store.drugs_analysis()
    assert analysis["total"] == 4
    assert analysis["weighted_records"] == 3
    assert analysis["total_weight_grams"] == 1000.1
    assert analysis["municipalities"][0] == {"name": "Igaci", "total": 3}
    assert store.drugs_analysis(2026, "Igaci")["total"] == 3
    assert store.drugs_analysis(2025)["total"] == 0
    assert len({record["natural_key"] for record in store.records("drogas")["items"]}) == 4
    assert store.drugs_analysis(month=1)["total"] == 3
    assert store.drugs_analysis(month=3)["total_weight_grams"] == 0.1
    assert store.drugs_analysis(drug_type="Cocaína")["total_weight_grams"] == 500
    assert store.records("drogas", drug_type="Cocaína")["total"] == 1
    assert store.records("drogas", start_date=date(2026, 3, 1))["total"] == 1
    with pytest.raises(ValueError, match="Data inicial"):
        store.drugs_analysis(start_date=date(2026, 4, 1), end_date=date(2026, 1, 1))


def test_unknown_unit_is_not_summed_as_grams():
    assert drug_weight_grams(drug(**{"Unidade de medida": "comprimidos"})) is None
    assert drug_weight_grams(drug(**{"Quantidade apreendida": "-5"})) is None
