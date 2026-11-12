"""A entrada CAD exige sessão local autorizada e período válido."""

import pytest
import threading
from types import SimpleNamespace
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
        def __init__(self):
            self.moves = []

        def move(self, *_args, **kwargs):
            self.moves.append(kwargs)

        def down(self):
            pass

        def up(self):
            pass

    class Page:
        def __init__(self):
            self.mouse = Mouse()
            self.waits = []

        def evaluate(self, _script):
            return {"width": 10, "height": 10}

        def wait_for_timeout(self, milliseconds):
            self.waits.append(milliseconds)

    page = Page()
    manager._select_all_columns(page)
    assert manager.status()["progress"] == 70
    assert manager.status()["message"] == "Todas as colunas foram selecionadas."
    assert page.waits[:3] == [150, 100, 350]
    assert any(move.get("steps") == 24 for move in page.mouse.moves)


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
        assert manager.commands.get_nowait() == ("import", ("2026-11-01", "2026-11-03", ["ocorrencias"]))
        assert manager.disconnect("operador-a")["phase"] == "disconnecting"
    finally:
        release.set()
        manager.worker.join(timeout=2)


def test_cad_rejects_empty_or_unknown_sources_before_opening_browser(tmp_path):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    for sources in ([], ["desconhecida"], ["drogas", "drogas"]):
        with pytest.raises(ValueError, match="Marque ocorrências"):
            manager.start("12345678901", "synthetic-only", "2026-11-01", "2026-11-03",
                          "operador", sources)
    assert manager.worker is None


def test_cad_arms_uses_advanced_search_and_imports_arms_xls(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    actions = []

    class Page:
        url = ""

        def goto(self, url, **_kwargs):
            self.url = url

        def wait_for_timeout(self, _milliseconds):
            pass

    class Download:
        suggested_filename = "armas.xls"

        def failure(self):
            return None

        def save_as(self, path):
            path.write_bytes(b"synthetic XLS content")

    monkeypatch.setattr(manager, "_wait_control", lambda _page, label, *_args: actions.append(label))
    monkeypatch.setattr(manager, "_action", lambda _page, action, _message, options=None,
                        **_kwargs: actions.append((action, options)) or {"ok": True})
    monkeypatch.setattr(manager, "_select_all_columns", lambda _page, source: actions.append(("select_all", source)))
    monkeypatch.setattr(manager, "_request_xls_download", lambda _page: Download())
    monkeypatch.setattr(manager.store, "import_file", lambda *args, **kwargs: (
        actions.append(("import", args, kwargs)) or
        {"row_count": 1, "inserted": 1, "updated": 0, "quarantined": 0, "repeated": False}))

    page = Page()
    result = manager._download_and_import(page, "2026-11-01", "2026-11-10", "armas")
    assert page.url.endswith("/cad_grid_arma_boletim/")
    assert actions.index(("Pesquisa Avançada", "Pesquisar")) < actions.index(("advancedSearch", None))
    assert ("dispatchUnit", None) in actions
    assert ("titular", None) not in actions
    assert ("select_all", "armas") in actions
    assert ("columns", {"grade": "armas"}) in actions
    assert ("exportMenu", None) in actions
    assert ("import", ("armas", "armas.xls", b"synthetic XLS content", "partial"),
            {"require_accepted": True}) in actions
    assert result["inserted"] == 1


def test_cad_drugs_uses_available_search_button_and_imports_xls(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    actions = []

    class Page:
        url = ""

        def goto(self, url, **_kwargs):
            self.url = url

        def wait_for_timeout(self, _milliseconds):
            pass

    class Download:
        suggested_filename = "drogas.xls"

        def failure(self):
            return None

        def save_as(self, path):
            path.write_bytes(b"synthetic XLS content")

    def wait_control(_page, label, *_args):
        actions.append(("wait", label))
        return "Pesquisar" if isinstance(label, tuple) else label

    monkeypatch.setattr(manager, "_wait_control", wait_control)
    monkeypatch.setattr(manager, "_action", lambda _page, action, _message, options=None,
                        **_kwargs: actions.append((action, options)) or {"ok": True})
    monkeypatch.setattr(manager, "_select_all_columns", lambda _page, source: actions.append(("select_all", source)))
    monkeypatch.setattr(manager, "_request_xls_download", lambda _page: Download())
    monkeypatch.setattr(manager.store, "import_file", lambda *args, **kwargs: (
        actions.append(("import", args, kwargs)) or
        {"row_count": 1, "inserted": 1, "updated": 0, "quarantined": 0, "repeated": False}))

    result = manager._download_and_import(Page(), "2026-11-01", "2026-11-12", "drogas")
    assert ("wait", ("Pesquisa Avançada", "Pesquisar")) in actions
    assert ("dateRangeMode", None) in actions
    assert ("dispatchUnit", None) in actions
    assert ("titular", None) in actions
    assert actions.index(("titular", None)) < actions.index(("search", None))
    assert ("select_all", "drogas") in actions
    assert ("import", ("drogas", "drogas.xls", b"synthetic XLS content", "partial"),
            {"require_accepted": True}) in actions
    assert result["inserted"] == 1


def test_cad_imports_both_selected_sources_in_order(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    imported = []
    def fake_import(_page, _first, _last, source):
        imported.append(source)
        return {"row_count": 2, "inserted": 1, "updated": 0, "quarantined": 1,
                "repeated": False}
    monkeypatch.setattr(manager, "_download_and_import", fake_import)
    assert manager._run_import(object(), "2026-11-01", "2026-11-03",
                               ["ocorrencias", "drogas"]) is True
    assert imported == ["ocorrencias", "drogas"]
    result = manager.status()["result"]
    assert result["sources"] == imported
    assert result["row_count"] == 4
    assert manager.status()["phase"] == "complete"


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


def test_cad_waits_for_large_xls_beyond_two_minutes(tmp_path, monkeypatch):
    manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
    elapsed = [0.0]
    download = object()
    monkeypatch.setattr("gtb.cad.automation.time", SimpleNamespace(monotonic=lambda: elapsed[0]))
    monkeypatch.setattr(manager, "_action", lambda *_args, **_kwargs: None)

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
        url = "https://analisacad.seguranca.al.gov.br/consulta/"
        frames = []
        def __init__(self):
            super().__init__()
            self.context = Events()
            self.context.pages = [self]
        def is_closed(self):
            return False
        def wait_for_timeout(self, _milliseconds):
            elapsed[0] += 30
            if elapsed[0] >= 180:
                self.emit("download", download)

    assert manager._request_xls_download(Page()) is download
    assert elapsed[0] >= 180
