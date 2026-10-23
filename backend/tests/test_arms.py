"""Contagem de armas por unidade e chave individual, com dados fictícios."""

from test_imports import csv_bytes

from gtb.db.store import Store
from gtb.indicators.arms import arm_quantity, arm_seized


def arm(**changes):
    return {"Número da ocorrência": "ARM-SYN-1", "Data": "12/01/2026",
            "Cidade": "Igaci", "Número de série": "SER-SYN-001", "Tipo": "Pistola",
            "Calibre": "9 mm", "Quantidade de armas": "2", "Situação": "Apreendida",
            "Uso": "Restrito"} | changes


def test_arm_units_seizures_and_separate_items(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    imported = store.import_file("armas", "arms.csv", csv_bytes([
        arm(), arm(**{"Número de série": "SER-SYN-002", "Tipo": "Revólver",
                     "Quantidade de armas": "1", "Situação": "Não apreendida", "Uso": "Permitido"}),
        arm(**{"Número da ocorrência": "ARM-SYN-2", "Número de série": "SER-SYN-003",
               "Cidade": "Palmeira dos Índios", "Data": "18/02/2026",
               "Tipo": "Espingarda", "Calibre": "12", "Quantidade de armas": "1",
               "Situação": "Recolhida", "Uso": "Permitido"}),
    ]))
    assert imported["inserted"] == 3
    result = store.arms_analysis()
    assert (result["total"], result["seized"], result["restricted"], result["records"]) == (4, 3, 2, 3)
    assert result["monthly"] == [{"period": "2026-01", "total": 2},
                                  {"period": "2026-02", "total": 1}]
    assert result["types"][0] == {"name": "Pistola", "total": 2}
    assert store.arms_analysis(2026, "Igaci")["total"] == 3
    assert store.arms_analysis(2025)["total"] == 0
    records = store.records("armas")["items"]
    assert len({record["natural_key"] for record in records}) == 3
    assert any(record["arm_quantity"] == 2 and record["arm_seized"] for record in records)


def test_arm_without_stable_identity_is_quarantined_and_negation_excluded(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    result = store.import_file("armas", "arms.csv", csv_bytes([
        arm(**{"Número de série": "", "Número da ocorrência": ""}),
        arm(**{"Número de série": "SER-SYN-004", "Situação": "Sem apreensão",
               "Quantidade de armas": "0"}),
    ]))
    assert result["quarantined"] == 1
    assert store.arms_analysis()["total"] == 1
    assert store.arms_analysis()["seized"] == 0
    assert not arm_seized(arm(Situação="Não foi recolhida"))
    assert arm_quantity(arm(**{"Quantidade de armas": "1500"})) == 1
