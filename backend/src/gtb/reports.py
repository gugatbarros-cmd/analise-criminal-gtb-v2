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


def people_fields(row: dict, source: str) -> list[dict[str, str]]:
    """Retorna somente sexo e idade de campos estruturados, com o vínculo declarado."""
    result: dict[str, dict[str, str]] = {}
    aliases = {
        'Vítima': (('sexo da vitima', 'sexo vitima', 'genero da vitima', 'genero vitima'),
                   ('idade da vitima', 'idade vitima')),
        'Autor(a)': (('sexo do autor', 'sexo da autora', 'sexo autor', 'genero do autor',
                     'genero da autora', 'sexo do agressor', 'sexo da agressora'),
                    ('idade do autor', 'idade da autora', 'idade autor', 'idade do agressor',
                     'idade da agressora')),
        'Envolvido(a)': (('sexo do envolvido', 'sexo da envolvida', 'genero do envolvido',
                          'genero da envolvida', 'sexo do solicitante'),
                         ('idade do envolvido', 'idade da envolvida', 'idade do solicitante')),
    }
    for role, (sex_aliases, age_aliases) in aliases.items():
        sex, age = field(row, *sex_aliases), field(row, *age_aliases)
        if sex or age:
            result[role] = {'role': role, 'sex': sex, 'age': age}
    generic_sex = field(row, 'sexo', 'genero', 'sexo/genero')
    generic_age = field(row, 'idade')
    if generic_sex or generic_age:
        involvement = key(field(row, 'envolvimento', 'tipo de envolvimento', 'papel'))
        role = ('Vítima' if source.startswith('mvi_') or involvement in {'vitima', 'ofendida', 'ofendido'}
                else 'Autor(a)' if involvement in {'autor', 'autora', 'agressor', 'agressora'}
                else 'Envolvido(a)' if involvement in {'envolvido', 'envolvida', 'solicitante'}
                else 'Pessoa sem vínculo informado')
        current = result.setdefault(role, {'role': role, 'sex': '', 'age': ''})
        current['sex'] = current['sex'] or generic_sex
        current['age'] = current['age'] or generic_age
    return list(result.values())


def report_dataset(store) -> dict:
    with store.lock, store._connect() as db:
        records = db.execute("""SELECT source,event_date,municipality,nature,category,
            eligible,indicators,occurrence,victim,raw_json FROM record_versions
            WHERE is_current ORDER BY source,event_date,natural_key""").fetchall()
        batches = db.execute('SELECT max(imported_at),count(*) FROM import_batches').fetchone()
        source_imports = db.execute('SELECT source,max(imported_at) FROM import_batches GROUP BY source').fetchall()
        quarantine = db.execute('SELECT count(*) FROM quarantine').fetchone()[0]
    facts = []
    for source, day, city, nature, category, eligible, indicators, occurrence, victim, raw in records:
        row = json.loads(raw)
        people = people_fields(row, source)
        victim_profile = next((item for item in people if item['role'] == 'Vítima'), {})
        age, sex = victim_profile.get('age', ''), victim_profile.get('sex', '')
        facts.append({
            'source': source, 'date': day.isoformat(), 'city': city,
            'nature': nature or '', 'category': category or '', 'eligible': eligible,
            'indicators': indicators, 'occurrence': occurrence,
            'victim': victim if source.startswith('mvi_') else '',
            'hour': mvi_hour(row), 'neighborhood': pick(row, 'neighborhood'),
            'age': age, 'sex': sex, 'instrument': pick(row, 'instrument'),
            'people': people,
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
            'sourceUpdatedAt': {source: str(imported_at) for source, imported_at in source_imports},
            'batches': batches[1], 'quarantined': quarantine}
