"""Localização declarada no arquivo MVI CAD, sem geocodificação externa."""

import re

from gtb.indicators.rules import key


LATITUDE_KEYS = ('latitude', 'lat', 'coordenada latitude', 'coord latitude', 'latitude ocorrencia', 'latitude do fato')
LONGITUDE_KEYS = ('longitude', 'lon', 'lng', 'long', 'coordenada longitude', 'coord longitude', 'longitude ocorrencia', 'longitude do fato')
PAIR_KEYS = ('coordenadas', 'coordenadas gps', 'lat long', 'latitude longitude')


def _number(value: object) -> float | None:
    text = str(value or '').strip().replace('−', '-').replace('º', '')
    if not re.fullmatch(r'[+-]?\d{1,3}(?:[.,]\d{1,8})?', text):
        return None
    return float(text.replace(',', '.'))


def _in_alagoas(latitude: float | None, longitude: float | None) -> bool:
    return latitude is not None and longitude is not None and -10.7 <= latitude <= -8.7 and -38 <= longitude <= -35


def cad_location(row: dict) -> dict:
    columns = {key(str(name)): value for name, value in row.items() if str(name).strip()}

    def first(names: tuple[str, ...]) -> object:
        return next((columns[key(name)] for name in names if columns.get(key(name)) is not None
                     and str(columns[key(name)]).strip()), '')

    latitude = _number(first(LATITUDE_KEYS))
    longitude = _number(first(LONGITUDE_KEYS))
    if latitude is None or longitude is None:
        pair = str(first(PAIR_KEYS))
        match = re.search(r'([+-]?\d{1,2}[.,]\d{3,8})\s*[,; /]\s*([+-]?\d{2}[.,]\d{3,8})', pair)
        if match:
            latitude, longitude = _number(match.group(1)), _number(match.group(2))
    if not _in_alagoas(latitude, longitude):
        latitude = longitude = None
    street = str(first(('endereco ocorrencia', 'endereco da ocorrencia', 'endereco', 'logradouro')))[:180].strip()
    public_street = re.sub(r'(?:,\s*|\s+n[ºo.]?\s+)\d{1,6}\b.*$', '', street, flags=re.I).strip(' ,')
    number = str(first(('no do endereco', 'n do endereco', 'numero do endereco')))[:20].strip()
    if number and number.isdigit():
        public_street = re.sub(rf'\s+{re.escape(number)}$', '', public_street).strip(' ,')
    if number and number.lower() not in {'s/n', 'sn'} and not re.search(rf'\b{re.escape(number)}\b', street):
        street = f'{street}, {number}' if street else number
    neighborhood = str(first(('bairro ocorrencia', 'bairro da ocorrencia', 'bairro', 'comunidade ocorrencia')))[:100].strip()
    address = ', '.join(part for part in (street, neighborhood) if part)
    return {'address': address, 'street': public_street, 'latitude': latitude, 'longitude': longitude}
