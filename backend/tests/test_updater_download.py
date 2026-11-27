"""O atualizador do Windows retoma downloads interrompidos e roda uma única vez."""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Atualizador exclusivo do Windows")

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "atualizar-gtb.ps1"
POWERSHELL = Path(os.environ.get("WINDIR", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
VERSION = "9.9.9"
NAME = f"GTB2-Instalador-{VERSION}.exe"
PAYLOAD = bytes(range(256)) * 4096  # 1 MiB sintético


def serve(drop_first: bool, honor_range: bool = True, hang_first: bool = False, manifest: dict | None | str = "valid"):
    state = {"requests": [], "dropped": False, "api": 0}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            base = f"http://127.0.0.1:{self.server.server_port}"
            if self.path == "/manifest":
                if manifest is None:
                    self.send_error(404)
                    return
                body = json.dumps({"version": VERSION, "installer": NAME, "size": len(PAYLOAD),
                                   "sha256": hashlib.sha256(PAYLOAD).hexdigest()} if manifest == "valid" else manifest).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path == "/api":
                state["api"] += 1
                body = json.dumps({"tag_name": f"v{VERSION}", "assets": [{
                    "name": NAME, "size": len(PAYLOAD),
                    "browser_download_url": f"{base}/download/v{VERSION}/{NAME}",
                    "digest": "sha256:" + hashlib.sha256(PAYLOAD).hexdigest()}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            requested = self.headers.get("Range")
            state["requests"].append(requested)
            start = 0
            if requested and honor_range:
                start = int(requested.removeprefix("bytes=").split("-")[0])
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{len(PAYLOAD) - 1}/{len(PAYLOAD)}")
            else:
                self.send_response(200)
            self.send_header("Content-Length", str(len(PAYLOAD) - start))
            self.end_headers()
            if hang_first and not state["dropped"]:
                # Envia um terço e para de responder sem fechar a conexão (download travado).
                state["dropped"] = True
                self.wfile.write(PAYLOAD[start:start + len(PAYLOAD) // 3])
                self.wfile.flush()
                threading.Event().wait(20)
                return
            if drop_first and not state["dropped"]:
                # Envia só um terço e derruba a conexão, como na falha real do GitHub.
                state["dropped"] = True
                self.wfile.write(PAYLOAD[start:start + len(PAYLOAD) // 3])
                self.wfile.flush()
                self.close_connection = True
                self.connection.shutdown(2)
                return
            self.wfile.write(PAYLOAD[start:])

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, state


def run_updater(tmp_path: Path, server, extra=()):
    install = tmp_path / "programa"
    install.mkdir(exist_ok=True)
    shutil.copy(SCRIPT, install / "atualizar-gtb.ps1")
    (install / "version.txt").write_text("0.1.0", encoding="utf-8")
    updates = tmp_path / "updates"
    base = f"http://127.0.0.1:{server.server_port}"
    env = {**os.environ, "LOCALAPPDATA": str(tmp_path / "local")}
    result = subprocess.run(
        [str(POWERSHELL), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(install / "atualizar-gtb.ps1"),
         "-AllowRunning", "-DownloadOnly", "-StatusFile", str(tmp_path / "status.json"),
         "-ManifestUrl", f"{base}/manifest", "-ReleaseApi", f"{base}/api", "-DownloadBase", f"{base}/download", "-UpdatesDirectory", str(updates),
         "-StallSeconds", "5", "-RetryDelaySeconds", "1", *extra],
        check=False, capture_output=True, text=True, timeout=120, env=env)
    status = json.loads((tmp_path / "status.json").read_text(encoding="utf-8-sig")) \
        if (tmp_path / "status.json").exists() else None
    return result, status, updates


def test_interrupted_download_resumes_from_where_it_stopped(tmp_path):
    server, state = serve(drop_first=True)
    try:
        result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status == {"phase": "ready", "message": f"Instalador {VERSION} baixado e conferido."}, result.stdout + result.stderr
    assert (updates / NAME).read_bytes() == PAYLOAD
    assert not (updates / f"{NAME}.download").exists()
    assert state["requests"][0] is None
    assert state["requests"][1] == f"bytes={len(PAYLOAD) // 3}-"


def test_stalled_download_is_abandoned_and_resumed(tmp_path):
    server, state = serve(drop_first=False, hang_first=True)
    try:
        result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status["phase"] == "ready", result.stdout + result.stderr
    assert (updates / NAME).read_bytes() == PAYLOAD
    assert state["requests"][1] == f"bytes={len(PAYLOAD) // 3}-"


def test_server_without_resume_restarts_download_and_still_verifies(tmp_path):
    server, _state = serve(drop_first=True, honor_range=False)
    try:
        _result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status["phase"] == "ready"
    assert (updates / NAME).read_bytes() == PAYLOAD


def test_second_updater_does_not_interfere_with_running_one(tmp_path):
    server, state = serve(drop_first=False)
    updates = tmp_path / "updates"
    updates.mkdir()
    try:
        with open(updates / "atualizacao.lock", "w"):
            result, status, _ = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert result.returncode == 0
    assert status is None  # não sobrescreve o andamento da atualização em curso
    assert state["requests"] == []


def test_manifest_avoids_github_api(tmp_path):
    server, state = serve(drop_first=False)
    try:
        result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status["phase"] == "ready", result.stdout + result.stderr
    assert (updates / NAME).read_bytes() == PAYLOAD
    assert state["api"] == 0


def test_release_without_manifest_uses_github_api(tmp_path):
    server, state = serve(drop_first=False, manifest=None)
    try:
        result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status["phase"] == "ready", result.stdout + result.stderr
    assert (updates / NAME).read_bytes() == PAYLOAD
    assert state["api"] == 1


def test_invalid_manifest_is_refused(tmp_path):
    server, state = serve(drop_first=False, manifest={"version": VERSION, "installer": "outro.exe", "size": 1, "sha256": "0" * 64})
    try:
        result, status, updates = run_updater(tmp_path, server)
    finally:
        server.shutdown()
    assert status["phase"] == "failed", result.stdout + result.stderr
    assert state["requests"] == []
    assert not (updates / NAME).exists()
