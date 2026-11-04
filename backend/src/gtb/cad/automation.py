"""Consulta CAD iniciada pelo usuário e importação local de ocorrências."""

from __future__ import annotations

import json
import queue
import re
import threading
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from gtb.db.store import MAX_UPLOAD_BYTES, Store

CAD_ORIGIN = "https://analisacad.seguranca.al.gov.br"
LOGIN_URL = CAD_ORIGIN + "/app/cad/cad_gestao_login/"
MENU_PATH = "/app/cad/cad_blank_menu_respons/cad_blank_menu_respons.php"
OCCURRENCES_URL = CAD_ORIGIN + "/app/cad/cad_grid_tb_ocor_consulta_com_cadastro/"
TOKEN_WORDS = re.compile(r"token|c[oó]digo|verification|otp|2fa", re.IGNORECASE)
ACTIONS = Path(__file__).with_name("page_actions.js").read_text(encoding="utf-8").strip()
XLS_DOWNLOAD_TIMEOUT_SECONDS = 15 * 60


def check_period(start_date: str, end_date: str) -> None:
    try:
        start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    except ValueError as error:
        raise ValueError("Informe as datas inicial e final do intervalo.") from error
    if start.isoformat() != start_date or end.isoformat() != end_date or start > end:
        raise ValueError("Informe um intervalo válido com a data inicial anterior à final.")


class CadCancelled(Exception):
    """A consulta foi interrompida pelo usuário antes de gravar o lote."""


class CadImportManager:
    def __init__(self, store: Store, data_dir: Path, on_import=None):
        self.store = store
        self.download_dir = data_dir / "cad-downloads"
        self.on_import = on_import
        self.commands: queue.Queue[tuple[str, str]] = queue.Queue()
        self.stop = threading.Event()
        self.cancel_requested = threading.Event()
        self.lock = threading.Lock()
        self.worker: threading.Thread | None = None
        self.phase = "idle"
        self.message = "Informe CPF, senha e o intervalo desejado para consultar o CAD."
        self.progress = 0
        self.result: dict | None = None
        self.session_active = False
        self.session_owner = ""

    def _set(self, phase: str, message: str, result: dict | None = None,
             progress: int | None = None) -> None:
        with self.lock:
            self.phase, self.message, self.result = phase, message, result
            if progress is not None:
                self.progress = max(self.progress, min(100, max(0, progress)))

    def status(self, owner: str = "") -> dict:
        with self.lock:
            if owner and self.session_owner and owner != self.session_owner:
                return {"phase": "idle", "message": "A sessão CAD pertence a outro perfil local.",
                        "progress": 0, "result": None, "session_active": False}
            return {"phase": self.phase, "message": self.message,
                    "progress": self.progress, "result": self.result,
                    "session_active": self.session_active}

    def start(self, cpf: str, password: str, start_date: str, end_date: str, owner: str = "") -> dict:
        check_period(start_date, end_date)
        with self.lock:
            if self.worker and self.worker.is_alive():
                if self.session_owner != owner:
                    raise ValueError("A sessão CAD pertence a outro perfil local.")
                if not self.session_active or self.phase not in {"ready", "complete", "error", "cancelled"}:
                    raise ValueError("Já existe uma consulta CAD em andamento. Cancele-a antes de começar outra.")
                self.phase, self.message, self.result = "filtering", "Reutilizando a sessão do CAD…", None
                self.progress = 2
                self.cancel_requested.clear()
                self.commands.put(("import", (start_date, end_date)))
                return {"phase": self.phase, "message": self.message, "progress": self.progress,
                        "result": self.result, "session_active": True}
            if not re.fullmatch(r"\d{11}", cpf or "") or not password or len(password) > 200:
                raise ValueError("Informe os 11 dígitos do CPF e a senha do CAD.")
            self.phase, self.message, self.result = "opening", "Abrindo o CAD…", None
            self.progress = 2
            self.commands = queue.Queue()
            self.stop.clear()
            self.cancel_requested.clear()
            self.session_active = False
            self.session_owner = owner
            self.worker = threading.Thread(
                target=self._run, args=(cpf, password, start_date, end_date), daemon=True
            )
            self.worker.start()
        return self.status()

    def submit_token(self, token: str) -> dict:
        if not re.fullmatch(r"[\w-]{4,32}", token or ""):
            raise ValueError("Confira o token informado.")
        if self.status()["phase"] != "token":
            raise ValueError("Aguarde o pedido de token do CAD.")
        self.commands.put(("token", token))
        self._set("verifying", "Token enviado. Aguardando confirmação do CAD…", progress=10)
        return self.status()

    def disconnect(self, owner: str = "") -> dict:
        if self.session_owner and self.session_owner != owner:
            raise ValueError("A sessão CAD pertence a outro perfil local.")
        self.stop.set()
        self.cancel_requested.set()
        self.commands.put(("disconnect", ""))
        if self.worker and self.worker.is_alive():
            self._set("disconnecting", "Encerrando a sessão do CAD…")
        else:
            self._set("idle", "Sessão do CAD encerrada.", progress=0)
        return self.status()

    def cancel(self, owner: str = "") -> dict:
        if self.session_owner and self.session_owner != owner:
            raise ValueError("A sessão CAD pertence a outro perfil local.")
        current = self.status()
        if current["phase"] == "importing":
            raise ValueError("A gravação do lote já começou. Aguarde sua conclusão para preservar os dados.")
        if current["phase"] not in {"opening", "token", "verifying", "filtering", "downloading", "validating"}:
            return current
        self.cancel_requested.set()
        self.commands.put(("cancel", ""))
        self._set("cancelling", "Cancelando a consulta do CAD…")
        return self.status()

    def _check_stop(self) -> None:
        if self.stop.is_set():
            raise ValueError("Sessão do CAD encerrada.")
        if self.cancel_requested.is_set():
            raise CadCancelled()

    def _run(self, cpf: str, password: str, start_date: str, end_date: str) -> None:
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(channel="chrome", headless=False)
                except PlaywrightError:
                    browser = playwright.chromium.launch(channel="msedge", headless=False)
                try:
                    context = browser.new_context(accept_downloads=True)
                    page = context.new_page()
                    self._login(page, cpf, password)
                    self._await_access(page)
                    with self.lock:
                        self.session_active = True
                    keep_session = self._run_import(page, start_date, end_date)
                    while keep_session and not self.stop.is_set() and not page.is_closed():
                        try:
                            command, value = self.commands.get(timeout=1)
                        except queue.Empty:
                            continue
                        if command == "import":
                            keep_session = self._run_import(page, *value)
                        elif command == "disconnect":
                            break
                finally:
                    browser.close()
                    with self.lock:
                        self.session_active = False
                        self.session_owner = ""
                    if self.stop.is_set():
                        self._set("idle", "Sessão do CAD encerrada.", progress=0)
                    elif self.status()["phase"] not in {"error", "cancelled"}:
                        self._set("error", "A janela do CAD foi fechada. Entre novamente para consultar.")
        except CadCancelled:
            if not self.stop.is_set():
                self._set("cancelled", "Consulta cancelada. Inicie outra quando desejar.")
        except PlaywrightError:
            if not self.stop.is_set():
                self._set("error", "O navegador não concluiu a etapa: " + self.status()["message"])
        except (ValueError, OSError, TimeoutError) as error:
            if not self.stop.is_set():
                self._set("error", str(error)[:500])
        except Exception:  # noqa: BLE001 — erro inesperado não pode deixar a interface aguardando.
            if not self.stop.is_set():
                self._set("error", "A consulta CAD parou antes de confirmar a importação. "
                          "Confira a janela oficial e tente novamente.")

    def _run_import(self, page, start_date: str, end_date: str) -> bool:
        try:
            self._download_and_import(page, start_date, end_date)
            return True
        except CadCancelled:
            self._set("cancelled", "Consulta cancelada. A sessão do CAD permanece disponível.")
            return True
        except (PlaywrightError, ValueError, OSError, TimeoutError) as error:
            if page.is_closed() or not page.url.startswith(CAD_ORIGIN + "/") or urlparse(page.url).path == urlparse(LOGIN_URL).path:
                with self.lock:
                    self.session_active = False
                self._set("error", "A sessão do CAD expirou. Entre novamente para consultar.")
                return False
            else:
                self._set("error", str(error)[:500])
                return True
        except Exception:  # noqa: BLE001
            self._set("error", "A consulta CAD falhou. A sessão continua aberta; tente novamente ou encerre-a.")
            return True

    def _login(self, page, cpf: str, password: str) -> None:
        page.goto(LOGIN_URL, wait_until="load", timeout=45000)
        page.wait_for_function("""() => {
            const form = document.querySelector('#login-form');
            return document.readyState === 'complete' && !!form && !!document.querySelector('#cpf')
                && !!document.querySelector('#senha')
                && !!window.jQuery?._data?.(form, 'events')?.submit?.length;
        }""", timeout=20000)
        page.locator("#cpf").fill(cpf)
        page.locator("#senha").fill(password)
        page.locator('#login-form input[type="submit"]').click()
        self._set("token", "Aguarde o token do CAD e informe-o aqui.", progress=8)

    def _await_access(self, page) -> None:
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            self._check_stop()
            if page.is_closed():
                raise ValueError("A janela do CAD foi fechada.")
            if urlparse(page.url).path == MENU_PATH:
                self._set("filtering", "Acesso confirmado. Preparando a consulta.", progress=15)
                return
            error = page.locator("#errolog")
            if error.count() and error.is_visible() and error.inner_text().strip():
                if urlparse(page.url).path == urlparse(LOGIN_URL).path:
                    raise ValueError("O CAD recusou o login. Confira CPF e senha na página oficial.")
                if self.status()["phase"] != "token":
                    self._set("token", "O CAD recusou o código. Confira o token e tente novamente.")
            try:
                command, value = self.commands.get(timeout=1)
            except queue.Empty:
                continue
            if command == "disconnect":
                raise ValueError("Sessão do CAD encerrada.")
            if command == "token":
                self._fill_token(page, value)
        raise TimeoutError("A autenticação do CAD expirou. Inicie uma nova consulta.")

    def _fill_token(self, page, token: str) -> None:
        if not page.url.startswith(CAD_ORIGIN + "/"):
            raise ValueError("A página de token não pertence ao CAD.")
        fields = page.locator("input:visible").all()
        matches = []
        for field in fields:
            if field.is_disabled():
                continue
            description = " ".join(field.get_attribute(name) or "" for name in
                                   ("id", "name", "placeholder", "autocomplete", "aria-label"))
            if TOKEN_WORDS.search(description):
                matches.append(field)
        if len(matches) != 1:
            self._set("token", "Campo não identificado. Confirme o token na janela oficial do CAD.")
            return
        field = matches[0]
        field.fill(token)
        form = field.locator("xpath=ancestor::form[1]")
        if form.count() != 1:
            self._set("token", "Confirme o token na janela oficial do CAD.")
            return
        submit = form.locator('button[type="submit"],input[type="submit"]')
        if submit.count() == 1:
            submit.click()
        else:
            field.press("Enter")
        self._set("verifying", "Aguardando a confirmação do token no CAD…")

    def _wait_control(self, page, label: str, timeout: int = 45000) -> None:
        deadline = time.monotonic() + timeout / 1000
        while time.monotonic() < deadline:
            self._check_stop()
            if page.is_closed() or not page.url.startswith(CAD_ORIGIN + "/"):
                raise ValueError("A página do CAD foi fechada ou mudou de origem.")
            try:
                page.wait_for_function("""label => [...document.querySelectorAll(
            'button,input[type="button"],input[type="submit"],a,[role="button"]')]
            .some(element => element.getClientRects().length &&
                (element.textContent || element.value || '').trim() === label)
                """, arg=label, timeout=1000)
                return
            except PlaywrightError:
                pass
        raise TimeoutError(f"O CAD não mostrou {label} após a etapa anterior.")

    def _action(self, page, action: str, message: str, options: dict | None = None,
                progress: int | None = None) -> dict:
        self._check_stop()
        if not page.url.startswith(CAD_ORIGIN + "/"):
            raise ValueError("A página atual não pertence ao CAD.")
        self._set("filtering", message, progress=progress)
        result = page.evaluate(f"({ACTIONS})({json.dumps(action)}, {json.dumps(options or {})})")
        if not result or not result.get("ok"):
            raise ValueError(result.get("reason", f"O CAD não concluiu {action}.") if result else
                             f"O CAD não concluiu {action}.")
        return result

    def _select_all_columns(self, page) -> None:
        initial_count = None
        for _ in range(200):
            inventory = self._action(page, "columnInventory", "Selecionando as colunas do relatório.")
            if not inventory.get("count"):
                self._set("filtering", "Todas as colunas foram selecionadas.", progress=70)
                return
            if initial_count is None:
                initial_count = inventory["count"]
            start, end = inventory["from"], inventory["to"]
            viewport = page.evaluate("({width: innerWidth, height: innerHeight})")
            for point in (start, end):
                if not (0 <= point["x"] < viewport["width"] and
                        0 <= point["y"] < viewport["height"]):
                    raise ValueError("Uma coluna está fora da janela do CAD.")
            page.mouse.move(start["x"], start["y"])
            page.mouse.down()
            page.mouse.move(end["x"], end["y"], steps=6)
            page.mouse.up()
            page.wait_for_timeout(350)
            after = self._action(page, "columnInventory", "Conferindo as colunas selecionadas.")
            if after.get("count", 0) >= inventory["count"]:
                raise ValueError("O CAD não confirmou a seleção de uma coluna.")
            selected = initial_count - after.get("count", 0)
            self._set("filtering", f"Selecionando as colunas: {selected} de {initial_count}.",
                      progress=40 + (30 * selected // initial_count))
        raise ValueError("A lista de colunas excedeu o limite esperado.")

    def _request_xls_download(self, page):
        """Observa o download antes de selecionar XLS; o CAD pode dispensar Baixar."""
        downloads = []
        watched = []

        def received_download(download):
            downloads.append(download)

        def watch_page(candidate):
            candidate.on("download", received_download)
            watched.append(candidate)

        context = page.context
        for candidate in context.pages:
            watch_page(candidate)
        context.on("page", watch_page)
        try:
            started = time.monotonic()
            self._action(page, "xls", "Gerando a planilha XLS.", progress=78)
            deadline = started + XLS_DOWNLOAD_TIMEOUT_SECONDS
            clicked_download = False
            reported_minute = -1
            download_label = re.compile(r"\bBaixar\b", re.IGNORECASE)
            while not downloads and time.monotonic() < deadline:
                self._check_stop()
                elapsed_minute = int((time.monotonic() - started) // 60)
                if elapsed_minute != reported_minute:
                    reported_minute = elapsed_minute
                    if clicked_download:
                        message = f"Aguardando o navegador receber o XLS ({elapsed_minute} min). Você pode cancelar."
                    else:
                        message = f"Aguardando o CAD gerar o XLS ({elapsed_minute} min). Você pode cancelar."
                    self._set("downloading", message, progress=78)
                if not clicked_download:
                    for candidate in context.pages:
                        if candidate.is_closed() or not candidate.url.startswith(CAD_ORIGIN + "/"):
                            continue
                        for frame in candidate.frames:
                            if not (frame.url.startswith(CAD_ORIGIN + "/") or frame.url == "about:blank"):
                                continue
                            controls = (frame.get_by_role("button", name=download_label),
                                        frame.get_by_role("link", name=download_label),
                                        frame.get_by_text("Baixar", exact=True))
                            for control in controls:
                                try:
                                    if not control.first.is_visible():
                                        continue
                                    self._set("downloading", "Baixando o XLS do CAD…", progress=80)
                                    control.first.click(timeout=10000)
                                    clicked_download = True
                                    break
                                except PlaywrightError:
                                    continue
                            if clicked_download:
                                break
                        if clicked_download:
                            break
                if not downloads:
                    active_page = next((candidate for candidate in context.pages if not candidate.is_closed()), None)
                    if active_page is None:
                        raise ValueError("A janela do CAD foi fechada durante a exportação.")
                    active_page.wait_for_timeout(500)
            self._check_stop()
            if not downloads:
                if clicked_download:
                    raise TimeoutError("O CAD mostrou Baixar, mas o navegador não recebeu o XLS em 15 minutos.")
                raise TimeoutError("O CAD não liberou o download do XLS em 15 minutos. Tente um período menor.")
            self._set("downloading", "Recebendo o XLS do CAD…", progress=80)
            return downloads[0]
        finally:
            context.remove_listener("page", watch_page)
            for candidate in watched:
                candidate.remove_listener("download", received_download)

    def _download_and_import(self, page, start_date: str, end_date: str) -> None:
        page.goto(OCCURRENCES_URL, wait_until="load", timeout=45000)
        if not page.url.startswith(OCCURRENCES_URL):
            raise ValueError("A consulta de ocorrências não abriu no CAD.")
        self._wait_control(page, "Pesquisar")
        self._action(page, "dateRangeMode", "Selecionando o intervalo de datas.", progress=18)
        page.wait_for_timeout(800)
        self._action(page, "dateRangeValues", "Preenchendo as datas da consulta.",
                     {"startDate": start_date, "endDate": end_date}, progress=22)
        self._action(page, "agency", "Selecionando Polícia Militar.", progress=25)
        page.wait_for_timeout(800)
        self._action(page, "unit", "Selecionando 10º BPM.", progress=28)
        self._action(page, "search", "Pesquisando ocorrências no CAD.", progress=32)
        self._wait_control(page, "Colunas", 120000)
        self._action(page, "columnMenu", "Abrindo a configuração de colunas.", progress=40)
        self._wait_control(page, "Aplicar")
        self._select_all_columns(page)
        self._action(page, "columns", "Aplicando todas as colunas.", progress=72)
        self._wait_control(page, "Exportação", 120000)
        self._action(page, "exportMenu", "Abrindo as opções de exportação.", progress=75)
        page.wait_for_timeout(300)
        download = self._request_xls_download(page)
        if download.failure():
            raise ValueError("O CAD não concluiu o download do XLS.")
        filename = Path(download.suggested_filename).name
        if Path(filename).suffix.lower() != ".xls":
            raise ValueError("O CAD enviou um arquivo diferente de XLS.")
        self.download_dir.mkdir(parents=True, exist_ok=True)
        saved = self.download_dir / f"{datetime.now():%Y%m%d-%H%M%S}-{filename}"
        download.save_as(saved)
        self._check_stop()
        content = saved.read_bytes()
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("O XLS está vazio ou acima do limite de 64 MB.")
        self._set("validating", "Validando a planilha antes da importação.", progress=88)
        validation = self.store.validate_file("ocorrencias", filename, content)
        self._check_stop()
        if validation["accepted"] == 0:
            raise ValueError("Nenhuma ocorrência válida foi encontrada no XLS.")
        self._set("importing", "Importando ocorrências no sistema 2.0.", progress=95)
        result = self.store.import_file("ocorrencias", filename, content, "partial")
        if self.on_import:
            self.on_import()
        self._set("complete", "Importação do CAD concluída.", {
            "row_count": result["row_count"], "inserted": result["inserted"],
            "updated": result["updated"], "quarantined": result["quarantined"],
            "repeated": result["repeated"],
        }, progress=100)
