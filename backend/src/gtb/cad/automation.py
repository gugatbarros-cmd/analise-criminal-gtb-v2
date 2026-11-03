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


def check_period(start_date: str, end_date: str) -> None:
    try:
        start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    except ValueError as error:
        raise ValueError("Informe as datas inicial e final do intervalo.") from error
    if start.isoformat() != start_date or end.isoformat() != end_date or start > end:
        raise ValueError("Informe um intervalo válido com a data inicial anterior à final.")


class CadImportManager:
    def __init__(self, store: Store, data_dir: Path, on_import=None):
        self.store = store
        self.download_dir = data_dir / "cad-downloads"
        self.on_import = on_import
        self.commands: queue.Queue[tuple[str, str]] = queue.Queue()
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.worker: threading.Thread | None = None
        self.phase = "idle"
        self.message = "Informe CPF, senha e o intervalo desejado para consultar o CAD."
        self.result: dict | None = None

    def _set(self, phase: str, message: str, result: dict | None = None) -> None:
        with self.lock:
            self.phase, self.message, self.result = phase, message, result

    def status(self) -> dict:
        with self.lock:
            return {"phase": self.phase, "message": self.message, "result": self.result}

    def start(self, cpf: str, password: str, start_date: str, end_date: str) -> dict:
        if not re.fullmatch(r"\d{11}", cpf or "") or not password or len(password) > 200:
            raise ValueError("Informe os 11 dígitos do CPF e a senha do CAD.")
        check_period(start_date, end_date)
        with self.lock:
            if self.worker and self.worker.is_alive():
                raise ValueError("Já existe uma consulta CAD em andamento. Encerre-a antes de começar outra.")
            self.phase, self.message, self.result = "opening", "Abrindo o CAD…", None
            self.commands = queue.Queue()
            self.stop.clear()
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
        self._set("verifying", "Token enviado. Aguardando confirmação do CAD…")
        return self.status()

    def disconnect(self) -> dict:
        self.stop.set()
        self.commands.put(("disconnect", ""))
        return self.status()

    def _check_stop(self) -> None:
        if self.stop.is_set():
            raise ValueError("Sessão do CAD encerrada.")

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
                    self._download_and_import(page, start_date, end_date)
                    # A sessão do CAD é temporária e termina após o lote.
                finally:
                    browser.close()
        except PlaywrightError:
            self._set("error", "O navegador não concluiu a etapa: " + self.status()["message"])
        except (ValueError, OSError, TimeoutError) as error:
            self._set("error", str(error)[:500])
        except Exception:  # noqa: BLE001 — erro inesperado não pode deixar a interface aguardando.
            self._set("error", "A consulta CAD parou antes de confirmar a importação. "
                      "Confira a janela oficial e tente novamente.")

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
        self._set("token", "Aguarde o token do CAD e informe-o aqui.")

    def _await_access(self, page) -> None:
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            self._check_stop()
            if page.is_closed():
                raise ValueError("A janela do CAD foi fechada.")
            if urlparse(page.url).path == MENU_PATH:
                self._set("filtering", "Acesso confirmado. Preparando a consulta.")
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

    def _action(self, page, action: str, message: str, options: dict | None = None) -> dict:
        self._check_stop()
        if not page.url.startswith(CAD_ORIGIN + "/"):
            raise ValueError("A página atual não pertence ao CAD.")
        self._set("filtering", message)
        result = page.evaluate(f"({ACTIONS})({json.dumps(action)}, {json.dumps(options or {})})")
        if not result or not result.get("ok"):
            raise ValueError(result.get("reason", f"O CAD não concluiu {action}.") if result else
                             f"O CAD não concluiu {action}.")
        return result

    def _select_all_columns(self, page) -> None:
        for _ in range(200):
            inventory = self._action(page, "columnInventory", "Selecionando as colunas do relatório.")
            if not inventory.get("count"):
                return
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
        raise ValueError("A lista de colunas excedeu o limite esperado.")

    def _download_and_import(self, page, start_date: str, end_date: str) -> None:
        page.goto(OCCURRENCES_URL, wait_until="load", timeout=45000)
        if not page.url.startswith(OCCURRENCES_URL):
            raise ValueError("A consulta de ocorrências não abriu no CAD.")
        self._wait_control(page, "Pesquisar")
        self._action(page, "dateRangeMode", "Selecionando o intervalo de datas.")
        page.wait_for_timeout(800)
        self._action(page, "dateRangeValues", "Preenchendo as datas da consulta.",
                     {"startDate": start_date, "endDate": end_date})
        self._action(page, "agency", "Selecionando Polícia Militar.")
        page.wait_for_timeout(800)
        self._action(page, "unit", "Selecionando 10º BPM.")
        self._action(page, "search", "Pesquisando ocorrências no CAD.")
        self._wait_control(page, "Colunas", 120000)
        self._action(page, "columnMenu", "Abrindo a configuração de colunas.")
        self._wait_control(page, "Aplicar")
        self._select_all_columns(page)
        self._action(page, "columns", "Aplicando todas as colunas.")
        self._wait_control(page, "Exportação", 120000)
        self._action(page, "exportMenu", "Abrindo as opções de exportação.")
        page.wait_for_timeout(300)
        self._action(page, "xls", "Gerando a planilha XLS.")
        self._wait_control(page, "Baixar", 120000)
        self._set("downloading", "Baixando o XLS do CAD…")
        with page.expect_download(timeout=120000) as transfer:
            page.get_by_text("Baixar", exact=True).click()
        download = transfer.value
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
        self._set("validating", "Validando a planilha antes da importação.")
        validation = self.store.validate_file("ocorrencias", filename, content)
        if validation["accepted"] == 0:
            raise ValueError("Nenhuma ocorrência válida foi encontrada no XLS.")
        self._set("importing", "Importando ocorrências no sistema 2.0.")
        result = self.store.import_file("ocorrencias", filename, content, "partial")
        if self.on_import:
            self.on_import()
        self._set("complete", "Importação do CAD concluída.", {
            "row_count": result["row_count"], "inserted": result["inserted"],
            "updated": result["updated"], "quarantined": result["quarantined"],
            "repeated": result["repeated"],
        })
