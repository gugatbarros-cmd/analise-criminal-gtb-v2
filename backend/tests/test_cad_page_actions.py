"""Verifica os controles de Drogas usando uma grade sintética do mesmo formato do CAD."""

import pytest
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from gtb.cad.automation import ACTIONS


def test_drugs_dispatch_unit_moves_only_tenth_bpm():
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
                <table><tr><td>Unidade Despacho</td><td>
                  <select multiple id="source" style="display:inline-block;width:160px;height:100px">
                    <option>9º BPM</option><option>10º BPM</option><option>11º BPM</option>
                  </select>
                  <a id="Bbpassfld_righ" title="Campo Mover para a direita"
                     style="display:inline-block;width:30px;height:30px">&gt;</a>
                  <select multiple id="target" style="display:inline-block;width:160px;height:100px"></select>
                </td></tr></table>
                <script>
                  document.querySelector('#Bbpassfld_righ').onclick = () => {
                    const source = document.querySelector('#source');
                    const target = document.querySelector('#target');
                    for (const option of [...source.selectedOptions]) target.add(option);
                  };
                </script>
            """)
            assert page.evaluate(f"({ACTIONS})('dispatchUnit', {{grade:'drugs'}})") == {"ok": True}
            assert page.locator("#target option").all_text_contents() == ["10º BPM"]
            assert page.locator("#source option").all_text_contents() == ["9º BPM", "11º BPM"]
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


def test_drugs_columns_target_the_official_available_and_selected_lists():
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
            inventory = page.evaluate(f"({ACTIONS})('columnInventory', {{grade:'drugs'}})")
            assert inventory["ok"] and inventory["count"] == 2
            assert inventory["from"]["x"] < inventory["to"]["x"]
            page.locator(".sc_ui_fldsel_available li").first.evaluate("element => element.remove()")
            assert page.evaluate(f"({ACTIONS})('columns', {{grade:'drugs'}})")["ok"] is False
            page.locator(".sc_ui_fldsel_available li").first.evaluate("element => element.remove()")
            assert page.evaluate(f"({ACTIONS})('columnInventory', {{grade:'drugs'}})")["count"] == 0
            assert page.evaluate(f"({ACTIONS})('columns', {{grade:'drugs'}})")["ok"]
            page.wait_for_function("window.applied === true")
        finally:
            browser.close()
