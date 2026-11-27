"""A atualização automática só instala versão nova com o sistema ocioso."""

from fastapi.testclient import TestClient

from gtb.api import main
from gtb.ops import auto_update
from gtb.ops.auto_update import AutoUpdater, parse_version


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make(latest="0.1.116", busy=False, current="0.1.115"):
    clock = Clock()
    calls = {"launch": 0, "fetch": 0}
    state = {"busy": busy, "latest": latest, "installing": True}

    def fetch():
        calls["fetch"] += 1
        return state["latest"]

    def launch():
        calls["launch"] += 1

    updater = AutoUpdater(current, fetch_latest=fetch, is_busy=lambda: state["busy"], launch=launch,
                          still_installing=lambda: state["installing"], clock=clock, idle_seconds=600)
    return updater, clock, calls, state


def test_parse_version_accepts_tags():
    assert parse_version("v0.1.115") == (0, 1, 115)
    assert parse_version("0.1.9") == (0, 1, 9)
    assert parse_version("beta") is None


def test_installs_only_after_ten_idle_minutes():
    updater, clock, calls, _ = make()
    assert updater.tick() == "waiting-idle"
    assert updater.status()["pending_version"] == "0.1.116"
    clock.now += 300
    updater.touch()
    clock.now += 599
    assert updater.tick() == "waiting-idle"
    assert calls["launch"] == 0
    clock.now += 2
    assert updater.tick() == "installing"
    assert calls["launch"] == 1
    assert updater.tick() == "installing"
    assert calls["launch"] == 1


def test_does_not_install_while_import_or_cad_is_running():
    updater, clock, calls, state = make(busy=True)
    clock.now += 3600
    assert updater.tick() == "waiting-idle"
    state["busy"] = False
    assert updater.tick() == "installing"
    assert calls["launch"] == 1


def test_current_or_older_release_does_nothing():
    for latest in ("0.1.115", "0.1.114", None):
        updater, clock, calls, _ = make(latest=latest)
        clock.now += 3600
        assert updater.tick() == "current"
        assert calls["launch"] == 0


def test_network_failure_is_retried_later():
    updater, clock, _calls, state = make()

    def offline():
        raise OSError("sem rede")

    updater.fetch_latest = offline
    assert updater.tick() == "check-failed"
    updater.fetch_latest = lambda: state["latest"]
    clock.now += auto_update.CHECK_INTERVAL_SECONDS + 1
    assert updater.tick() == "installing"


def test_failed_install_allows_new_attempt_later():
    updater, clock, calls, state = make()
    clock.now += 3600
    assert updater.tick() == "installing"
    state["installing"] = False
    assert updater.tick() == "install-failed"
    clock.now += auto_update.RETRY_AFTER_FAILURE_SECONDS + 1
    state["installing"] = True
    assert updater.tick() == "installing"
    assert calls["launch"] == 2


def test_activity_endpoint_postpones_install_and_status_is_available():
    client = TestClient(main.app)
    headers = {"Authorization": "Bearer sintetico"}
    before = main.auto_updater.last_activity
    assert client.post("/system/activity", headers=headers).status_code == 200
    assert main.auto_updater.last_activity >= before
    status = client.get("/system/auto-update", headers=headers).json()
    assert status["enabled"] is False  # fora do aplicativo instalado


def serve_release(manifest):
    """Servidor local com manifesto (ou 404) e API sintéticos."""
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    calls = {"api": 0}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path.split("?")[0] == "/manifest" and manifest is not None:
                body = json.dumps(manifest).encode()
            elif self.path == "/api":
                calls["api"] += 1
                body = json.dumps({"tag_name": "v0.2.0", "assets": [{"name": "GTB2-Instalador-0.2.0.exe"}]}).encode()
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    return server, calls, {"manifest_url": f"{base}/manifest", "releases_url": f"{base}/api"}


def test_latest_version_prefers_manifest_and_falls_back_to_api():
    valid = {"version": "0.3.0", "installer": "GTB2-Instalador-0.3.0.exe", "size": 10, "sha256": "a" * 64}
    for manifest, expected, api_calls in [
        (valid, "0.3.0", 0),
        (None, "0.2.0", 1),
        ({**valid, "installer": "outro.exe"}, None, 0),
        ({**valid, "sha256": "curto"}, None, 0),
    ]:
        server, calls, urls = serve_release(manifest)
        try:
            assert auto_update.latest_release_version(5, **urls) == expected
        finally:
            server.shutdown()
        assert calls["api"] == api_calls
