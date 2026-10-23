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
    assert not list((tmp_path / "data" / "raw").glob("stage-*"))


def test_staged_import_preserves_original_text_with_quotes_and_newlines(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    relato = 'A vítima disse "faca"; depois\nretificou o relato.'
    row = cad(Relato=relato)
    store.import_file("mvi_cad", "texto.csv", csv_bytes([row]))
    natural_key = store.records("mvi_cad")["items"][0]["natural_key"]
    assert store.mvi_record_detail("mvi_cad", natural_key)["fields"]["Relato"] == relato
    assert not list((tmp_path / "data" / "raw").glob("stage-*"))


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


def test_cvp_classification_and_filtered_occurrences(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data da ocorrência": "05/01/2026", "Cidade": "Igaci"}
    rows = [
        base | {"Número da ocorrência": "1", "Natureza": "Roubo consumado",
                "Indicador criminal": "CVP"},
        base | {"Número da ocorrência": "2", "Natureza": "Roubo tentado",
                "Indicador criminal": "CVP"},
        base | {"Número da ocorrência": "3", "Natureza": "Furto",
                "Indicador criminal": ""},
        base | {"Número da ocorrência": "4", "Natureza": "Roubo seguido de morte",
                "Indicador criminal": "CVP"},
        base | {"Número da ocorrência": "5", "Natureza": "Furto",
                "Indicador criminal": "CVP"},
    ]
    store.import_file("ocorrencias", "cvp.csv", csv_bytes(rows))
    summary = store.summary(year=2026, municipality="Igaci")
    assert summary["cvp"] == 3
    assert summary["categories"]["ocorrencias"] == {"CVP Consumado": 2, "CVP Tentado": 1}
    assert store.records("ocorrencias", category_prefix="CVP ")["total"] == 3
    assert store.records("ocorrencias", category_prefix="CVP Tentado")["total"] == 1
    assert store.records("ocorrencias", municipality="Outra", category_prefix="CVP ")["total"] == 0


def test_previous_import_is_reclassified_with_backup(tmp_path):
    path = tmp_path / "data" / "gtb.duckdb"
    store = Store(path)
    row = {"Número da ocorrência": "1", "Data": "05/01/2026", "Cidade": "Igaci",
           "Natureza": "Roubo tentado"}
    store.import_file("ocorrencias", "old.csv", csv_bytes([row]))
    with store._connect() as db:
        db.execute("UPDATE source_types SET adapter_version = '0.1.3'")
        db.execute("UPDATE record_versions SET category = 'CVP Consumado'")
    upgraded = Store(path)
    assert upgraded.summary()["categories"]["ocorrencias"] == {"CVP Tentado": 1}
    assert list((tmp_path / "data" / "backups").glob("before-adapter-*.duckdb"))


def test_attempts_use_narrative_and_discarded_solution(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data": "05/01/2026", "Cidade": "Igaci"}
    rows = [
        base | {"Número da ocorrência": "1", "Natureza": "Lesão corporal",
                "Relato": "O autor tentou matar a vítima", "Solução": ""},
        base | {"Número da ocorrência": "2", "Natureza": "Tentativa de feminicídio",
                "Relato": "", "Solução": "Fato não constatado"},
        base | {"Número da ocorrência": "3", "Natureza": "Tentativa de homicídio",
                "Relato": "Hipótese descartada, sem indícios", "Solução": ""},
        base | {"Número da ocorrência": "4", "Natureza": "Homicídio tentado",
                "Relato": "", "Solução": "Atendimento confirmado"},
        base | {"Número da ocorrência": "5", "Natureza": "Roubo tentado",
                "Relato": "", "Solução": ""},
    ]
    store.import_file("ocorrencias", "attempts.csv", csv_bytes(rows))
    assert store.summary()["tentativas"] == 2
    page = store.records("ocorrencias", category_prefix="Tentativa de homicídio")
    assert {item["occurrence"] for item in page["items"]} == {"1", "4"}
    assert {item["solution"] for item in page["items"]} == {"", "Atendimento confirmado"}


def test_previous_occurrences_gain_narrative_attempt_after_upgrade(tmp_path):
    path = tmp_path / "data" / "gtb.duckdb"
    store = Store(path)
    row = {"Número da ocorrência": "1", "Data": "05/01/2026", "Cidade": "Igaci",
           "Natureza": "Lesão corporal", "Relato": "Tentou matar a vítima"}
    store.import_file("ocorrencias", "old.csv", csv_bytes([row]))
    with store._connect() as db:
        db.execute("UPDATE source_types SET adapter_version = '0.1.4'")
        db.execute("UPDATE record_versions SET category = ''")
    upgraded = Store(path)
    assert upgraded.summary()["tentativas"] == 1
    assert len(list((tmp_path / "data" / "backups").glob("before-adapter-*.duckdb"))) == 1


def test_tco_status_and_overlapping_indicators(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data": "05/01/2026", "Cidade": "Igaci"}
    rows = [
        base | {"Número da ocorrência": "1", "Natureza": "Perturbação do sossego",
                "Solução da Ocorrência": "ELABOROU TCO (PM)"},
        base | {"Número da ocorrência": "2", "Natureza": "Roubo consumado",
                "Solução da Ocorrência": "ELABOROU TCO - PM"},
        base | {"Número da ocorrência": "3", "Natureza": "Tentativa de homicídio",
                "Solução da Ocorrência": "Elaborou TCO PM"},
        base | {"Número da ocorrência": "4", "Natureza": "Perturbação do sossego",
                "Solução da Ocorrência": "NÃO ELABOROU TCO (PM)"},
        base | {"Número da ocorrência": "5", "Natureza": "Perturbação do sossego",
                "Solução da Ocorrência": "TCO pendente"},
    ]
    store.import_file("ocorrencias", "tco.csv", csv_bytes(rows))
    summary = store.summary(year=2026, municipality="Igaci")
    assert (summary["tco"], summary["cvp"], summary["tentativas"]) == (3, 1, 1)
    tco_rows = store.records("ocorrencias", indicator="TCO")
    assert {item["occurrence"] for item in tco_rows["items"]} == {"1", "2", "3"}
    assert store.records("ocorrencias", indicator="CVP")["total"] == 1
    assert store.records("ocorrencias", indicator="Tentativa de homicídio")["total"] == 1
    assert store.records("ocorrencias", year=2025, indicator="TCO")["total"] == 0


def test_upgrade_adds_indicator_column_after_backup(tmp_path):
    path = tmp_path / "data" / "gtb.duckdb"
    store = Store(path)
    row = {"Número da ocorrência": "1", "Data": "05/01/2026", "Cidade": "Igaci",
           "Natureza": "Roubo", "Solução": "ELABOROU TCO (PM)"}
    store.import_file("ocorrencias", "old.csv", csv_bytes([row]))
    with store._connect() as db:
        db.execute("ALTER TABLE record_versions DROP COLUMN indicators")
        db.execute("UPDATE source_types SET adapter_version = '0.1.5'")
    upgraded = Store(path)
    assert upgraded.summary()["tco"] == 1
    assert upgraded.summary()["cvp"] == 1
    assert upgraded.records("ocorrencias", indicator="TCO")["total"] == 1
    assert list((tmp_path / "data" / "backups").glob("before-adapter-*.duckdb"))


def test_tco_month_city_and_nature_follow_master_filters(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    rows = [
        {"Número da ocorrência": "1", "Data": "05/01/2026", "Cidade": "Igaci",
         "Natureza": "Perturbação do sossego", "Solução": "ELABOROU TCO (PM)"},
        {"Número da ocorrência": "2", "Data": "06/02/2026", "Cidade": "Igaci",
         "Natureza": "Perturbação do sossego", "Solução": "ELABOROU TCO (PM)"},
        {"Número da ocorrência": "3", "Data": "07/02/2026", "Cidade": "Palmeira dos Índios",
         "Natureza": "Ameaça", "Solução": "ELABOROU TCO (PM)"},
        {"Número da ocorrência": "4", "Data": "08/01/2025", "Cidade": "Igaci",
         "Natureza": "Ameaça", "Solução": "ELABOROU TCO (PM)"},
        {"Número da ocorrência": "5", "Data": "09/02/2026", "Cidade": "Igaci",
         "Natureza": "Roubo", "Solução": "NÃO ELABOROU TCO (PM)"},
    ]
    store.import_file("ocorrencias", "tco-trend.csv", csv_bytes(rows))
    all_years = store.tco_analysis()
    assert all_years["total"] == 4
    assert all_years["monthly"] == [
        {"period": "2025-01", "total": 1},
        {"period": "2026-01", "total": 1},
        {"period": "2026-02", "total": 2},
    ]
    filtered = store.tco_analysis(year=2026, municipality="Igaci")
    assert filtered["total"] == store.summary(year=2026, municipality="Igaci")["tco"] == 2
    assert filtered["monthly"] == [
        {"period": "2026-01", "total": 1}, {"period": "2026-02", "total": 1}
    ]
    assert filtered["municipalities"] == [{"name": "Igaci", "total": 2}]
    assert filtered["natures"] == [{"name": "Perturbação do sossego", "total": 2}]


def test_mvi_distributions_keep_cad_and_neac_independent(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(**{"Cidade ocorrência": "Igaci"}),
        cad(**{"Cidade ocorrência": "Igaci", "Nome da vítima": "Ana Paula Souza",
               "Nº NIC": "NIC-222", "Tipificação no despacho": "Feminicídio"}),
        cad(**{"Número da ocorrência": "CAD-2025", "Data da ocorrência": "05/01/2025",
               "Nº NIC": "NIC-333", "Cidade ocorrência": "Palmeira dos Índios"}),
        cad(**{"Número da ocorrência": "CAD-AUTOR", "Nº NIC": "NIC-444",
               "Envolvimento": "Autor", "Cidade ocorrência": "Igaci"}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(Cidade="Igaci"),
        neac(**{"Número da ocorrência": "N-2025", "Data": "05/01/2025",
                "Cidade": "Tanque d Arca", "Natureza": "Latrocínio"}),
    ]))
    cad_analysis = store.mvi_analysis("mvi_cad")
    neac_analysis = store.mvi_analysis("mvi_neac")
    assert (cad_analysis["total"], neac_analysis["total"]) == (3, 2)
    assert cad_analysis["yearly"] == [
        {"year": 2025, "total": 1}, {"year": 2026, "total": 2}
    ]
    assert cad_analysis["classifications"] == [
        {"name": "Homicídio doloso", "total": 2}, {"name": "Feminicídio", "total": 1}
    ]
    assert neac_analysis["classifications"] == [
        {"name": "Homicídio doloso", "total": 1}, {"name": "Latrocínio", "total": 1}
    ]
    assert store.mvi_analysis("mvi_cad", year=2026, municipality="Igaci")["total"] == 2
    assert store.mvi_analysis("mvi_neac", year=2026, municipality="Igaci")["total"] == 1
    assert store.mvi_analysis("mvi_neac", municipality="Tanque d'Arca")[
        "municipalities"] == [{"name": "Tanque d'Arca", "total": 1}]


def test_mvi_declared_instruments_respect_source_filters_and_revisions(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(**{"Instrumento empregado": "Outros meios",
               "Tipo de agressão sofrida": "Revólver"}),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Instrumento empregado": "Não informado", "Tipo de agressão sofrida": ""}),
        cad(**{"Número da ocorrência": "CAD-003", "Nº NIC": "NIC-333",
               "Cidade ocorrência": "Igaci", "Instrumento empregado": "Faca",
               "Tipo de agressão sofrida": ""}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([
        neac(Instrumento="Asfixia"),
        neac(**{"Número da ocorrência": "N-002", "Instrumento": "Pistola"}),
    ]))
    assert store.mvi_analysis("mvi_cad")["instruments"] == [
        {"name": "Arma branca", "total": 1},
        {"name": "Arma de fogo", "total": 1},
        {"name": "Não identificado", "total": 1},
    ]
    assert store.mvi_analysis("mvi_neac")["instruments"] == [
        {"name": "Arma de fogo", "total": 1}, {"name": "Outros meios", "total": 1},
    ]
    assert store.mvi_analysis("mvi_cad", municipality="Igaci")["instruments"] == [
        {"name": "Arma branca", "total": 1},
    ]
    store.import_file("mvi_cad", "retificacao.csv", csv_bytes([
        cad(**{"Instrumento empregado": "Faca"}),
    ]))
    assert store.mvi_analysis("mvi_cad")["instruments"] == [
        {"name": "Arma branca", "total": 2}, {"name": "Não identificado", "total": 1},
    ]
    records = store.records("mvi_cad")["items"]
    assert next(item for item in records if item["occurrence"] == "CAD-001")[
        "instrument"] == "Arma branca"


def test_mvi_monthly_and_weekday_profiles_remain_source_specific(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([
        cad(),
        cad(**{"Número da ocorrência": "CAD-002", "Nº NIC": "NIC-222",
               "Data da ocorrência": "01/02/2026", "Cidade ocorrência": "Igaci"}),
    ]))
    store.import_file("mvi_neac", "neac.csv", csv_bytes([neac()]))
    cad_profile = store.mvi_analysis("mvi_cad")
    neac_profile = store.mvi_analysis("mvi_neac")
    assert cad_profile["monthly"] == [
        {"period": "2026-01", "total": 1}, {"period": "2026-02", "total": 1},
    ]
    assert cad_profile["weekdays"][0] == {"name": "Domingo", "total": 1}
    assert cad_profile["weekdays"][1] == {"name": "Segunda-feira", "total": 1}
    assert neac_profile["monthly"] == [{"period": "2026-01", "total": 1}]
    assert neac_profile["weekdays"][0]["total"] == 0
    assert neac_profile["weekdays"][1]["total"] == 1
    assert store.mvi_analysis("mvi_cad", municipality="Igaci")["monthly"] == [
        {"period": "2026-02", "total": 1},
    ]


def test_warrants_and_visits_are_independent_auditable_occurrence_flags(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data": "05/01/2026", "Cidade": "Igaci", "Natureza": "",
            "Solução": "", "Relato": "", "Nome": ""}
    rows = [
        base | {"Número da ocorrência": "1", "Natureza": "Cumprimento de mandado"},
        base | {"Número da ocorrência": "2", "Natureza": "Visita preventiva"},
        base | {"Número da ocorrência": "3", "Natureza": "Cumprimento de mandado",
                "Relato": "Visita orientativa realizada", "Solução": "Elaborou TCO PM"},
        base | {"Número da ocorrência": "4", "Natureza": "Mandado pendente"},
        base | {"Número da ocorrência": "5", "Natureza": "Visita preventiva",
                "Solução": "Não realizada"},
        base | {"Número da ocorrência": "6", "Cidade": "Palmeira dos Índios",
                "Natureza": "Mandado de prisão", "Relato": "Preso após ordem judicial"},
        base | {"Número da ocorrência": "7", "Data": "05/01/2025",
                "Natureza": "Visita comunitária"},
        base | {"Número da ocorrência": "8", "Nome": "Visita Orientativa",
                "Natureza": "Atendimento comum"},
    ]
    store.import_file("ocorrencias", "operacoes.csv", csv_bytes(rows))
    summary = store.summary()
    assert (summary["mandados"], summary["visitas"], summary["tco"]) == (3, 3, 1)
    mandados = store.records("ocorrencias", indicator="Mandados")
    visitas = store.records("ocorrencias", indicator="Visitas")
    assert {item["occurrence"] for item in mandados["items"]} == {"1", "3", "6"}
    assert {item["occurrence"] for item in visitas["items"]} == {"2", "3", "7"}
    both = next(item for item in mandados["items"] if item["occurrence"] == "3")
    assert both["indicators"] == ["TCO", "Mandados", "Visitas"]
    assert "cumprimento" in both["action_evidence"].lower()
    filtered = store.operational_analysis("Mandados", 2026, "Igaci")
    assert filtered["total"] == 2
    assert filtered["monthly"] == [{"period": "2026-01", "total": 2}]
    assert filtered["municipalities"] == [{"name": "Igaci", "total": 2}]
    assert filtered["natures"] == [{"name": "Cumprimento de mandado", "total": 2}]
    assert store.operational_analysis("Visitas", 2026, "Igaci")["total"] == 2
    assert store.operational_analysis("Visitas", 2025)["total"] == 1


def test_adapter_upgrade_reclassifies_old_operational_records(tmp_path):
    path = tmp_path / "data" / "gtb.duckdb"
    store = Store(path)
    store.import_file("ocorrencias", "old.csv", csv_bytes([{
        "Número da ocorrência": "A-1", "Data": "05/01/2026", "Cidade": "Igaci",
        "Natureza": "Visita orientativa", "Relato": "Cumprimento de mandado",
    }]))
    with store._connect() as db:
        db.execute("UPDATE source_types SET adapter_version = '0.1.6'")
        db.execute("UPDATE record_versions SET indicators = []")
    upgraded = Store(path)
    assert (upgraded.summary()["mandados"], upgraded.summary()["visitas"]) == (1, 1)
    assert list((tmp_path / "data" / "backups").glob("before-adapter-*.duckdb"))


def test_disturbance_uses_classification_and_discards_negative_solution(tmp_path):
    store = Store(tmp_path / "data" / "gtb.duckdb")
    base = {"Data": "05/01/2026", "Cidade": "Igaci", "Natureza": "",
            "Solução": "", "Relato": ""}
    rows = [
        base | {"Número da ocorrência": "1", "Natureza": "Perturbação do sossego",
                "Solução": "Elaborou TCO PM"},
        base | {"Número da ocorrência": "2", "Natureza": "Perturbação do trabalho"},
        base | {"Número da ocorrência": "3", "Natureza": "Ameaça",
                "Relato": "Houve perturbação do sossego"},
        base | {"Número da ocorrência": "4", "Natureza": "Perturbação da tranquilidade",
                "Solução": "Fato não constatado"},
        base | {"Número da ocorrência": "5", "Data": "05/01/2025",
                "Natureza": "Perturbação do descanso"},
    ]
    store.import_file("ocorrencias", "sossego.csv", csv_bytes(rows))
    assert store.summary()["sossego"] == 3
    cases = store.records("ocorrencias", indicator="Sossego")
    assert {item["occurrence"] for item in cases["items"]} == {"1", "2", "5"}
    assert "Sossego" in next(item for item in cases["items"]
                             if item["occurrence"] == "1")["indicators"]
    assert store.operational_analysis("Sossego", 2026, "Igaci")["total"] == 2
    assert store.operational_analysis("Sossego", 2025)["monthly"] == [
        {"period": "2025-01", "total": 1},
    ]
