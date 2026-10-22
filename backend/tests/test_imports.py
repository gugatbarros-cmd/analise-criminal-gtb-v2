import csv
import io
from pathlib import Path

from openpyxl import Workbook

from gtb.db.store import Store


def csv_bytes(rows: list[dict[str, str]], delimiter: str = ";") -> bytes:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0]), delimiter=delimiter)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8-sig")


def cad(**overrides: str) -> dict[str, str]:
    return {
        "Número da ocorrência": "CAD-001",
        "Data da ocorrência": "05/01/2026",
        "Cidade ocorrência": "Palmeira dos Índios",
        "Tipificação no despacho": "Homicídio doloso",
        "Nome da vítima": "Maria Aparecida Silva",
        "Nº NIC": "NIC-111",
        "Envolvimento": "Vítima",
        "Óbito?": "S",
    } | overrides


def neac(**overrides: str) -> dict[str, str]:
    return {
        "Número da ocorrência": "CAD-001",
        "Data": "05/01/2026",
        "Cidade": "Palmeira dos Índios",
        "Natureza": "Homicídio doloso",
        "Nome Vítima": "Maria Aparecida Silva",
    } | overrides


def test_sources_independent_and_idempotent(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    cad_data = csv_bytes([
        cad(),
        cad(**{"Nome da vítima": "Ana Paula Souza", "Nº NIC": "NIC-222"}),
        cad(**{"Nome da vítima": "Pedro Santos", "Nº NIC": "NIC-333", "Envolvimento": "Autor"}),
        cad(**{"Número da ocorrência": "CAD-002", "Óbito?": "N"}),
    ])
    first = store.import_file("mvi_cad", "cad.csv", cad_data)
    assert first["inserted"] == 4
    assert store.summary()["mvi_cad"] == 2
    assert store.import_file("mvi_cad", "cad.csv", cad_data)["repeated"] is True
    assert store.summary()["mvi_cad"] == 2

    neac_data = csv_bytes([
        neac(),
        neac(**{"Número da ocorrência": "N-002", "Natureza": "Resistência com Resultado Morte"}),
    ])
    store.import_file("mvi_neac", "neac.csv", neac_data)
    assert store.summary()["mvi_cad"] == 2
    assert store.summary()["mvi_neac"] == 1
    assert store.records("mvi_neac")["total"] == 2


def test_retification_history_and_preimport_backup(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "old.csv", csv_bytes([cad()]))
    revised = store.import_file("mvi_cad", "revised.csv", csv_bytes([
        cad(**{"Tipificação no despacho": "Feminicídio"})
    ]))
    assert revised["updated"] == 1
    assert store.summary()["categories"]["mvi_cad"] == {"Feminicídio": 1}
    assert list((tmp_path / "data" / "backups").glob("*.duckdb"))
    with store._connect() as db:
        versions = db.execute("""SELECT version, is_current FROM record_versions
            WHERE source = 'mvi_cad' ORDER BY version""").fetchall()
        backup = Path(db.execute("SELECT backup_path FROM import_batches WHERE id = ?",
                                 [revised["id"]]).fetchone()[0])
    assert versions == [(1, False), (2, True)]
    saved = store.restore_backup(backup)
    assert saved.exists()
    assert store.summary()["categories"]["mvi_cad"] == {"Homicídio doloso": 1}


def test_quarantine_and_complete_import_never_delete(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "first.csv", csv_bytes([
        cad(), cad(**{"Número da ocorrência": "CAD-002"})
    ]))
    report = store.import_file("mvi_cad", "complete.csv", csv_bytes([
        cad(), cad(**{"Número da ocorrência": "", "Nº NIC": "NIC-999"})
    ]), scope="complete")
    assert report["quarantined"] == 1
    assert report["differences"] == 1
    assert len(store.divergences(report["id"])) == 1
    assert store.records("mvi_cad")["total"] == 2
    assert store.summary()["mvi_cad"] == 2


def test_xlsx_excel_dates_and_legacy_occurrence_indicators(tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Número da ocorrência", "Data da ocorrência", "Cidade ocorrência", "Natureza"])
    sheet.append(["O-1", 46027, "Igaci", "Roubo consumado"])
    sheet.append(["O-2", "06/01/2026", "Igaci", "Tentativa de homicídio"])
    sheet.append(["O-3", "07/01/2026", "Igaci", "Latrocínio"])
    output = io.BytesIO()
    workbook.save(output)
    store = Store(tmp_path / "data" / "gtb.duckdb")
    report = store.import_file("ocorrencias", "synthetic.xlsx", output.getvalue())
    assert report["inserted"] == 3
    summary = store.summary()
    assert summary["cvp"] == 1
    assert summary["tentativas"] == 1


def test_invalid_extension_does_not_write_batch(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    try:
        store.import_file("mvi_cad", "bad.exe", b"not a spreadsheet")
    except ValueError as error:
        assert "Formato aceito" in str(error)
    else:
        raise AssertionError("Invalid extension accepted")
    assert store.batches() == []


def test_neac_without_occurrence_requires_context(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    valid = neac(**{"Número da ocorrência": "", "Idade": "31"})
    invalid = neac(**{"Número da ocorrência": "", "Nome Vítima": "Outra Pessoa"})
    report = store.import_file("mvi_neac", "neac.csv", csv_bytes([valid, invalid]))
    assert report["inserted"] == 1
    assert report["quarantined"] == 1
    assert store.summary()["mvi_neac"] == 1


def test_homonym_conflict_is_quarantined(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    first = cad(**{"Nº NIC": "", "Idade": "31"})
    second = cad(**{"Nº NIC": "", "Idade": "52"})
    store.import_file("mvi_cad", "first.csv", csv_bytes([first]))
    report = store.import_file("mvi_cad", "second.csv", csv_bytes([second]))
    assert report["updated"] == 0
    assert report["quarantined"] == 1


def test_documented_synthetic_fixtures(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    fixtures = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"
    for source, filename in (("mvi_cad", "mvi-cad.csv"), ("mvi_neac", "mvi-neac.csv"),
                             ("ocorrencias", "ocorrencias.csv")):
        store.import_file(source, filename, (fixtures / filename).read_bytes())
    summary = store.summary(year=2026)
    assert (summary["mvi_cad"], summary["mvi_neac"], summary["cvp"], summary["tentativas"]) == (
        2, 1, 1, 1
    )
