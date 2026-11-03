"""Fatos diários sem identificadores pessoais para comparações autenticadas."""
import json

from gtb.indicators.arms import arm_quantity, arm_seized
from gtb.indicators.drugs import drug_weight_grams
from gtb.indicators.teams import canonical_team, team_complexity, team_field, team_group
from gtb.ingestion.adapters.normalize import pick


def comparison_dataset(store) -> dict:
    with store.lock, store._connect() as db:
        records = db.execute("""SELECT source,event_date,municipality,nature,category,
            eligible,indicators,raw_json FROM record_versions
            WHERE is_current ORDER BY source,event_date,natural_key""").fetchall()
        updated = db.execute('SELECT max(imported_at) FROM import_batches').fetchone()[0]
    groups = {}
    for source, day, city, nature, category, eligible, indicators, raw in records:
        fields = json.loads(raw) if source in {'armas', 'drogas', 'guarnicoes'} else {}
        group = team_group(canonical_team(team_field(fields, 'team'))) if source == 'guarnicoes' else ''
        identity = (source, day.isoformat(), city, nature or '', category or '', eligible, tuple(sorted(indicators)), group)
        fact = groups.setdefault(identity, {
            'source': source, 'date': day.isoformat(), 'city': city,
            'nature': nature or '', 'category': category or '', 'eligible': eligible,
            'indicators': sorted(indicators), 'teamGroup': group,
            'records': 0, 'units': 0, 'grams': 0, 'weighted': 0, 'points': 0,
        })
        fact['records'] += 1
        if source == 'armas' and arm_seized(fields):
            fact['units'] += arm_quantity(fields)
        if source == 'drogas':
            grams = drug_weight_grams(fields)
            if grams is not None:
                fact['grams'] += grams
                fact['weighted'] += 1
        if source == 'guarnicoes':
            fact['points'] += team_complexity(nature or '', pick(fields, 'solution'))[0]
    return {'rows': list(groups.values()), 'updatedAt': str(updated) if updated else None}
