"""Regressões da inicialização Windows sem console, com dados isolados."""

import importlib.util
import logging
import sys
from pathlib import Path

import pytest


@pytest.fixture
def launcher(tmp_path, monkeypatch):
    source = Path(__file__).resolve().parents[2] / "desktop" / "launcher.py"
    spec = importlib.util.spec_from_file_location("gtb_desktop_launcher", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv("GTB_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setenv("GTB_NO_BROWSER", "1")
    monkeypatch.setattr(sys, "argv", ["GTB2-Local.exe"])
    # Não alterar os handlers do pytest ao configurar o log do executável.
    monkeypatch.setattr(logging, "basicConfig", lambda **kwargs: None)
    return module


def fake_port(monkeypatch, launcher, occupied):
    class Probe:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def connect_ex(self, _address):
            return 0 if occupied else 1

    monkeypatch.setattr(launcher.socket, "socket", Probe)


def test_windowed_start_avoids_uvicorn_console_formatters(launcher, tmp_path, monkeypatch):
    fake_port(monkeypatch, launcher, occupied=False)
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html></html>", encoding="utf-8")
    monkeypatch.setattr(launcher, "web_directory", lambda: web)
    # O app real já é exercitado pelos testes de API; evite montar rotas nele.
    from gtb.api import main

    class App:
        def mount(self, *_args, **_kwargs):
            pass

    monkeypatch.setattr(main, "app", App())
    calls = []
    monkeypatch.setattr(launcher.uvicorn, "run", lambda *args, **kwargs: calls.append(kwargs))
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    assert launcher.main() == 0
    assert calls[0]["host"] == "127.0.0.1"
    assert calls[0]["log_config"] is None
    assert "Iniciando" in launcher.log_path().read_text(encoding="utf-8")


@pytest.mark.parametrize("arguments", [["backup"], ["restore", "backup.zip"]])
def test_backup_commands_fail_instead_of_reopening_running_app(launcher, monkeypatch, arguments):
    fake_port(monkeypatch, launcher, occupied=True)
    monkeypatch.setattr(sys, "argv", ["GTB2-Local.exe", *arguments])
    monkeypatch.setattr(sys, "stderr", None)
    assert launcher.main() == 1
    assert "antes de executar backup" in launcher.log_path().read_text(encoding="utf-8")
