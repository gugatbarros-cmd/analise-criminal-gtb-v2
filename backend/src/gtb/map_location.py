"""Localização declarada nas bases importadas, sem geocodificação externa."""

import re
from math import asin, cos, radians, sin, sqrt

from gtb.indicators.rules import key

LATITUDE_KEYS = ('latitude ocorrencia', 'latitude da ocorrencia', 'latitude do fato',
                 'latitude local do fato', 'coordenada latitude', 'coord latitude', 'latitude', 'lat')
LONGITUDE_KEYS = ('longitude ocorrencia', 'longitude da ocorrencia', 'longitude do fato',
                  'longitude local do fato', 'coordenada longitude', 'coord longitude',
                  'longitude', 'lon', 'lng', 'long')
PAIR_KEYS = ('coordenadas ocorrencia', 'coordenadas do fato', 'coordenadas',
             'coordenadas gps', 'lat long', 'latitude longitude')
MUNICIPALITY_POINTS = {
    'palmeiradosindios': (-9.4057, -36.6328), 'belem': (-9.5705, -36.4904),
    'tanquedarca': (-9.5332, -36.4360), 'maribondo': (-9.5835, -36.3044),
    'igaci': (-9.5369, -36.6338), 'quebrangulo': (-9.3185, -36.4722),
    'paulojacinto': (-9.3672, -36.3672), 'marvermelho': (-9.4474, -36.3881),
    'estreladealagoas': (-9.3909, -36.7644), 'minadordonegrao': (-9.3123, -36.8696),
    'cacimbinhas': (-9.4012, -36.9911),
}


def near_municipality(latitude: float, longitude: float, municipality: str) -> bool:
    center = MUNICIPALITY_POINTS.get(key(municipality))
    if not center or not _in_alagoas(latitude, longitude):
        return False
    a = sin(radians(latitude - center[0]) / 2) ** 2 + (
        cos(radians(center[0])) * cos(radians(latitude)) *
        sin(radians(longitude - center[1]) / 2) ** 2)
    return 12742 * asin(min(1, sqrt(a))) <= 35


def incident_location(source: str, row: dict) -> dict:
    if source == 'mvi_neac':
        # O endereço simples do NEAC pode ser o domicílio da vítima.
        row = {name: value for name, value in row.items()
               if any(part in key(name) for part in ('ocorrencia', 'fato'))}
    return cad_location(row)


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
    street = str(first(('endereco ocorrencia', 'endereco da ocorrencia', 'endereco do fato',
                        'local do fato', 'logradouro ocorrencia', 'logradouro do fato',
                        'endereco', 'logradouro')))[:180].strip()
    public_street = re.sub(r'(?:,\s*|\s+n[ºo.]?\s+)\d{1,6}\b.*$', '', street, flags=re.IGNORECASE).strip(' ,')
    public_street = re.sub(r'\s+\d{1,6}(?:[-/]\w+)?$', '', public_street).strip(' ,')
    number = str(first(('no do endereco', 'n do endereco', 'numero do endereco')))[:20].strip()
    if number and number.isdigit():
        public_street = re.sub(rf'\s+{re.escape(number)}$', '', public_street).strip(' ,')
    if number and number.lower() not in {'s/n', 'sn'} and not re.search(rf'\b{re.escape(number)}\b', street):
        street = f'{street}, {number}' if street else number
    neighborhood = str(first(('bairro ocorrencia', 'bairro da ocorrencia', 'bairro', 'comunidade ocorrencia')))[:100].strip()
    address = ', '.join(part for part in (street, neighborhood) if part)
    return {'address': address, 'street': public_street, 'latitude': latitude, 'longitude': longitude}
