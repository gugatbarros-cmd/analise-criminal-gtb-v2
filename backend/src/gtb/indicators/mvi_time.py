"""Extrai horários informados para perfis MVI, sem imputar hora ausente."""

import re

from gtb.indicators.rules import key

TIME_FIELDS = (
    "hora da ocorrencia", "hora ocorrencia", "horario da ocorrencia",
    "horario ocorrencia", "hora do fato", "horario do fato", "hora", "horario",
    "data hora", "datahora", "data e hora",
)
DATE_FIELDS = ("data da ocorrencia", "data do fato", "data", "data do evento")
CLOCK = re.compile(r"(?<!\d)([01]?\d|2[0-3])\s*[:h.]\s*([0-5]\d)(?!\d)", re.IGNORECASE)
CLOCK_HOUR = re.compile(r"(?<!\d)([01]?\d|2[0-3])\s*h(?!\d)", re.IGNORECASE)
DATE = re.compile(r"\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}")


def _hour(value: object, *, allow_compact: bool) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = CLOCK.search(text)
    if match:
        return int(match.group(1))
    if not allow_compact or DATE.search(text):
        return None
    match = CLOCK_HOUR.search(text)
    if match:
        return int(match.group(1))
    if re.fullmatch(r"0[.,]\d+", text):
        return int(float(text.replace(",", ".")) * 24)
    if re.fullmatch(r"\d{3,4}", text):
        hour, minute = int(text[:-2]), int(text[-2:])
        return hour if hour < 24 and minute < 60 else None
    if re.fullmatch(r"\d{1,2}", text):
        hour = int(text)
        return hour if hour < 24 else None
    return None


def mvi_hour(row: dict[str, str]) -> int | None:
    """Prioriza hora específica; aceita hora embutida na data, nunca só a data."""
    normalized = {key(column): value for column, value in row.items() if column.strip()}
    for alias in TIME_FIELDS:
        value = normalized.get(key(alias))
        if value is not None:
            hour = _hour(value, allow_compact=True)
            if hour is not None:
                return hour
    for alias in DATE_FIELDS:
        value = normalized.get(key(alias))
        if value is not None:
            hour = _hour(value, allow_compact=False)
            if hour is not None:
                return hour
    return None


def time_band(hour: int) -> str:
    start = hour // 2 * 2
    return f"{start:02d}h–{(start + 2) % 24:02d}h"
