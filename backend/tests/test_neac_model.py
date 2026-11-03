import csv
import io

import pytest
import xlwt
from openpyxl import Workbook

from gtb.db.store import Store
from gtb.ingestion.adapters.normalize import normalize, pick
from gtb.ingestion.adapters.tabular import read_rows

HEADERS = ['Cidade','Bairro','Coluna1','Dia','Mês','Coluna2','Data','Coluna3',
           'Dia Semana','Coluna4','Trimestre','Ano','Hora','Período','Turno 3H',
           'Turno 6H','Vítima Antecedente','Coluna5','', 'Idade','Sexo','Nome Vítima',
           'Ambiente','', 'IML','Instrumento','Subjetividade Complementar']


def cells(year=2025, nature='Homicídio', victim='Pessoa Sintética Modelo'):
    return ['Igaci','','Bairro Sintético','3','Novembro',f'{year}-11-03','','Segunda',
            '','','4',year,'20','Noite','18-21','18-00','Não','','','30','Feminino',
            victim,'Residência','IML Sintético','','Arma de fogo',nature]


def file_bytes(kind, rows):
    output = io.BytesIO()
    if kind == 'xls':
        book = xlwt.Workbook(); sheet = book.add_sheet('Modelo')
        for r, row in enumerate([HEADERS, *rows]):
            for c, value in enumerate(row):
                sheet.write(r, c, value)
        book.save(output)
    elif kind == 'xlsx':
        book = Workbook(); sheet = book.active
        for row in [HEADERS, *rows]:
            sheet.append(row)
        book.save(output)
    else:
        text = io.StringIO(); writer = csv.writer(text, delimiter=';')
        writer.writerows([HEADERS,*rows])
        return text.getvalue().encode('utf-8')
    return output.getvalue()


@pytest.mark.parametrize('kind', ['xls','xlsx','csv'])
def test_neac_mdx_maps_shifted_fields_and_years_without_overwriting(tmp_path, kind):
    content = file_bytes(kind, [cells(2025), cells(2026), cells(2025,'Resistência com Resultado Morte','Outra Pessoa Sintética')])
    rows = read_rows('modelo.'+kind,content)
    assert pick(rows[0],'date') == '2025-11-03'
    assert pick(rows[0],'neighborhood') == 'Bairro Sintético'
    assert rows[0]['Data'] == ''
    assert rows[0]['Coluna 24'] == 'IML Sintético'
    store = Store(tmp_path/'data/gtb.duckdb')
    result = store.import_file('mvi_neac','modelo.'+kind,content)
    assert result['inserted'] == 3 and result['quarantined'] == 0
    assert store.summary(2025)['mvi_neac'] == 1
    assert store.summary(2026)['mvi_neac'] == 1
    assert store.summary()['mvi_cad'] == 0
    assert store.import_file('mvi_neac','modelo.'+kind,content)['repeated']


def test_missing_date_never_interprets_day_as_excel_serial():
    row = dict(zip(HEADERS,cells()))
    row['Coluna2'] = ''
    assert normalize('mvi_neac',row).event_date == '2025-11-03'
    row['Mês'] = ''
    with pytest.raises(ValueError,match='Data do fato'):
        normalize('mvi_neac',row)


def test_conflicting_year_or_unknown_victim_requires_review():
    row = dict(zip(HEADERS,cells()))
    row['Ano'] = '2026'
    with pytest.raises(ValueError,match='diverge'):
        normalize('mvi_neac',row)
    row['Ano'] = '2025'; row['Nome Vítima'] = 'Não identificada'
    with pytest.raises(ValueError,match='identidade confiável'):
        normalize('mvi_neac',row)


def test_upgrade_repairs_existing_mdx_dates_and_preserves_history(tmp_path):
    path = tmp_path/'data/gtb.duckdb'
    store = Store(path)
    content = file_bytes('xls',[cells()])
    store.import_file('mvi_neac','modelo.xls',content)
    with store._connect() as db:
        original_raw = db.execute("SELECT raw_json FROM record_versions WHERE source='mvi_neac'").fetchone()[0]
        db.execute("UPDATE record_versions SET natural_key='old-1900-key',event_date='1900-01-02',year=1900,nature='',category='',eligible=false WHERE source='mvi_neac'")
        db.execute("UPDATE source_types SET adapter_version='0.1.18' WHERE code='mvi_neac'")
        db.execute("UPDATE import_batches SET adapter_version='0.1.18' WHERE source='mvi_neac'")
    upgraded = Store(path)
    assert upgraded.summary(2025)['mvi_neac'] == 1
    assert upgraded.summary(1900)['mvi_neac'] == 0
    assert list((path.parent/'backups').glob('before-neac-mdx-*.duckdb'))
    with upgraded._connect() as db:
        assert db.execute("SELECT raw_json FROM record_versions WHERE source='mvi_neac'").fetchone()[0] == original_raw
    assert not upgraded.import_file('mvi_neac','modelo.xls',content)['repeated']
    assert upgraded.records('mvi_neac')['total'] == 1
    assert upgraded.import_file('mvi_neac','modelo.xls',content)['repeated']


def test_upgrade_merges_canonical_identity_preserving_versions_and_other_source(tmp_path):
    from test_imports import cad, csv_bytes
    path = tmp_path/'data/gtb.duckdb'
    store = Store(path)
    store.import_file('mvi_neac','modelo.xls',file_bytes('xls',[cells()]))
    with store._connect() as db:
        db.execute("UPDATE record_versions SET natural_key='old-key',event_date='1900-01-02',year=1900 WHERE source='mvi_neac'")
    generic = {'Data':'2025-11-03','Cidade':'Igaci','Nome Vítima':'Pessoa Sintética Modelo',
               'Idade':'30','Sexo':'Feminino','Bairro':'Bairro Sintético','Natureza':'Feminicídio'}
    store.import_file('mvi_neac','generic.csv',csv_bytes([generic]))
    store.import_file('mvi_cad','cad.csv',csv_bytes([cad()]))
    with store._connect() as db:
        db.execute("UPDATE source_types SET adapter_version='0.1.18' WHERE code='mvi_neac'")
        before = db.execute("SELECT raw_json FROM record_versions ORDER BY raw_json").fetchall()
    upgraded = Store(path)
    assert upgraded.records('mvi_neac')['total'] == 1
    assert upgraded.summary(2025)['mvi_neac'] == 1
    assert upgraded.summary(2026)['mvi_cad'] == 1
    natural_key = upgraded.records('mvi_neac')['items'][0]['natural_key']
    history = upgraded.mvi_record_versions('mvi_neac',natural_key)
    assert len(history) == 2 and history[0]['category'] == 'Feminicídio'
    with upgraded._connect() as db:
        assert db.execute("SELECT raw_json FROM record_versions ORDER BY raw_json").fetchall() == before
