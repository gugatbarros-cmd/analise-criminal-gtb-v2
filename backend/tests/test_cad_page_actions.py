"""Verifica os controles de Drogas usando uma grade sintética do mesmo formato do CAD."""

import pytest
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from gtb.cad.automation import ACTIONS, CadImportManager
from gtb.db.store import Store


@pytest.mark.parametrize("label,action", [
    ("Pesquisa Avançada", "advancedSearch"),
    ("Pesquisar", "search"),
])
def test_drugs_search_accepts_available_cad_control(tmp_path, label, action):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            page.set_content(f'<button aria-label="{label}" onclick="window.clicked=true">Buscar</button>')

            class CadPage:
                url = "https://analisacad.seguranca.al.gov.br/app/cad/cad_grid_droga_boletim/"

                def is_closed(self):
                    return False

                def wait_for_function(self, *args, **kwargs):
                    return page.wait_for_function(*args, **kwargs)

            manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
            assert manager._wait_control(CadPage(), ("Pesquisa Avançada", "Pesquisar")) == label
            assert page.evaluate(f"({ACTIONS})('{action}')") == {"ok": True}
            page.wait_for_function("window.clicked === true")
        finally:
            browser.close()


def test_cad_follows_columns_in_result_popup_and_frame(tmp_path):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            context = browser.new_context()
            origin = "https://analisacad.seguranca.al.gov.br"
            def serve(route):
                path = route.request.url.split("/")[-1]
                html = ("<button onclick=\"window.open('/resultados','_blank')\">Pesquisar</button>"
                        if path == "consulta" else
                        "<iframe src='/controles'></iframe>" if path == "resultados" else
                        "<button onclick=\"window.clicked=true\">Colunas</button>")
                route.fulfill(status=200, content_type="text/html", body=html)
            context.route(f"{origin}/**", serve)
            page = context.new_page()
            page.goto(f"{origin}/consulta")
            with page.expect_popup() as popup_info:
                page.get_by_role("button", name="Pesquisar").click()
            popup = popup_info.value
            manager = CadImportManager(Store(tmp_path / "gtb.duckdb"), tmp_path)
            assert manager._wait_control(page, "Colunas", timeout=5000) == "Colunas"
            assert manager._cad_control_page is popup
            assert manager._cad_control_frame is not popup.main_frame
            manager._action(page, "columnMenu", "Abrindo colunas")
            popup.frame_locator("iframe").locator("body").wait_for()
            assert manager._cad_control_frame.evaluate("window.clicked") is True
        finally:
            browser.close()


@pytest.mark.parametrize("label", ["Unidade Despacho", "Unidade Despacho:",
                                    "Unidade de Despacho:", "Unidade / Despacho",
                                    "Unidade Despacho da ocorrência"])
@pytest.mark.parametrize("preselected", [False, True])
def test_dispatch_unit_moves_only_tenth_bpm_from_labeled_row(label, preselected):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            page.set_content("""
                <table><tr><td>Unidade</td><td><select id="other">
                  <option>9º BPM</option><option>10º BPM</option>
                </select></td></tr><tr><td>__LABEL__</td><td>
                  <select multiple id="source" style="display:inline-block;width:160px;height:100px">
                    <option>9º BPM</option><option>10º BPM</option><option>11º BPM</option>
                  </select>
                  <a id="Bbpassfld_righ" title="Campo Mover para a direita"
                     style="display:inline-block;width:30px;height:30px">&gt;</a>
                  <select multiple id="target" style="display:inline-block;width:160px;height:100px">__TARGET__</select>
                </td></tr></table>
                <script>
                  document.querySelector('#Bbpassfld_righ').onclick = () => {
                    const source = document.querySelector('#source');
                    const target = document.querySelector('#target');
                    for (const option of [...source.selectedOptions]) target.add(option);
                  };
                </script>
            """.replace("__LABEL__", label).replace(
                "__TARGET__", "<option>10º BPM</option>" if preselected else ""))
            assert page.evaluate(f"({ACTIONS})('dispatchUnit', {{grade:'drugs'}})") == {"ok": True}
            assert page.locator("#target option").all_text_contents() == ["10º BPM"]
            assert page.locator("#source option").all_text_contents() == (
                ["9º BPM", "10º BPM", "11º BPM"] if preselected else ["9º BPM", "11º BPM"])
            assert page.locator("#other").input_value() == "9º BPM"
        finally:
            browser.close()


def test_dispatch_unit_uses_named_field_when_label_is_on_another_row():
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            page.set_content("""
                <table>
                  <tr><td>Unidade de Despacho:</td></tr>
                  <tr><td><select id="unidade_despacho">
                    <option>9º BPM</option><option>10º BPM</option>
                  </select></td></tr>
                  <tr><td>Unidade</td><td><select id="unidade">
                    <option>9º BPM</option><option>10º BPM</option>
                  </select></td></tr>
                </table>
            """)
            assert page.evaluate(f"({ACTIONS})('dispatchUnit', {{grade:'armas'}})") == {"ok": True}
            assert page.locator("#unidade_despacho").input_value() == "10º BPM"
            assert page.locator("#unidade").input_value() == "9º BPM"
        finally:
            browser.close()


@pytest.mark.parametrize("preselected", [False, True])
def test_drugs_titular_uses_the_two_lists_shown_by_cad(preselected):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            page.set_content(f"""
                <table><tr><td>Titular ou Apoio na ocorrência?</td><td>
                  <select multiple id="source" style="display:inline-block;width:160px;height:100px">
                    <option>Titular</option><option>Apoio</option>
                  </select>
                  <a title="Campo Mover para a direita" style="display:inline-block;width:30px;height:30px">&gt;</a>
                  <select multiple id="target" style="display:inline-block;width:160px;height:100px">
                    {'<option>Titular</option>' if preselected else ''}
                  </select>
                </td></tr></table>
                <script>
                  document.querySelector('a').onclick = () => {{
                    const source = document.querySelector('#source');
                    const target = document.querySelector('#target');
                    for (const option of [...source.selectedOptions]) target.add(option);
                  }};
                </script>
            """)
            assert page.evaluate(f"({ACTIONS})('titular')") == {"ok": True}
            assert page.locator("#target option").all_text_contents() == ["Titular"]
        finally:
            browser.close()


@pytest.mark.parametrize("with_seconds", [False, True])
def test_date_range_accepts_cad_fields_with_optional_seconds(with_seconds):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            suffixes = ["dia", "mes", "ano", "hor", "min"] + (["seg"] if with_seconds else [])
            inputs = "".join(
                f'<input type="text" name="ocor_dt_ocor{end}_{suffix}" maxlength="{4 if suffix == "ano" else 2}">'
                for end in ("", "_input_2") for suffix in suffixes
            )
            page.set_content(
                '<table><tr><td>Data da Ocorrência</td><td>'
                '<select><option selected>Intervalo</option></select>' + inputs + '</td></tr></table>'
            )
            result = page.evaluate(
                f"({ACTIONS})('dateRangeValues', {{startDate:'2026-11-01',endDate:'2026-11-06'}})"
            )
            assert result == {"ok": True}
            values = page.locator("input").evaluate_all("fields => fields.map(field => field.value)")
            start = ["01", "11", "2026", "00", "00"] + (["00"] if with_seconds else [])
            end = ["06", "11", "2026", "23", "59"] + (["59"] if with_seconds else [])
            assert values == start + end
        finally:
            browser.close()


@pytest.mark.parametrize("grade", ["drugs", "drogas", "armas"])
def test_cad_columns_target_the_official_available_and_selected_lists(grade):
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except PlaywrightError:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except PlaywrightError:
                pytest.skip("Chrome ou Edge necessário para testar os controles CAD")
        try:
            page = browser.new_page()
            page.set_content("""
                <button onclick="window.applied = true">Aplicar</button>
                <ul class="sc_ui_fldsel_available" style="display:inline-block;width:220px;height:180px">
                  <li>Identificador</li><li>Data que incluiu o registro</li>
                </ul>
                <ul class="sc_ui_fldsel_selected" style="display:inline-block;width:220px;height:180px">
                  <li>Boletim</li>
                </ul>
            """)
            inventory = page.evaluate(f"({ACTIONS})('columnInventory', {{grade:'{grade}'}})")
            assert inventory["ok"] and inventory["count"] == 2
            assert inventory["from"]["x"] < inventory["to"]["x"]
            page.locator(".sc_ui_fldsel_available li").first.evaluate("element => element.remove()")
            assert page.evaluate(f"({ACTIONS})('columns', {{grade:'{grade}'}})")["ok"] is False
            page.locator(".sc_ui_fldsel_available li").first.evaluate("element => element.remove()")
            assert page.evaluate(f"({ACTIONS})('columnInventory', {{grade:'{grade}'}})")["count"] == 0
            assert page.evaluate(f"({ACTIONS})('columns', {{grade:'{grade}'}})")["ok"]
            page.wait_for_function("window.applied === true")
        finally:
            browser.close()
