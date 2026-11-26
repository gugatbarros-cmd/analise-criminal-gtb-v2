"""Revisões humanas do MVI CAD e das localizações do mapa."""

import hashlib
import json
from datetime import UTC, datetime
from datetime import date as calendar_date

from gtb.indicators.mvi_narrative import (
    cad_attempted_mvi,
    cad_narrative_death_signal,
    cad_narrative_reviewable,
    narrative_values,
)
from gtb.indicators.rules import key, victim_role
from gtb.ingestion.adapters.normalize import normalize, pick
from gtb.map_location import incident_location, near_municipality


class StoreReviewMixin:
    def mvi_cad_review_cases(self, page: int = 1, size: int = 20,
                             status: str = 'pending', focus: str = 'all') -> dict:
        if (page < 1 or not 1 <= size <= 100 or status not in {'pending', 'all', 'reviewed'}
                or focus not in {'all', 'attempts', 'death_mentions'}):
            raise ValueError('Filtro de revisão inválido')
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT v.natural_key, v.row_hash, v.occurrence, v.victim,
                v.event_date, v.municipality, v.nature, v.category, v.eligible,
                v.reason, v.raw_json, r.decision, r.reviewer, r.reviewed_at,
                e.note, e.death_date
                FROM record_versions v LEFT JOIN mvi_cad_reviews r
                  ON v.natural_key = r.natural_key AND v.row_hash = r.row_hash
                LEFT JOIN mvi_cad_review_evidence e
                  ON v.natural_key = e.natural_key AND v.row_hash = e.row_hash
                WHERE v.source = 'mvi_cad' AND v.is_current
                ORDER BY v.event_date DESC, v.natural_key""").fetchall()
            neac_rows = db.execute("""SELECT year, occurrence, victim, municipality,
                event_date, category FROM record_versions
                WHERE source = 'mvi_neac' AND is_current AND eligible""").fetchall()
        neac_by_person = {}
        for year, occurrence, victim, city, day, category in neac_rows:
            if key(victim):
                neac_by_person.setdefault((year, key(victim)), []).append(
                    (occurrence, city, day, category))
        items = []
        for (natural_key, row_hash, occurrence, victim, day, city, nature, category,
             eligible, reason, raw, decision, reviewer, reviewed_at, note, death_date) in rows:
            fields = json.loads(raw)
            if not victim_role(pick(fields, 'role')):
                continue
            attempted = cad_attempted_mvi(nature)
            narrative_match = cad_narrative_reviewable(fields)
            if not attempted and not narrative_match:
                continue
            if focus == 'attempts' and not attempted:
                continue
            if focus == 'death_mentions' and (attempted or not narrative_match):
                continue
            if status == 'pending' and (decision or eligible):
                continue
            if status == 'reviewed' and not decision:
                continue
            neac_candidates = []
            if attempted and victim:
                for neac_occurrence, neac_city, neac_day, neac_category in neac_by_person.get(
                        (day.year, key(victim)), []):
                    if key(city) != key(neac_city) or abs((neac_day - day).days) > 30:
                        continue
                    neac_candidates.append({'occurrence': neac_occurrence,
                                            'event_date': str(neac_day),
                                            'municipality': neac_city,
                                            'category': neac_category,
                                            'same_occurrence': key(occurrence) == key(neac_occurrence)})
            items.append({'natural_key': natural_key, 'row_hash': row_hash,
                          'occurrence': occurrence, 'victim': victim, 'event_date': str(day),
                          'municipality': city, 'nature': nature, 'category': category,
                          'eligible': eligible, 'reason': reason, 'decision': decision,
                          'reviewer': reviewer, 'reviewed_at': str(reviewed_at) if reviewed_at else None,
                          'attempted': attempted,
                          'death_signal': cad_narrative_death_signal(fields),
                          'evidence_note': note, 'death_date': str(death_date) if death_date else None,
                          'neac_candidates': neac_candidates[:3],
                          'narratives': [value[:20000] for value in narrative_values(fields)]})
        items.sort(key=lambda item: (not item['attempted'],
                                     not item['death_signal'],
                                     not bool(item['neac_candidates'])))
        return {'items': items[(page - 1) * size:page * size], 'total': len(items),
                'page': page, 'size': size}

    def processed_revision_signature(self) -> str:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT natural_key, row_hash, eligible, category
                FROM record_versions WHERE source = 'mvi_cad' AND is_current
                ORDER BY natural_key""").fetchall()
            locations = db.execute("""SELECT source, natural_key, row_hash, latitude, longitude
                FROM map_location_overrides ORDER BY source, natural_key, row_hash""").fetchall()
        return hashlib.sha256(json.dumps([rows, locations], ensure_ascii=False).encode()).hexdigest()

    def review_mvi_cad(self, natural_key: str, row_hash: str, decision: str,
                       category: str | None, reviewer: str,
                       evidence_note: str | None = None,
                       death_date: str | None = None) -> dict:
        if decision not in {'confirmed', 'rejected', 'pending'}:
            raise ValueError('Decisão desconhecida')
        allowed = {'Homicídio doloso', 'Feminicídio', 'Latrocínio',
                   'Lesão corporal seguida de morte'}
        if decision == 'confirmed' and category not in allowed:
            raise ValueError('Classificação MVI obrigatória')
        note = ' '.join((evidence_note or '').split())
        if len(note) > 1000:
            raise ValueError('Referência da confirmação acima de 1.000 caracteres')
        try:
            confirmed_death = calendar_date.fromisoformat(death_date) if death_date else None
        except ValueError as error:
            raise ValueError('Data do óbito inválida') from error
        with self.lock, self._connect() as db:
            db.execute('BEGIN TRANSACTION')
            try:
                row = db.execute("""SELECT version, row_hash, raw_json, nature, event_date
                    FROM record_versions
                    WHERE source = 'mvi_cad' AND natural_key = ? AND is_current""",
                                 [natural_key]).fetchone()
                if not row or row[1] != row_hash:
                    raise ValueError('Caso alterado após a leitura; atualize a lista')
                fields = json.loads(row[2])
                attempted = cad_attempted_mvi(row[3])
                if not attempted and not cad_narrative_reviewable(fields):
                    raise ValueError('Relato sem indício de MVI')
                if not victim_role(pick(fields, 'role')):
                    raise ValueError('Registro não identifica a pessoa como vítima')
                if decision == 'confirmed' and attempted and len(note) < 12:
                    raise ValueError('Informe a referência que confirma o óbito após a tentativa')
                if confirmed_death and confirmed_death < row[4]:
                    raise ValueError('Data do óbito anterior à data da tentativa')
                original = normalize('mvi_cad', fields)
                eligible = decision == 'confirmed' or (decision == 'pending' and original.eligible)
                chosen = category if decision == 'confirmed' else original.category
                reason = ('MVI confirmado por revisão humana do relato' if decision == 'confirmed'
                          else 'MVI descartado por revisão humana do relato' if decision == 'rejected'
                          else original.reason)
                db.execute("""UPDATE record_versions SET eligible = ?, category = ?, reason = ?
                    WHERE source = 'mvi_cad' AND natural_key = ? AND version = ?""",
                           [eligible, chosen, reason, natural_key, row[0]])
                db.execute('DELETE FROM mvi_cad_reviews WHERE natural_key = ? AND row_hash = ?',
                           [natural_key, row_hash])
                db.execute('DELETE FROM mvi_cad_review_evidence WHERE natural_key = ? AND row_hash = ?',
                           [natural_key, row_hash])
                if decision != 'pending':
                    db.execute('INSERT INTO mvi_cad_reviews VALUES (?, ?, ?, ?, ?, ?)',
                               [natural_key, row_hash, decision, chosen, reviewer, datetime.now(UTC)])
                    if note or confirmed_death:
                        db.execute('INSERT INTO mvi_cad_review_evidence VALUES (?, ?, ?, ?)',
                                   [natural_key, row_hash, note, confirmed_death])
                db.execute('COMMIT')
            except Exception:
                db.execute('ROLLBACK')
                raise
        return {'natural_key': natural_key, 'decision': decision, 'eligible': eligible,
                'category': chosen}

    def map_location_review_cases(self, page: int = 1, size: int = 20,
                                  status: str = 'pending') -> dict:
        if page < 1 or not 1 <= size <= 100 or status not in {'pending', 'reviewed', 'all'}:
            raise ValueError('Filtro de localização inválido')
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT v.source, v.natural_key, v.row_hash, v.occurrence,
                v.event_date, v.municipality, v.nature, v.raw_json,
                m.latitude, m.longitude, m.reviewer, m.reviewed_at
                FROM record_versions v LEFT JOIN map_location_overrides m
                  ON v.source = m.source AND v.natural_key = m.natural_key AND v.row_hash = m.row_hash
                WHERE v.source IN ('mvi_cad', 'mvi_neac', 'ocorrencias')
                  AND v.is_current AND v.eligible
                ORDER BY v.event_date DESC, v.natural_key""").fetchall()
        items = []
        for source, natural_key, row_hash, occurrence, day, city, nature, raw, latitude, longitude, reviewer, reviewed_at in rows:
            location = incident_location(source, json.loads(raw))
            if not location['street'] or (location['latitude'] is not None and
                                         near_municipality(location['latitude'], location['longitude'], city)):
                continue
            if status == 'pending' and latitude is not None:
                continue
            if status == 'reviewed' and latitude is None:
                continue
            items.append({'source': source, 'natural_key': natural_key, 'row_hash': row_hash,
                          'occurrence': occurrence, 'event_date': str(day), 'municipality': city,
                          'nature': nature, 'street': location['street'],
                          'latitude': latitude, 'longitude': longitude,
                          'reviewer': reviewer, 'reviewed_at': str(reviewed_at) if reviewed_at else None})
        return {'items': items[(page - 1) * size:page * size], 'total': len(items),
                'page': page, 'size': size}

    def review_map_location(self, source: str, natural_key: str, row_hash: str,
                            latitude: float | None, longitude: float | None,
                            reviewer: str) -> dict:
        if source not in {'mvi_cad', 'mvi_neac', 'ocorrencias'}:
            raise ValueError('Fonte não disponível no mapa')
        if (latitude is None) != (longitude is None):
            raise ValueError('Informe as duas coordenadas ou limpe a localização')
        with self.lock, self._connect() as db:
            db.execute('BEGIN TRANSACTION')
            try:
                row = db.execute("""SELECT row_hash, raw_json, municipality, eligible
                    FROM record_versions WHERE source = ? AND natural_key = ? AND is_current""",
                                 [source, natural_key]).fetchone()
                if not row or row[0] != row_hash:
                    raise ValueError('Registro alterado após a leitura; atualize a lista')
                location = incident_location(source, json.loads(row[1]))
                if not row[3] or not location['street']:
                    raise ValueError('Registro sem endereço de ocorrência revisável')
                if latitude is not None and not near_municipality(latitude, longitude, row[2]):
                    raise ValueError('Coordenadas fora da região do município')
                db.execute('DELETE FROM map_location_overrides WHERE source = ? AND natural_key = ? AND row_hash = ?',
                           [source, natural_key, row_hash])
                if latitude is not None:
                    db.execute('INSERT INTO map_location_overrides VALUES (?, ?, ?, ?, ?, ?, ?)',
                               [source, natural_key, row_hash, latitude, longitude,
                                reviewer, datetime.now(UTC)])
                db.execute('COMMIT')
            except Exception:
                db.execute('ROLLBACK')
                raise
        return {'source': source, 'natural_key': natural_key, 'latitude': latitude,
                'longitude': longitude}
