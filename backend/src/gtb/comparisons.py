"""Fatos diários sem identificadores pessoais para comparações autenticadas."""
import json

from gtb.indicators.arms import arm_quantity, arm_seized
from gtb.indicators.drugs import drug_weight_grams
from gtb.indicators.teams import canonical_team, team_complexity, team_field, team_group
from gtb.ingestion.adapters.normalize import pick
from gtb.map_location import incident_location


def comparison_dataset(store) -> dict:
    with store.lock, store._connect() as db:
        records = db.execute("""SELECT v.source,v.event_date,v.municipality,v.nature,v.category,
            v.eligible,v.indicators,v.raw_json,m.latitude,m.longitude
            FROM record_versions v LEFT JOIN map_location_overrides m
              ON v.source = m.source AND v.natural_key = m.natural_key AND v.row_hash = m.row_hash
            WHERE v.is_current ORDER BY v.source,v.event_date,v.natural_key""").fetchall()
        timestamps = [db.execute('SELECT max(imported_at) FROM import_batches').fetchone()[0],
                      db.execute('SELECT max(reviewed_at) FROM mvi_cad_reviews').fetchone()[0],
                      db.execute('SELECT max(reviewed_at) FROM map_location_overrides').fetchone()[0]]
        updated = max((value for value in timestamps if value), default=None)
    groups = {}
    for source, day, city, nature, category, eligible, indicators, raw, manual_lat, manual_lon in records:
        fields = json.loads(raw) if source in {'armas', 'drogas', 'guarnicoes', 'mvi_cad', 'mvi_neac', 'ocorrencias'} else {}
        group = team_group(canonical_team(team_field(fields, 'team'))) if source == 'guarnicoes' else ''
        location = incident_location(source, fields) if source in {'mvi_cad', 'mvi_neac', 'ocorrencias'} and eligible else None
        if location:
            if manual_lat is not None and manual_lon is not None:
                location['latitude'], location['longitude'] = manual_lat, manual_lon
            # A cópia autenticada do mapa mostra a rua, sem número de imóvel.
            location['address'] = location['street']
        identity = (source, day.isoformat(), city, nature or '', category or '', eligible, tuple(sorted(indicators)), group,
                    *(location.values() if location else ()))
        fact = groups.setdefault(identity, {
            'source': source, 'date': day.isoformat(), 'city': city,
            'nature': nature or '', 'category': category or '', 'eligible': eligible,
            'indicators': sorted(indicators), 'teamGroup': group,
            'records': 0, 'units': 0, 'grams': 0, 'weighted': 0, 'points': 0,
        })
        if location:
            fact.update(location)
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
