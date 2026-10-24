"""Relatos sintéticos exercitam prioridade, negação e independência CAD/NEAC."""

from test_imports import cad, csv_bytes, neac

from gtb.db.store import Store
from gtb.indicators.mvi_narrative import infer_narrative_instrument


def test_narrative_ignores_negated_uncertain_and_incidental_mentions():
    assert infer_narrative_instrument({"Relato":
        "Não houve tiros, mas a vítima foi esfaqueada."}) == "Arma branca"
    assert infer_narrative_instrument({"Relato":
        "Suspeita de disparo. Uma arma de fogo foi apreendida no local."}) == "Não identificado"
    assert infer_narrative_instrument({"Relato":
        "O autor portava pistola. A vítima morreu por asfixia."}) == "Outros meios"
    assert infer_narrative_instrument({"Relato":
        "Disparou o alarme; a vítima foi atingida com faca."}) == "Arma branca"


def test_mvi_narrative_respects_structured_fields_versions_and_sources(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(**{"Instrumento empregado": "Não informado",
               "Texto do Complemento do Quimera": "Não houve tiros, mas foi esfaqueada.",
               "Relato": ""}),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Instrumento empregado": "Pistola", "Relato": "Foi esfaqueada.",
               "Texto do Complemento do Quimera": ""}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(**{"Número da ocorrência": "CAD-001", "Instrumento": "Não informado"}),
    ]))
    assert store.mvi_analysis("mvi_cad")["instruments"] == [
        {"name": "Arma branca", "total": 1}, {"name": "Arma de fogo", "total": 1},
    ]
    assert store.mvi_analysis("mvi_neac")["instruments"] == [
        {"name": "Não identificado", "total": 1},
    ]
    store.import_file("mvi_cad", "revision.csv", csv_bytes([
        cad(**{"Instrumento empregado": "Não informado",
               "Texto do Complemento do Quimera": "A vítima morreu por disparo de arma de fogo."}),
    ]))
    assert store.mvi_analysis("mvi_cad")["instruments"] == [
        {"name": "Arma de fogo", "total": 2},
    ]
