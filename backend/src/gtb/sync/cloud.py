"""Publicação autenticada no Firestore Spark, isolada das bases do legado."""
import base64
import gzip
import hashlib
import json
import os
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from gtb.sync.snapshot import build_consistent_snapshot as build_snapshot

API_KEY = 'AIzaSyCh4pw9HsXVEz7RbIq_Ee5v7oGWxC66qnM'
PROJECT = 'analisecriminalgtb'
DOCUMENT = f'projects/{PROJECT}/databases/(default)/documents/sharedBases/gtb2-online'
ROOT = f'https://firestore.googleapis.com/v1/{DOCUMENT}'
AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY


def request_json(url, payload=None, token=None, method=None):
    headers = {'Content-Type': 'application/json'}
    form = url.startswith('https://securetoken.googleapis.com/')
    if form:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = None if payload is None else (urlencode(payload) if form else json.dumps(payload)).encode()
    request = Request(url, body,
                      headers, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 429:
            raise ValueError('Cota gratuita indisponível. O envio será tentado depois; nenhum plano pago será ativado.') from None
        if error.code in (401, 403):
            raise ValueError('Acesso online recusado. Conecte uma conta autorizada do sistema antigo.') from None
        if error.code == 404:
            return None
        raise ValueError(f'Serviço online indisponível (HTTP {error.code}).') from None


def protect(value: bytes, decrypt=False) -> bytes:
    """DPAPI do Windows: credencial vinculada ao usuário, sem guardar a senha."""
    import ctypes
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]
    buffer = ctypes.create_string_buffer(value)
    source = Blob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    target = Blob()
    if decrypt:
        ok = ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(source), None,
            None, None, None, 1, ctypes.byref(target))
    else:
        ok = ctypes.windll.crypt32.CryptProtectData(ctypes.byref(source), ctypes.c_wchar_p('GTB2'),
            None, None, None, 1, ctypes.byref(target))
    if not ok:
        raise OSError('Não foi possível proteger a credencial online neste Windows.')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


class CloudSync:
    def __init__(self, store, directory: Path, version: str):
        self.store, self.directory, self.version = store, directory, version
        self.credential = directory / 'online-credential.dpapi'
        self.state_file = directory / 'online-state.json'
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.started = False
        self.busy = False
        self.epoch = 0
        self.state = {'status': 'not_configured', 'message': 'Conecte sua conta para sincronizar.'}
        if self.state_file.exists():
            self.state.update(json.loads(self.state_file.read_text('utf-8')))

    def status(self):
        return self.state | {'configured': self.credential.exists(), 'busy': self.busy,
            'version': self.version, 'url': 'https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/'}

    def save_state(self, **values):
        self.state.update(values)
        temporary = self.state_file.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.state, ensure_ascii=False), 'utf-8')
        os.replace(temporary, self.state_file)

    def start(self):
        with self.lock:
            if self.started:
                return
            self.started = True
        threading.Thread(target=self.run, daemon=True, name='gtb-online-sync').start()

    def connect(self, email, password):
        session = request_json(AUTH, {'email': email.strip(), 'password': password,
                                      'returnSecureToken': True})
        # A leitura também verifica permissão nas regras existentes do Firestore.
        request_json(ROOT, token=session['idToken'])
        if session['email'].lower() != 'gugatbarros@hotmail.com':
            profile = request_json(f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/users/{session["localId"]}', token=session['idToken'])
            fields = (profile or {}).get('fields', {})
            if fields.get('status', {}).get('stringValue') != 'active' or fields.get('role', {}).get('stringValue') != 'analyst':
                raise ValueError('A conta deve ser administradora ou analista ativa para enviar dados.')
        with self.lock:
            self.epoch += 1
            temporary = self.credential.with_suffix('.tmp')
            temporary.write_bytes(protect(session['refreshToken'].encode()))
            os.replace(temporary, self.credential)
            self.save_state(status='pending', email=session['email'], signature='',
                            message='Conectado. Preparando a primeira sincronização.')
        self.start()
        self.wake.set()

    def disconnect(self):
        with self.lock:
            self.epoch += 1
            self.credential.unlink(missing_ok=True)
            self.save_state(status='not_configured', email='', signature='',
                            message='Sincronização desativada neste computador.')

    def run(self):
        while True:
            try:
                self.sync_once()
            except Exception as error:
                # Nunca registrar URL de autenticação, senha ou token.
                with self.lock:
                    if self.credential.exists():
                        self.save_state(status='retry', message=str(error) if isinstance(error, ValueError)
                                        else 'Sem conexão ou falha no envio. Nova tentativa em até 5 minutos.')
            self.wake.wait(300)
            self.wake.clear()

    def sync_once(self):
        with self.lock:
            if not self.credential.exists():
                return
            epoch = self.epoch
            refresh = protect(self.credential.read_bytes(), decrypt=True).decode()
        batches = self.store.batches()
        if not batches:
            with self.lock:
                self.save_state(status='pending', message='Nenhuma importação local para enviar. A base online existente foi preservada.')
            return
        signature = hashlib.sha256(json.dumps([self.version, [(b['id'], str(b['imported_at'])) for b in batches]]).encode()).hexdigest()
        if signature == self.state.get('signature'):
            return
        self.busy = True
        try:
            with self.lock:
                self.save_state(status='syncing', message='Preparando e enviando os dados processados…')
            session = request_json('https://securetoken.googleapis.com/v1/token?key=' + API_KEY,
                                   {'grant_type': 'refresh_token', 'refresh_token': refresh})
            token = session['id_token']
            snapshot = build_snapshot(self.store, self.version)
            payload = gzip.compress(json.dumps(snapshot, ensure_ascii=False, default=str,
                                    separators=(',', ':')).encode(), mtime=0)
            content = base64.b64encode(payload).decode()
            if len(content) > 8_000_000:
                raise ValueError('Sincronização indisponível: cópia acima de 8 MB. Bases locais preservadas; nenhum upgrade pago será feito.')
            chunks = [content[i:i+400000] for i in range(0, len(content), 400000)]
            previous = request_json(ROOT, token=token)
            generation = 'gtb2-' + uuid.uuid4().hex
            writes = []
            for index, chunk in enumerate(chunks):
                writes.append({'update': {'name': DOCUMENT + '/chunks/' + generation + '-' + str(index),
                    'fields': {'generation': {'stringValue': generation},
                               'index': {'integerValue': str(index)}, 'content': {'stringValue': chunk}}}})
            timestamp = datetime.now(UTC).isoformat()
            fields = {'chunkCount': {'integerValue': str(len(chunks))},
                'chunkHashes': {'arrayValue': {'values': [{'stringValue': hashlib.sha256(chunk.encode()).hexdigest()} for chunk in chunks]}},
                'generation': {'stringValue': generation}, 'savedAt': {'stringValue': timestamp},
                'updatedBy': {'stringValue': self.state.get('email', '')}}
            metadata = {'update': {'name': DOCUMENT, 'fields': fields},
                'updateTransforms': [{'fieldPath': 'updatedAt', 'setToServerValue': 'REQUEST_TIME'}],
                'currentDocument': {'updateTime': previous['updateTime']} if previous else {'exists': False}}
            writes.append(metadata)
            if previous:
                old = previous['fields']
                old_generation = old['generation']['stringValue']
                old_count = int(old['chunkCount']['integerValue'])
                if old_count > 20:
                    raise ValueError('Cópia remota fora do limite esperado. Conferência manual necessária.')
                writes.extend({'delete': DOCUMENT + '/chunks/' + old_generation + '-' + str(i)} for i in range(old_count))
            # Uma transação atômica publica metadados e blocos e remove a geração
            # anterior. Falhas não expõem cópia parcial nem acumulam blocos órfãos.
            with self.lock:
                if epoch != self.epoch or not self.credential.exists():
                    return
                request_json(f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:commit',
                             {'writes': writes}, token)
                # Persistir o refresh token rotacionado, nunca a senha.
                self.credential.write_bytes(protect(session['refresh_token'].encode()))
                self.save_state(status='synced', signature=signature, lastSyncedAt=timestamp,
                    message='Dados sincronizados. A página online verifica atualizações a cada minuto.')
        finally:
            self.busy = False
