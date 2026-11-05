import json
from pathlib import Path

from fastapi.testclient import TestClient
from test_imports import cad, csv_bytes

from gtb.api import main
from gtb.comparisons import comparison_dataset
from gtb.map_location import cad_location
from gtb.db.store import Store
from gtb.security.local_auth import AuthManager


def test_comparisons_keep_current_versions_years_units_and_no_personal_identifiers(tmp_path):
    store = Store(tmp_path / 'gtb.duckdb')
    root = Path(__file__).resolve().parents[2] / 'fixtures/synthetic'
    for source, name in [('ocorrencias', 'ocorrencias-demo.csv'), ('armas', 'armas.csv'),
                         ('drogas', 'drogas.csv'), ('guarnicoes', 'guarnicoes.csv')]:
        store.import_file(source, name, (root / name).read_bytes())
    old = cad(**{'Data da ocorrência': '05/01/2025', 'Nome da vítima': 'PESSOA-SINTETICA-SECRETA', 'Relato': 'RELATO-SECRETO'})
    store.import_file('mvi_cad', '2025.csv', csv_bytes([old]))
    store.import_file('mvi_cad', '2026.csv', csv_bytes([cad()]))
    data = comparison_dataset(store)
    encoded = json.dumps(data)
    assert all(value not in encoded for value in ['PESSOA-SINTETICA-SECRETA', 'RELATO-SECRETO', 'victim', 'occurrence', 'officers', 'raw_json'])
    rows = data['rows']
    assert {row['date'][:4] for row in rows} == {'2025', '2026'}
    assert sum(row['records'] for row in rows if row['source'] == 'mvi_cad' and row['eligible']) == 2
    arms = [row for row in rows if row['source'] == 'armas' and row['eligible']]
    assert sum(row['units'] for row in arms) == store.arms_analysis()['seized']
    drugs = [row for row in rows if row['source'] == 'drogas' and row['eligible']]
    assert round(sum(row['grams'] for row in drugs), 3) == store.drugs_analysis()['total_weight_grams']
    teams = [row for row in rows if row['source'] == 'guarnicoes' and row['teamGroup'] == 'roster' and row['eligible']]
    assert sum(row['points'] for row in teams) == store.teams_analysis()['weighted_points']


def test_comparisons_require_login_and_allow_viewer_without_reports_access(tmp_path, monkeypatch):
    manager = AuthManager(tmp_path / 'auth.sqlite3')
    manager.create_user('admin', 'Admin!Synthetic1', 'admin')
    manager.create_user('reader', 'Reader!Synthetic1', 'viewer', actor={'username': 'admin', 'role': 'admin'})
    monkeypatch.setattr(main, 'auth_manager', manager)
    monkeypatch.setattr(main, 'store', Store(tmp_path / 'gtb.duckdb'))
    client = TestClient(main.app)
    assert client.get('/comparisons/dataset').status_code == 401
    token = client.post('/auth/login', json={'username': 'reader', 'password': 'Reader!Synthetic1'}).json()['token']
    headers = {'Authorization': 'Bearer ' + token}
    assert client.get('/comparisons/dataset', headers=headers).json()['rows'] == []
    assert client.get('/reports/dataset', headers=headers).status_code == 403


def test_cad_map_location_uses_only_valid_imported_coordinates_and_address(tmp_path):
    assert cad_location({'Latitude': '-9,53690', 'Longitude': '-36,63380', 'Endereço': 'Rua Sintética, 100', 'Bairro': 'Centro'}) == {
        'address': 'Rua Sintética, 100, Centro', 'latitude': -9.5369, 'longitude': -36.6338}
    assert cad_location({'Coordenadas': '-9.53690, -36.63380'})['latitude'] == -9.5369
    assert cad_location({'Latitude': '-1', 'Longitude': '-1'})['latitude'] is None
    assert cad_location({'Endereço Ocorrência': 'Rua Sintética', 'Nº do Endereço': '100',
                         'Bairro Ocorrência': 'Centro', 'Endereço do Envolvido': 'Não usar'})['address'] == 'Rua Sintética, 100, Centro'
    store = Store(tmp_path / 'gtb.duckdb')
    row = cad(**{'Latitude': '-9,53690', 'Longitude': '-36,63380', 'Endereço': 'Rua Sintética, 100', 'Bairro': 'Centro'})
    store.import_file('mvi_cad', 'cad-geografico.csv', csv_bytes([row]))
    facts = [item for item in comparison_dataset(store)['rows'] if item['source'] == 'mvi_cad']
    assert len(facts) == 1
    assert facts[0]['address'] == 'Rua Sintética, 100, Centro'
    assert (facts[0]['latitude'], facts[0]['longitude']) == (-9.5369, -36.6338)
    assert 'Nome da vítima' not in json.dumps(facts)
