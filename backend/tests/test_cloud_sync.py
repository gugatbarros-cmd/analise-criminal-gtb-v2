import gzip
import json
from pathlib import Path

import pytest

from gtb.db.store import Store
from gtb.sync import cloud
from gtb.sync.snapshot import build_snapshot, build_consistent_snapshot


def test_snapshot_keeps_all_pages_and_exact_indicator_totals(tmp_path):
    store = Store(tmp_path / 'test.duckdb')
    csv = 'Número da ocorrência,Data,Cidade,Natureza\n' + ''.join(
        f'SYNTH-{i},05/01/2026,Igaci,Roubo consumado\n' for i in range(105))
    store.import_file('ocorrencias', 'synthetic.csv', csv.encode())
    snapshot = build_snapshot(store, 'test-version')
    assert len(snapshot['records']['ocorrencias']) == 105
    assert snapshot['views']['2026|*']['summary'] == store.summary(2026, bpm_only=True)
    assert snapshot['views']['2026|igaci']['tco'] == store.tco_analysis(2026, 'Igaci')
    assert snapshot['auditLocalOnly'] is True
    assert snapshot['audit'] == {}
    assert 'password' not in json.dumps(snapshot, default=str)


class SyntheticStore:
    def __init__(self):
        self.batch = 'synthetic-batch-1'

    def batches(self):
        return [{'id': self.batch, 'imported_at': '2026-10-29'}]


def configured(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(cloud, 'protect', lambda value, decrypt=False: value)
    monkeypatch.setattr(cloud, 'build_snapshot', lambda store, version: {
        'version': version, 'records': {'ocorrencias': [{'occurrence': store.batch}]}})
    sync = cloud.CloudSync(SyntheticStore(), tmp_path, 'test-version')
    sync.credential.write_bytes(b'synthetic-refresh')
    sync.state['email'] = 'synthetic@example.test'
    def request(url, payload=None, token=None, method=None):
        calls.append((url, payload, token))
        if 'securetoken' in url:
            return {'id_token': 'synthetic-id', 'refresh_token': 'synthetic-rotated'}
        if url.endswith(':commit'):
            return {}
        return None
    monkeypatch.setattr(cloud, 'request_json', request)
    return sync, calls


def test_sync_is_atomic_authenticated_and_repeated_only_after_change(tmp_path, monkeypatch):
    sync, calls = configured(tmp_path, monkeypatch)
    sync.sync_once()
    commit = [call for call in calls if call[0].endswith(':commit')][0]
    assert commit[2] == 'synthetic-id'
    writes = commit[1]['writes']
    assert len(writes) == 2
    assert writes[-1]['update']['name'].endswith('/sharedBases/gtb2-online')
    assert writes[-1]['currentDocument'] == {'exists': False}
    assert writes[-1]['updateTransforms'][0]['setToServerValue'] == 'REQUEST_TIME'
    content = writes[0]['update']['fields']['content']['stringValue']
    import base64
    assert json.loads(gzip.decompress(base64.b64decode(content)))['records']['ocorrencias'][0]['occurrence'] == 'synthetic-batch-1'
    assert sync.state['status'] == 'synced'
    assert sync.credential.read_bytes() == b'synthetic-rotated'
    previous = len(calls)
    sync.sync_once()
    assert len(calls) == previous  # nenhuma leitura periódica sem mudança local
    sync.store.batch = 'synthetic-batch-2'
    sync.sync_once()
    assert len([call for call in calls if call[0].endswith(':commit')]) == 2


def test_failure_preserves_pending_data_and_disconnect_stops_remote_calls(tmp_path, monkeypatch):
    sync, calls = configured(tmp_path, monkeypatch)
    normal = cloud.request_json
    def fail(url, *args, **kwargs):
        if url.endswith(':commit'):
            raise ValueError('Cota gratuita indisponível')
        return normal(url, *args, **kwargs)
    monkeypatch.setattr(cloud, 'request_json', fail)
    with pytest.raises(ValueError, match='Cota gratuita'):
        sync.sync_once()
    assert not sync.state.get('signature')
    assert not sync.busy
    sync.disconnect()
    previous = len(calls)
    sync.sync_once()
    assert len(calls) == previous
    assert not sync.credential.exists()


def test_dpapi_round_trip_on_windows():
    import sys
    if sys.platform != 'win32':
        pytest.skip('DPAPI disponível apenas no Windows')
    protected = cloud.protect(b'synthetic-credential-only')
    assert protected != b'synthetic-credential-only'
    assert cloud.protect(protected, decrypt=True) == b'synthetic-credential-only'


def test_export_uses_copy_and_releases_origin_before_analysis(tmp_path, monkeypatch):
    import gtb.sync.snapshot as module
    store = Store(tmp_path / 'origin.duckdb')
    def inspect(copy, version):
        assert copy.path != store.path
        assert copy.path.exists()
        assert not store.lock._is_owned()
        assert version == 'synthetic'
        return {'version': version}
    monkeypatch.setattr(module, 'build_snapshot', inspect)
    assert build_consistent_snapshot(store, 'synthetic') == {'version': 'synthetic'}
    assert not list(tmp_path.glob('gtb-online-*'))


def test_replacement_uses_precondition_and_deletes_previous_chunks_atomically(tmp_path, monkeypatch):
    sync, calls = configured(tmp_path, monkeypatch)
    normal = cloud.request_json
    def existing(url, *args, **kwargs):
        if url == cloud.ROOT:
            return {'updateTime': '2026-10-29T12:00:00Z', 'fields': {
                'generation': {'stringValue': 'gtb2-synthetic-old'},
                'chunkCount': {'integerValue': '2'}}}
        return normal(url, *args, **kwargs)
    monkeypatch.setattr(cloud, 'request_json', existing)
    sync.sync_once()
    writes = [call for call in calls if call[0].endswith(':commit')][0][1]['writes']
    assert writes[1]['currentDocument'] == {'updateTime': '2026-10-29T12:00:00Z'}
    assert writes[2:] == [{'delete': cloud.DOCUMENT + '/chunks/gtb2-synthetic-old-0'},
                          {'delete': cloud.DOCUMENT + '/chunks/gtb2-synthetic-old-1'}]


def test_refresh_transport_uses_documented_form_encoding(monkeypatch):
    from io import BytesIO
    def transport(request, timeout):
        assert request.get_header('Content-type') == 'application/x-www-form-urlencoded'
        assert request.data == b'grant_type=refresh_token&refresh_token=synthetic%2Bvalue'
        return BytesIO(b'{"id_token":"synthetic"}')
    monkeypatch.setattr(cloud, 'urlopen', transport)
    result = cloud.request_json('https://securetoken.googleapis.com/v1/token?key=synthetic',
        {'grant_type': 'refresh_token', 'refresh_token': 'synthetic+value'})
    assert result['id_token'] == 'synthetic'
