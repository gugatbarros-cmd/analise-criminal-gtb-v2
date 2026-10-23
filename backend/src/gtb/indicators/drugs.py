"""Indicadores provisórios da planilha de drogas conforme funções do legado."""

import hashlib
import json
import re

from gtb.indicators.rules import key

FIELDS = {
    "type": ("tipo de droga", "substancia", "entorpecente", "droga", "drogas", "drogras"),
    "quantity": ("quantidade apreendida", "quantidade", "peso", "massa", "qtd"),
    "unit": ("unidade de medida", "unidade", "medida"),
    "location": ("local da apreensao", "local do fato", "bairro", "localidade",
                 "logradouro", "endereco"),
}


def drug_field(row: dict[str, str], field: str) -> str:
    headers = [(key(column), str(value).strip()) for column, value in row.items()]
    for alias in FIELDS[field]:
        wanted = key(alias)
        for column, value in headers:
            if column == wanted and value:
                return value
        for column, value in headers:
            if column.startswith(wanted) and value and "id" not in column[:2] and "fk" not in column[:2]:
                return value
    return ""


def drug_identity(row: dict[str, str], year: int) -> str:
    for column, value in row.items():
        if "idocordespcenvldrog" in key(column) and str(value).strip():
            return f"{year}|drug-id:{key(str(value))}"
    canonical = {key(column): str(value).strip() for column, value in row.items()}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return f"{year}|drug-row:{digest}"


def drug_type(row: dict[str, str]) -> str:
    explicit = drug_field(row, "type")
    if explicit:
        return explicit
    text = key(" ".join(str(value) for value in row.values()))
    for name, pattern in (("Maconha", "maconha|cannabis"), ("Cocaína", "cocaina"),
                          ("Crack", "crack"), ("Ecstasy/MDMA", "ecstasy|mdma"),
                          ("LSD", "lsd"), ("Skunk", "skunk"),
                          ("Pasta base", "pastabase"), ("Inalantes", "lolo|inalante")):
        if re.search(pattern, text):
            return name
    return "Não informado"


def drug_quantity(row: dict[str, str]) -> float | None:
    value = drug_field(row, "quantity")
    if not value:
        return None
    normalized = value.replace(".", "").replace(",", ".") if "," in value else value
    match = re.search(r"-?\d+(?:\.\d+)?", normalized)
    quantity = float(match.group()) if match else None
    return quantity if quantity is not None and quantity >= 0 else None


def drug_weight_grams(row: dict[str, str]) -> float | None:
    quantity = drug_quantity(row)
    if quantity is None:
        return None
    headers = " ".join(column for column in row if key(column).startswith(
        ("quantidade", "peso", "massa", "qtd")))
    text = key(" ".join((drug_field(row, "unit"), headers, drug_field(row, "quantity"))))
    if re.search(r"kg|quilo|quilograma", text):
        return quantity * 1000
    if re.search(r"mg|miligrama", text):
        return quantity / 1000
    if re.search(r"grama|grs|gr|g", text):
        return quantity
    return None
