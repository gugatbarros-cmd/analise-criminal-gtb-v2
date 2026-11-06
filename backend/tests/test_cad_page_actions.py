"""Verifica os controles de Drogas usando uma grade sintética do mesmo formato do CAD."""

import pytest
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from gtb.cad.automation import ACTIONS


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
