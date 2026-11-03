"""Projeção dos registros processados para os relatórios local e online.

Não expõe relatos, contatos, endereços completos ou os arquivos originais.
As decisões de inclusão são as já armazenadas pelo importador.
"""
import json

from gtb.indicators.arms import arm_field, arm_quantity, arm_restricted, arm_seized
from gtb.indicators.drugs import drug_field, drug_weight_grams
from gtb.indicators.mvi_time import mvi_hour
from gtb.indicators.rules import key
from gtb.indicators.teams import (
    canonical_team,
    team_complexity,
    team_field,
    team_group,
    team_officers,
)
from gtb.ingestion.adapters.normalize import pick


def field(row: dict, *aliases: str) -> str:
    fields = {key(name): str(value).strip() for name, value in row.items()}
    return next((fields[key(alias)] for alias in aliases if fields.get(key(alias))), '')


def report_dataset(store) -> dict:
    with store.lock, store._connect() as db:
        records = db.execute("""SELECT source,event_date,municipality,nature,category,
            eligible,indicators,occurrence,victim,raw_json FROM record_versions
            WHERE is_current ORDER BY source,event_date,natural_key""").fetchall()
        batches = db.execute('SELECT max(imported_at),count(*) FROM import_batches').fetchone()
        quarantine = db.execute('SELECT count(*) FROM quarantine').fetchone()[0]
    facts = []
    for source, day, city, nature, category, eligible, indicators, occurrence, victim, raw in records:
        row = json.loads(raw)
        victim_role = source.startswith('mvi_') or key(field(row, 'envolvimento', 'tipo de envolvimento', 'papel')) in {'vitima', 'ofendida'}
        age = field(row, 'idade da vitima', 'idade vitima') or (field(row, 'idade') if victim_role else '')
        sex = field(row, 'sexo da vitima', 'genero da vitima', 'sexo vitima') or (field(row, 'sexo', 'genero') if victim_role else '')
        facts.append({
            'source': source, 'date': day.isoformat(), 'city': city,
            'nature': nature or '', 'category': category or '', 'eligible': eligible,
            'indicators': indicators, 'occurrence': occurrence,
            'victim': victim if source.startswith('mvi_') else '',
            'hour': mvi_hour(row), 'neighborhood': pick(row, 'neighborhood'),
            'age': age, 'sex': sex, 'instrument': pick(row, 'instrument'),
            'solution': pick(row, 'solution'),
            'relationship': field(row, 'vinculo da vitima com o autor', 'vinculo', 'grau de parentesco', 'parentesco', 'relacao com o autor'),
            'aggression': field(row, 'tipo de agressao sofrida', 'tipo de agressao', 'agressao sofrida'),
            'quantity': arm_quantity(row) if source == 'armas' else 1,
            'seized': arm_seized(row) if source == 'armas' else False,
            'restricted': arm_restricted(row) if source == 'armas' else False,
            'caliber': arm_field(row, 'caliber') if source == 'armas' else '',
            'brand': field(row, 'marca da arma', 'marca') if source == 'armas' else '',
            'situation': arm_field(row, 'situation') if source == 'armas' else '',
            'grams': drug_weight_grams(row) if source == 'drogas' else None,
            'location': drug_field(row, 'location') if source == 'drogas' else '',
            'team': canonical_team(team_field(row, 'team')) if source == 'guarnicoes' else '',
            'teamGroup': team_group(canonical_team(team_field(row, 'team'))) if source == 'guarnicoes' else '',
            'points': team_complexity(nature or '', pick(row, 'solution'))[0] if source == 'guarnicoes' else 0,
            'officers': team_officers(team_field(row, 'officers')) if source == 'guarnicoes' else [],
        })
    return {'rows': facts, 'updatedAt': str(batches[0]) if batches[0] else None,
            'batches': batches[1], 'quarantined': quarantine}
