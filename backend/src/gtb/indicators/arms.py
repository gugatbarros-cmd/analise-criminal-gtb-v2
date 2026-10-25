"""Contagem provisória de armas, extraída das regras do legado 4.6.256."""

import re

from gtb.indicators.rules import key

FIELDS = {
    "serial": ("numero de serie", "numero serie", "n de serie", "n serie", "serial da arma",
               "serial", "serie"),
    "item_id": ("id da arma", "id arma", "codigo da arma", "codigo arma",
                "numero do item", "item da arma", "numero da arma",
                "id ocor despc envl arma"),
    "quantity": ("quantidade de armas", "quantidade armas", "qtd armas", "qtd de armas",
                 "quantidade da arma"),
    "situation": ("situacao da arma na ocorrencia", "situacao da arma", "situacao",
                  "status da arma", "status"),
    "type": ("tipo de arma", "tipo"),
    "caliber": ("calibre",),
    "use": ("uso", "classificacao de uso"),
}


def arm_field(row: dict[str, str], field: str) -> str:
    normalized = {key(column): str(value).strip() for column, value in row.items()}
    for alias in FIELDS[field]:
        value = normalized.get(key(alias))
        if value:
            return value
    return ""


def arm_identity(row: dict[str, str], occurrence: str, year: int) -> str:
    serial = key(arm_field(row, "serial"))
    if serial and serial not in {"sem", "sn", "naoinformado", "ignorado", "desconhecido", "0"}:
        return f"{year}|serial:{serial}"
    item_id = key(arm_field(row, "item_id"))
    if occurrence and item_id:
        return f"{year}|item:{key(occurrence)}:{item_id}"
    raise ValueError("Arma sem série ou ocorrência e ID estáveis")


def arm_quantity(row: dict[str, str]) -> int:
    raw = arm_field(row, "quantity").replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", raw)
    quantity = int(float(match.group())) if match else 1
    return quantity if 0 < quantity <= 1000 else 1


def arm_seized(row: dict[str, str]) -> bool:
    situation = arm_field(row, "situation")
    value = key(situation or " ".join(str(part) for part in row.values()))
    if re.search(r"nao(?:foi)?(?:apreendid|recolhid|localizad)|semapreensao", value):
        return False
    return bool(re.search(r"apreendid|apreensao|recolhid|localizad", value))


def arm_restricted(row: dict[str, str]) -> bool:
    return bool(re.search(r"restrito|proibido", key(arm_field(row, "use"))))
