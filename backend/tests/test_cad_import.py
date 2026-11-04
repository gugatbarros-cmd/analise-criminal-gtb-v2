"""A entrada CAD exige sessão local autorizada e período válido."""

import pytest
import threading
from fastapi.testclient import TestClient

from gtb.api import main
from gtb.cad.automation import CadImportManager, check_period
from gtb.db.store import Store


def test_cad_period_rejects_invalid_and_reversed_dates():
    check_period("2026-11-01", "2026-11-03")
    with pytest.raises(ValueError):
        check_period("2026-02-30", "2026-03-01")
    with pytest.raises(ValueError):
        check_period("2026-11-03", "2026-11-01")


def test_cad_start_rejects_bad_input_without_opening_browser(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    monkeypatch.setattr(main, "cad_import", manager)
    client = TestClient(main.app)
    response = client.post("/cad/start", json={
        "cpf": "12345678901", "password": "synthetic-only", "start_date": "2026-11-03",
        "end_date": "2026-11-01",
    })
    assert response.status_code == 422
    assert manager.status()["phase"] == "idle"
    assert client.get("/cad/status").json()["result"] is None


def test_viewer_cannot_start_cad(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    monkeypatch.setattr(main, "cad_import", manager)

    class ViewerAuth:
        def has_users(self):
            return True

        def user_for_token(self, _token):
            return {"username": "synthetic-viewer", "role": "viewer"}

    monkeypatch.setattr(main, "auth_manager", ViewerAuth())
    client = TestClient(main.app)
    response = client.post("/cad/start", json={
        "cpf": "12345678901", "password": "synthetic-only", "start_date": "2026-11-01",
        "end_date": "2026-11-03",
    })
    assert response.status_code == 403
    assert manager.status()["phase"] == "idle"


def test_cad_progress_is_monotonic_and_only_finishes_on_completion(tmp_path):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    assert manager.status()["progress"] == 0
    manager._set("filtering", "Consulta", progress=40)
    manager._set("filtering", "Aguardando", progress=32)
    assert manager.status()["progress"] == 40
    manager._set("importing", "Gravando", progress=95)
    assert manager.status()["progress"] == 95
    manager._set("complete", "Concluído", {"inserted": 1}, progress=100)
    assert manager.status()["progress"] == 100


def test_cad_column_progress_uses_confirmed_selection(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    counts = iter([2, 1, 1, 0, 0])
    inventory = lambda: {"count": next(counts), "from": {"x": 1, "y": 1},
                         "to": {"x": 2, "y": 2}}
    monkeypatch.setattr(manager, "_action", lambda *_args: inventory())

    class Mouse:
        def move(self, *_args, **_kwargs):
            pass

        def down(self):
            pass

        def up(self):
            pass

    class Page:
        mouse = Mouse()

        def evaluate(self, _script):
            return {"width": 10, "height": 10}

        def wait_for_timeout(self, _milliseconds):
            pass

    manager._select_all_columns(Page())
    assert manager.status()["progress"] == 70
    assert manager.status()["message"] == "Todas as colunas foram selecionadas."


def test_cad_cancel_releases_query_and_keeps_authenticated_session(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    manager.session_active = True
    manager._set("filtering", "Consultando", progress=40)
    assert manager.cancel()["phase"] == "cancelling"
    class Page:
        url = "https://analisacad.seguranca.al.gov.br/app/cad/consulta/"
        def is_closed(self):
            return False
    monkeypatch.setattr(manager, "_download_and_import", lambda *_args: manager._check_stop())
    assert manager._run_import(Page(), "2026-11-01", "2026-11-03") is True
    assert manager.status()["phase"] == "cancelled"
    assert manager.status()["session_active"] is True


def test_cad_reuses_session_without_credentials_and_blocks_other_local_profile(tmp_path):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    release = threading.Event()
    manager.worker = threading.Thread(target=release.wait, daemon=True)
    manager.worker.start()
    try:
        manager.session_active = True
        manager.session_owner = "operador-a"
        manager._set("complete", "Lote concluído", progress=100)
        assert manager.status("operador-b")["session_active"] is False
        with pytest.raises(ValueError, match="outro perfil"):
            manager.start("", "", "2026-11-01", "2026-11-03", "operador-b")
        status = manager.start("", "", "2026-11-01", "2026-11-03", "operador-a")
        assert status["phase"] == "filtering"
        assert status["session_active"] is True
        assert manager.commands.get_nowait() == ("import", ("2026-11-01", "2026-11-03"))
        assert manager.disconnect("operador-a")["phase"] == "disconnecting"
    finally:
        release.set()
        manager.worker.join(timeout=2)


def test_cad_cannot_cancel_started_database_write(tmp_path):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    manager._set("importing", "Gravando", progress=95)
    with pytest.raises(ValueError, match="gravação do lote já começou"):
        manager.cancel()


def test_cad_captures_xls_download_started_by_xls_click(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    class Events:
        def __init__(self):
            self.handlers = {}
        def on(self, name, callback):
            self.handlers.setdefault(name, []).append(callback)
        def remove_listener(self, name, callback):
            self.handlers[name].remove(callback)
        def emit(self, name, value):
            for callback in self.handlers.get(name, []):
                callback(value)
    class Page(Events):
        def __init__(self):
            super().__init__()
            self.context = Events()
            self.context.pages = [self]
        def wait_for_timeout(self, _milliseconds):
            pass
    page = Page()
    download = object()
    monkeypatch.setattr(manager, "_action", lambda *_args, **_kwargs: page.emit("download", download))
    assert manager._request_xls_download(page) is download
    assert manager.status()["phase"] == "downloading"


def test_cad_clicks_baixar_inside_export_frame(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    download = object()
    class Events:
        def __init__(self):
            self.handlers = {}
        def on(self, name, callback):
            self.handlers.setdefault(name, []).append(callback)
        def remove_listener(self, name, callback):
            self.handlers[name].remove(callback)
        def emit(self, name, value):
            for callback in self.handlers.get(name, []):
                callback(value)
    class Locator:
        @property
        def first(self):
            return self
        def is_visible(self):
            return True
        def click(self, **_kwargs):
            page.emit("download", download)
    class Frame:
        url = "https://analisacad.seguranca.al.gov.br/exportacao/"
        def get_by_role(self, role, **_kwargs):
            return Locator() if role == "button" else None
        def get_by_text(self, *_args, **_kwargs):
            return None
    class Page(Events):
        url = "https://analisacad.seguranca.al.gov.br/consulta/"
        frames = [Frame()]
        def __init__(self):
            super().__init__()
            self.context = Events()
            self.context.pages = [self]
        def is_closed(self):
            return False
        def wait_for_timeout(self, _milliseconds):
            pass
    page = Page()
    monkeypatch.setattr(manager, "_action", lambda *_args, **_kwargs: None)
    assert manager._request_xls_download(page) is download
