"""Carrega somente as planilhas sintéticas em um banco isolado de demonstração."""

from pathlib import Path

from gtb.db.store import Store

ROOT = Path(__file__).resolve().parents[1]
store = Store(ROOT / "data" / "demo" / "gtb.duckdb")
for source, filename in (
    ("mvi_cad", "mvi-cad.csv"),
    ("mvi_neac", "mvi-neac.csv"),
    ("ocorrencias", "ocorrencias-demo.csv"),
):
    fixture = ROOT / "fixtures" / "synthetic" / filename
    result = store.import_file(source, filename, fixture.read_bytes())
    print(f"{source}: {result['row_count']} linhas; repetido={result['repeated']}")
