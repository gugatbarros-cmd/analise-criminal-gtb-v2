"""Corrige somente dados derivados NEAC/MDX, com backup e transação."""
import json
import shutil
import uuid
from collections import defaultdict
from datetime import UTC, datetime

from gtb.indicators.rules import key
from gtb.ingestion.adapters.neac_model import NEAC_ADAPTER_VERSION, is_neac_model
from gtb.ingestion.adapters.normalize import normalize


def upgrade_neac(store) -> None:
    with store.lock:
        _upgrade_neac_locked(store)


def _upgrade_neac_locked(store) -> None:
    with store._connect() as db:
        previous = db.execute("SELECT adapter_version FROM source_types WHERE code='mvi_neac'").fetchone()
        if previous and previous[0] == NEAC_ADAPTER_VERSION:
            return
        cursor = db.execute("SELECT * FROM record_versions WHERE source='mvi_neac' ORDER BY valid_from,version,natural_key")
        columns = [column[0] for column in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        affected = [row for row in rows if is_neac_model({key(name): value for name, value in json.loads(row['raw_json']).items()})]
        if not affected:
            db.execute("UPDATE source_types SET adapter_version=? WHERE code='mvi_neac'", [NEAC_ADAPTER_VERSION])
            return
        db.execute('CHECKPOINT')
    backups = store.path.parent / 'backups'
    backups.mkdir(exist_ok=True)
    shutil.copy2(store.path, backups / f'before-neac-mdx-{uuid.uuid4()}.duckdb')
    stamp = datetime.now(UTC).replace(tzinfo=None)
    groups = defaultdict(list)
    rekeys = {}
    rejected = []
    for row in rows:
        row['_original_key'] = row['natural_key']
        raw = json.loads(row['raw_json'])
        if is_neac_model({key(name): value for name, value in raw.items()}):
            try:
                record = normalize('mvi_neac', raw)
                for field in ('natural_key','event_date','year','municipality','occurrence',
                              'victim','nature','category','eligible','reason'):
                    row[field] = getattr(record, field)
                row['indicators'] = list(record.indicators)
                rekeys[row['_original_key']] = record.natural_key
            except ValueError as error:
                if row['is_current']:
                    rejected.append((row['batch_id'], row['raw_json'], str(error)))
                row['is_current'] = False
                row['valid_to'] = row['valid_to'] or stamp
        groups[row['natural_key']].append(row)
    upgraded = []
    for entries in groups.values():
        if len({entry['_original_key'] for entry in entries}) > 1:
            current = [entry for entry in entries if entry['is_current']]
            winner = current[-1] if current else None
            for version, entry in enumerate(entries, 1):
                entry['version'] = version
                if entry['is_current'] and entry is not winner:
                    entry['is_current'] = False
                    entry['valid_to'] = entry['valid_to'] or stamp
        upgraded.extend(tuple(entry[name] for name in columns) for entry in entries)
    with store._connect() as db:
        db.execute('BEGIN TRANSACTION')
        try:
            # A tabela temporária contém todas as versões, inclusive as que não
            # pertencem ao modelo MDX. A troca atômica evita conflitos da chave
            # composta enquanto preserva os originais e as datas do histórico.
            db.execute("CREATE TEMP TABLE neac_upgraded AS SELECT * FROM record_versions WHERE false")
            if upgraded:
                db.executemany('INSERT INTO neac_upgraded VALUES (' + ','.join('?' for _ in columns) + ')', upgraded)
            db.execute("DELETE FROM record_versions WHERE source='mvi_neac'")
            db.execute('INSERT INTO record_versions SELECT * FROM neac_upgraded')
            for old, new in rekeys.items():
                if old != new:
                    db.execute("UPDATE import_divergences SET natural_key=? WHERE source='mvi_neac' AND natural_key=?", [new, old])
            for batch, raw, reason in rejected:
                db.execute('INSERT INTO quarantine VALUES (?,0,?,?)',
                           [batch, 'Revisão NEAC/MDX: ' + reason, raw])
                db.execute("UPDATE import_batches SET quarantined=quarantined+1,status='completed_with_quarantine' WHERE id=?", [batch])
            db.execute("UPDATE source_types SET adapter_version=? WHERE code='mvi_neac'", [NEAC_ADAPTER_VERSION])
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK')
            raise
