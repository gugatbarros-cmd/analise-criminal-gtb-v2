import json
from pathlib import Path

from fastapi.testclient import TestClient
from test_imports import cad, csv_bytes, neac

from gtb.api import main
from gtb.db.store import Store
from gtb.reports import report_dataset
from gtb.security.local_auth import AuthManager
from gtb.sync.snapshot import build_consistent_snapshot


def test_report_projection_preserves_sources_units_and_originals(tmp_path):
    store = Store(tmp_path / 'data/gtb.duckdb')
    root = Path(__file__).resolve().parents[2]
    for source, name in [('ocorrencias', 'ocorrencias-demo.csv'), ('armas', 'armas.csv'),
                         ('drogas', 'drogas.csv'), ('guarnicoes', 'guarnicoes.csv')]:
        store.import_file(source, name, (root / 'fixtures/synthetic' / name).read_bytes())
    store.import_file('mvi_cad', 'cad.csv', csv_bytes([cad(Relato='SEGREDO-RELATO', Telefone='SEGREDO-TELEFONE')]))
    store.import_file('mvi_neac', 'neac.csv', csv_bytes([neac()]))
    with store._connect() as db:
        original = db.execute('SELECT * FROM record_versions ORDER BY source,natural_key,version').fetchall()
    dataset = report_dataset(store)
    encoded = json.dumps(dataset)
    assert 'SEGREDO-RELATO' not in encoded and 'SEGREDO-TELEFONE' not in encoded
    assert {row['source'] for row in dataset['rows']} == {'ocorrencias', 'armas', 'drogas', 'guarnicoes', 'mvi_cad', 'mvi_neac'}
    arms = [row for row in dataset['rows'] if row['source'] == 'armas']
    assert sum(row['quantity'] for row in arms if row['seized']) == store.arms_analysis()['seized']
    drugs = [row for row in dataset['rows'] if row['source'] == 'drogas']
    assert sum(row['grams'] or 0 for row in drugs) == store.drugs_analysis()['total_weight_grams']
    teams = [row for row in dataset['rows'] if row['source'] == 'guarnicoes' and row['teamGroup'] == 'roster']
    assert sum(row['points'] for row in teams) == store.teams_analysis()['weighted_points']
    for source in ('mvi_cad', 'mvi_neac'):
        assert len([row for row in dataset['rows'] if row['source'] == source and row['eligible']]) == 1
    with store._connect() as db:
        assert original == db.execute('SELECT * FROM record_versions ORDER BY source,natural_key,version').fetchall()
    assert build_consistent_snapshot(store, 'test-reports')['reports'] == dataset


def test_report_dataset_restricts_access_to_admin(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / 'auth.sqlite3')
    manager.create_user('admin', 'password-synthetic-admin', 'admin')
    manager.create_user('reader', 'password-synthetic-reader', 'viewer', actor={'username': 'admin', 'role': 'admin'})
    monkeypatch.setattr(main, 'auth_manager', manager)
    monkeypatch.setattr(main, 'store', Store(tmp_path / 'gtb.duckdb'))
    client = TestClient(main.app)
    assert client.get('/reports/dataset').status_code == 401
    for username, password, status in [('reader', 'password-synthetic-reader', 403), ('admin', 'password-synthetic-admin', 200)]:
        token = client.post('/auth/login', json={'username': username, 'password': password}).json()['token']
        response = client.get('/reports/dataset', headers={'Authorization': 'Bearer ' + token})
        assert response.status_code == status
