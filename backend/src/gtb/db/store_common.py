"""Constantes e funções compartilhadas pelos módulos do Store."""

import json

from gtb.indicators.rules import domestic_triage, operational_action
from gtb.ingestion.adapters.neac_model import NEAC_ADAPTER_VERSION

MAX_UPLOAD_BYTES = 64 * 1024 * 1024
ADAPTER_VERSION = "0.1.18"
CAD_ADAPTER_VERSION = "0.1.93-cad2"


def source_adapter_version(source: str) -> str:
    return (NEAC_ADAPTER_VERSION if source == "mvi_neac" else
            CAD_ADAPTER_VERSION if source == "mvi_cad" else ADAPTER_VERSION)


def indicator_evidence(raw_json: str, source: str, indicator: str | None) -> str:
    if source != "ocorrencias" or not indicator:
        return ""
    row = json.loads(raw_json)
    if indicator in {"Mandados", "Visitas", "Sossego"}:
        return operational_action(row, indicator)[1]
    if indicator.startswith("Doméstica"):
        decision = domestic_triage(row)
        return decision["reason"] + (" · " + decision["evidence"]
                                     if decision["evidence"] else "")
    return ""
