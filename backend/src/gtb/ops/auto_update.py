"""Atualização automática do aplicativo instalado quando o sistema está sem uso.

O verificador consulta a release estável mais recente no GitHub. Quando existe
versão nova com instalador publicado, aguarda o sistema ficar ocioso (sem
interação na interface, importação ou sessão CAD) e então aciona o mesmo
atualizador usado pelo botão "Atualizar agora", que instala e reinicia.
"""

import json
import re
import threading
import time
from collections.abc import Callable
from urllib.request import Request, urlopen

RELEASES_URL = "https://api.github.com/repos/gugatbarros-cmd/analise-criminal-gtb-v2/releases/latest"
CHECK_INTERVAL_SECONDS = 15 * 60
FIRST_CHECK_SECONDS = 2 * 60
IDLE_SECONDS = 10 * 60
IDLE_POLL_SECONDS = 30
RETRY_AFTER_FAILURE_SECONDS = 30 * 60


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", value.strip())
    return tuple(int(part) for part in match.groups()) if match else None  # type: ignore[return-value]


def latest_release_version(timeout: float = 15) -> str | None:
    """Versão da release estável mais recente que já tem o instalador anexado."""
    request = Request(RELEASES_URL, headers={"User-Agent": "GTB2-AutoUpdate",
                                             "Accept": "application/vnd.github+json"})
    with urlopen(request, timeout=timeout) as response:
        release = json.loads(response.read().decode("utf-8"))
    tag = str(release.get("tag_name", ""))
    version = parse_version(tag)
    if not version:
        return None
    text = ".".join(map(str, version))
    names = {str(asset.get("name", "")) for asset in release.get("assets", [])}
    return text if f"GTB2-Instalador-{text}.exe" in names else None


class AutoUpdater:
    """Decide quando instalar; as dependências externas são injetadas para teste."""

    def __init__(self, current_version: str, *, fetch_latest: Callable[[], str | None],
                 is_busy: Callable[[], bool], launch: Callable[[], None],
                 still_installing: Callable[[], bool] = lambda: True,
                 clock: Callable[[], float] = time.monotonic,
                 idle_seconds: float = IDLE_SECONDS):
        self.current = parse_version(current_version)
        self.fetch_latest = fetch_latest
        self.is_busy = is_busy
        self.launch = launch
        self.still_installing = still_installing
        self.clock = clock
        self.idle_seconds = idle_seconds
        self.lock = threading.Lock()
        self.last_activity = clock()
        self.pending: str | None = None
        self.next_check = clock() + FIRST_CHECK_SECONDS
        self.started = False
        self.last_error = ""

    def touch(self) -> None:
        """Registra uso do sistema, adiando a instalação automática."""
        with self.lock:
            self.last_activity = self.clock()

    def idle_for(self) -> float:
        with self.lock:
            return self.clock() - self.last_activity

    def status(self) -> dict:
        remaining = max(0, round(self.idle_seconds - self.idle_for()))
        return {"enabled": True, "pending_version": self.pending,
                "idle_minutes_required": round(self.idle_seconds / 60),
                "seconds_until_install": remaining if self.pending else None,
                "installing": self.started}

    def tick(self) -> str:
        """Executa uma etapa e informa o que aconteceu (útil para testes e registro)."""
        now = self.clock()
        if self.started:
            if self.still_installing():
                return "installing"
            # O atualizador terminou sem reiniciar este processo: houve falha; tenta depois.
            self.started = False
            self.pending = None
            self.next_check = now + RETRY_AFTER_FAILURE_SECONDS
            return "install-failed"
        if self.pending is None or now >= self.next_check:
            self.next_check = now + CHECK_INTERVAL_SECONDS
            try:
                latest = self.fetch_latest()
                self.last_error = ""
            except (OSError, ValueError) as error:
                self.last_error = str(error)
                return "check-failed"
            parsed = parse_version(latest) if latest else None
            self.pending = latest if parsed and self.current and parsed > self.current else None
        if self.pending is None:
            return "current"
        if self.idle_for() < self.idle_seconds or self.is_busy():
            return "waiting-idle"
        try:
            self.launch()
        except (OSError, RuntimeError) as error:
            self.last_error = str(error)
            self.next_check = now + RETRY_AFTER_FAILURE_SECONDS
            self.pending = None
            return "launch-failed"
        self.started = True
        return "installing"

    def run_forever(self, stop: threading.Event) -> None:
        while not stop.wait(IDLE_POLL_SECONDS):
            self.tick()
