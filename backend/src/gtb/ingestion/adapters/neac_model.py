"""Campos do relatório NEAC/MDX; não usa dia isolado como serial Excel."""
import re
from datetime import date

from gtb.indicators.rules import event_date, key, plain

NEAC_ADAPTER_VERSION = '0.1.19'
MONTHS = {name: index for index, name in enumerate((
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'), 1)}


def is_neac_model(columns: dict) -> bool:
    return {'cidade', 'data', 'subjetividadecomplementar', 'ano', 'dia', 'mes'} <= columns.keys() and bool(
        {'nomevitima', 'nomedavitima'} & columns.keys())


def placeholder(header: str) -> bool:
    return not header.strip() or bool(re.fullmatch(r'coluna\s*\d+', header.strip(), re.IGNORECASE))


def add_adjacent_fields(names: list[str], values: list[str], row: dict) -> None:
    columns = {key(name): value for name, value in row.items()}
    if not is_neac_model(columns):
        return
    for index, name in enumerate(names):
        if index >= len(values) or str(values[index]).strip():
            continue
        field = key(name)
        adjacent = index + 1 if field == 'bairro' else index - 1
        if field not in {'bairro', 'data', 'iml', 'diasemana'} or not 0 <= adjacent < min(len(names), len(values)):
            continue
        if placeholder(names[adjacent]) and str(values[adjacent]).strip():
            row['__neac_' + field + '_adjacente'] = str(values[adjacent]).strip()


def model_date(columns: dict) -> str:
    value = columns.get('data') or columns.get('neacdataadjacente') or columns.get('coluna2', '')
    year_text = str(columns.get('ano', '')).strip()
    try:
        year_number = float(year_text)
        year = int(year_number)
        if not year_number.is_integer() or not 1900 <= year <= 2099:
            raise ValueError
    except (ValueError, OverflowError):
        raise ValueError('Ano inválido no relatório NEAC') from None
    if str(value).strip():
        parsed = event_date(value)
        if parsed is None or not 1900 <= parsed.year <= 2099:
            raise ValueError('Data do fato inválida no relatório NEAC')
        if parsed.year != year:
            raise ValueError('Ano da planilha NEAC diverge da data do fato')
        return parsed.isoformat()
    # Só compor uma data quando os três campos explícitos existem e são válidos.
    try:
        month_text = plain(columns.get('mes', ''))
        month = MONTHS.get(month_text)
        if month is None:
            month = int(month_text)
        return date(year, month, int(str(columns.get('dia', '')).strip())).isoformat()
    except (ValueError, TypeError):
        raise ValueError('Data do fato inválida ou ausente no relatório NEAC') from None
