"""Criação do esquema e atualizações automáticas do banco local."""

import csv
import gzip
import hashlib
import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile

import duckdb

from gtb.db.store_common import (
    ADAPTER_VERSION,
    CAD_ADAPTER_VERSION,
    source_adapter_version,
)
from gtb.indicators.mvi_time import mvi_hour
from gtb.ingestion.adapters.mvi_fields import project_mvi_fields
from gtb.ingestion.adapters.normalize import SOURCES, normalize, pick
from gtb.ingestion.adapters.tabular import read_rows


class StoreSchemaMixin:
    def _reduce_existing_mvi_cad(self) -> None:
        """Enxuga fichas antigas uma vez, depois de verificar todos os originais."""
        with self.lock:
            with self._connect() as db:
                if db.execute("SELECT 1 FROM storage_migrations WHERE name = 'mvi-cad-19-fields'").fetchone():
                    return
                batches = db.execute("SELECT id, filename, raw_path, sha256 FROM import_batches WHERE source = 'mvi_cad'").fetchall()
                rows = db.execute("SELECT natural_key, version, batch_id, raw_json FROM record_versions WHERE source = 'mvi_cad'").fetchall()
            recovered_hours: dict[tuple[str, str], str] = {}
            for batch_id, filename, recorded, digest in batches:
                if not recorded:
                    return
                archive = self.path.parent / "raw" / Path(recorded).name
                if not archive.is_file() or archive.is_symlink():
                    return
                checksum = hashlib.sha256()
                opener = gzip.open if archive.suffix.lower() == '.gz' else open
                try:
                    with opener(archive, 'rb') as original:
                        for chunk in iter(lambda: original.read(1024 * 1024), b''):
                            checksum.update(chunk)
                except (OSError, EOFError):
                    return
                if checksum.hexdigest() != digest:
                    return
                if Path(filename).suffix.lower() == '.xls':
                    try:
                        with opener(archive, 'rb') as original:
                            for source_row in read_rows(filename, original.read()):
                                hour = mvi_hour(source_row)
                                if hour in {None, 0}:
                                    continue
                                try:
                                    natural_key = normalize('mvi_cad', source_row).natural_key
                                except ValueError:
                                    continue
                                recovered_hours[(batch_id, natural_key)] = pick(source_row, 'date')
                    except (OSError, EOFError, ValueError):
                        pass
            changes = []
            for natural_key, version, batch_id, raw in rows:
                original_row = json.loads(raw)
                recovered = recovered_hours.get((batch_id, natural_key))
                if recovered and mvi_hour(original_row) in {None, 0}:
                    original_row['Data da ocorrência'] = recovered
                reduced = json.dumps(project_mvi_fields('mvi_cad', original_row),
                                     ensure_ascii=False, sort_keys=True)
                if reduced != raw:
                    changes.append((natural_key, version, reduced))
            if changes:
                backup_dir = self.path.parent / 'backups'
                backup_dir.mkdir(exist_ok=True)
                with self._connect() as checkpoint:
                    checkpoint.execute('CHECKPOINT')
                shutil.copy2(self.path, backup_dir / f'before-mvi-fields-{uuid.uuid4()}.duckdb')
            stage: Path | None = None
            try:
                if changes:
                    with NamedTemporaryFile(mode='w', encoding='utf-8', newline='',
                                            suffix='.csv', prefix='mvi-fields-',
                                            dir=self.path.parent, delete=False) as output:
                        stage = Path(output.name)
                        writer = csv.writer(output, delimiter=';')
                        writer.writerow(('natural_key', 'version', 'raw_json'))
                        writer.writerows(changes)
                with self._connect() as db:
                    db.execute('BEGIN TRANSACTION')
                    try:
                        if stage:
                            db.execute("CREATE TEMP TABLE reduced_mvi AS SELECT * FROM read_csv(?, header=true, delim=';', all_varchar=true)",
                                       [str(stage)])
                            db.execute("""UPDATE record_versions AS target SET raw_json = reduced_mvi.raw_json
                                FROM reduced_mvi WHERE target.source = 'mvi_cad'
                                AND target.natural_key = reduced_mvi.natural_key
                                AND target.version = CAST(reduced_mvi.version AS INTEGER)""")
                        db.execute("INSERT INTO storage_migrations VALUES ('mvi-cad-19-fields', ?)",
                                   [datetime.now(UTC)])
                        db.execute('COMMIT')
                    except Exception:
                        db.execute('ROLLBACK')
                        raise
            finally:
                if stage:
                    stage.unlink(missing_ok=True)

    def _compress_legacy_xls(self) -> None:
        """Converte originais XLS locais sem perder bytes ou mudar o hash do lote."""
        raw_dir = self.path.parent / "raw"
        if not raw_dir.is_dir() or raw_dir.is_symlink():
            return
        with self.lock, self._connect() as db:
            batches = db.execute("SELECT id, raw_path, sha256 FROM import_batches WHERE lower(raw_path) LIKE '%.xls'").fetchall()
            for batch_id, recorded, digest in batches:
                original = raw_dir / Path(recorded).name
                if not original.is_file() or original.is_symlink():
                    continue
                compressed = original.with_name(original.name + ".gz")
                temporary = compressed.with_name(compressed.name + ".tmp")
                try:
                    with (original.open("rb") as source, temporary.open("wb") as target,
                          gzip.GzipFile(fileobj=target, mode="wb", filename="", mtime=0) as archive):
                        shutil.copyfileobj(source, archive, 1024 * 1024)
                    checksum = hashlib.sha256()
                    with gzip.open(temporary, "rb") as archive:
                        for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                            checksum.update(chunk)
                    if checksum.hexdigest() != digest:
                        continue
                    temporary.replace(compressed)
                    db.execute("UPDATE import_batches SET raw_path = ? WHERE id = ?",
                               [str(compressed), batch_id])
                    original.unlink()
                except OSError:
                    continue
                finally:
                    temporary.unlink(missing_ok=True)

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.path))

    @staticmethod
    def _schema(db: duckdb.DuckDBPyConnection) -> None:
        db.execute("""CREATE TABLE IF NOT EXISTS source_types (
            code VARCHAR PRIMARY KEY, label VARCHAR NOT NULL, adapter_version VARCHAR NOT NULL)""")
        db.executemany("INSERT OR IGNORE INTO source_types VALUES (?, ?, ?)",
                       [(source, source.replace("_", " ").upper(), source_adapter_version(source))
                        for source in SOURCES])
        db.execute("""CREATE TABLE IF NOT EXISTS import_batches (
            id VARCHAR PRIMARY KEY, source VARCHAR NOT NULL, filename VARCHAR NOT NULL,
            sha256 VARCHAR NOT NULL, imported_at TIMESTAMP NOT NULL, scope VARCHAR NOT NULL,
            adapter_version VARCHAR NOT NULL, row_count INTEGER NOT NULL,
            inserted INTEGER NOT NULL, updated INTEGER NOT NULL, unchanged INTEGER NOT NULL,
            quarantined INTEGER NOT NULL, status VARCHAR NOT NULL, backup_path VARCHAR,
            raw_path VARCHAR)""")
        db.execute("""CREATE TABLE IF NOT EXISTS record_versions (
            source VARCHAR NOT NULL, natural_key VARCHAR NOT NULL, version INTEGER NOT NULL,
            row_hash VARCHAR NOT NULL, valid_from TIMESTAMP NOT NULL, valid_to TIMESTAMP,
            is_current BOOLEAN NOT NULL, batch_id VARCHAR NOT NULL, raw_json VARCHAR NOT NULL,
            event_date DATE NOT NULL, year INTEGER NOT NULL, municipality VARCHAR NOT NULL,
            occurrence VARCHAR NOT NULL, victim VARCHAR, nature VARCHAR, category VARCHAR,
            eligible BOOLEAN NOT NULL, reason VARCHAR, indicators VARCHAR[] NOT NULL DEFAULT [],
            PRIMARY KEY (source, natural_key, version))""")
        db.execute("""CREATE TABLE IF NOT EXISTS quarantine (
            batch_id VARCHAR NOT NULL, row_number INTEGER NOT NULL, reason VARCHAR NOT NULL,
            raw_json VARCHAR NOT NULL)""")
        db.execute("""CREATE TABLE IF NOT EXISTS import_divergences (
            batch_id VARCHAR NOT NULL, source VARCHAR NOT NULL, natural_key VARCHAR NOT NULL,
            reason VARCHAR NOT NULL)""")
        db.execute("""CREATE TABLE IF NOT EXISTS restore_points (
            id VARCHAR PRIMARY KEY, source VARCHAR NOT NULL, created_at TIMESTAMP NOT NULL,
            label VARCHAR NOT NULL, backup_path VARCHAR NOT NULL)""")
        db.execute("""CREATE TABLE IF NOT EXISTS mvi_cad_reviews (
            natural_key VARCHAR NOT NULL, row_hash VARCHAR NOT NULL,
            decision VARCHAR NOT NULL, category VARCHAR, reviewer VARCHAR NOT NULL,
            reviewed_at TIMESTAMP NOT NULL, PRIMARY KEY (natural_key, row_hash))""")
        db.execute("""CREATE TABLE IF NOT EXISTS mvi_cad_review_evidence (
            natural_key VARCHAR NOT NULL, row_hash VARCHAR NOT NULL,
            note VARCHAR NOT NULL, death_date DATE,
            PRIMARY KEY (natural_key, row_hash))""")
        db.execute("""CREATE TABLE IF NOT EXISTS map_location_overrides (
            source VARCHAR NOT NULL, natural_key VARCHAR NOT NULL, row_hash VARCHAR NOT NULL,
            latitude DOUBLE NOT NULL, longitude DOUBLE NOT NULL,
            reviewer VARCHAR NOT NULL, reviewed_at TIMESTAMP NOT NULL,
            PRIMARY KEY (source, natural_key, row_hash))""")
        db.execute("""CREATE TABLE IF NOT EXISTS sync_outbox (
            id VARCHAR PRIMARY KEY, event_type VARCHAR NOT NULL,
            schema_version INTEGER NOT NULL, payload_json VARCHAR NOT NULL,
            status VARCHAR NOT NULL, created_at TIMESTAMP NOT NULL,
            attempts INTEGER NOT NULL, next_attempt_at TIMESTAMP, last_error VARCHAR)""")
        db.execute("""CREATE TABLE IF NOT EXISTS storage_migrations (
            name VARCHAR PRIMARY KEY, applied_at TIMESTAMP NOT NULL)""")

    def _upgrade_occurrences(self) -> None:
        """Reclassifica dados derivados antigos, mantendo originais e um backup anterior."""
        with self._connect() as db:
            previous = db.execute("SELECT adapter_version FROM source_types WHERE code = 'ocorrencias'").fetchone()
        if not previous or previous[0] == ADAPTER_VERSION:
            return
        backup_dir = self.path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        shutil.copy2(self.path, backup_dir / f"before-adapter-{uuid.uuid4()}.duckdb")
        with self._connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                has_indicators = db.execute("""SELECT count(*) FROM information_schema.columns
                    WHERE table_name = 'record_versions' AND column_name = 'indicators'""").fetchone()[0]
                if not has_indicators:
                    db.execute("""ALTER TABLE record_versions ADD COLUMN indicators
                        VARCHAR[] DEFAULT []""")
                rows = db.execute("""SELECT natural_key, version, raw_json FROM record_versions
                    WHERE source = 'ocorrencias'""").fetchall()
                changes = []
                for natural_key, version, raw_json in rows:
                    record = normalize("ocorrencias", json.loads(raw_json))
                    changes.append({"natural_key": natural_key, "version": version,
                                    "nature": record.nature, "category": record.category,
                                    "indicators": list(record.indicators)})
                if changes:
                    db.execute("""UPDATE record_versions AS target
                        SET nature = changes.nature, category = changes.category,
                            indicators = changes.indicators
                        FROM (SELECT value->>'natural_key' AS natural_key,
                            CAST(value->>'version' AS INTEGER) AS version,
                            value->>'nature' AS nature, value->>'category' AS category,
                            from_json(value->'indicators', '["VARCHAR"]') AS indicators
                            FROM json_each(?)) AS changes
                        WHERE target.source = 'ocorrencias'
                          AND target.natural_key = changes.natural_key
                          AND target.version = changes.version""", [json.dumps(changes)])
                db.execute("UPDATE source_types SET adapter_version = ?", [ADAPTER_VERSION])
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise

    def _upgrade_cad(self) -> None:
        """Reavalia apenas os campos derivados do CAD; mantém originais e versões."""
        with self._connect() as db:
            previous = db.execute("SELECT adapter_version FROM source_types WHERE code = 'mvi_cad'").fetchone()
            if not previous or previous[0] == CAD_ADAPTER_VERSION:
                return
            rows = db.execute("""SELECT natural_key, version, raw_json, nature, category, eligible, reason, row_hash
                FROM record_versions WHERE source = 'mvi_cad'""").fetchall()
            changes = []
            for natural_key, version, raw, nature, category, eligible, reason, row_hash in rows:
                if db.execute("SELECT 1 FROM mvi_cad_reviews WHERE natural_key = ? AND row_hash = ?",
                              [natural_key, row_hash]).fetchone():
                    continue
                record = normalize('mvi_cad', json.loads(raw))
                if (nature, category, eligible, reason) != (record.nature, record.category, record.eligible, record.reason):
                    changes.append((record.nature, record.category, record.eligible, record.reason,
                                    natural_key, version))
        if changes:
            backup_dir = self.path.parent / 'backups'
            backup_dir.mkdir(exist_ok=True)
            shutil.copy2(self.path, backup_dir / f'before-cad-adapter-{uuid.uuid4()}.duckdb')
        with self._connect() as db:
            db.execute('BEGIN TRANSACTION')
            try:
                if changes:
                    db.executemany("""UPDATE record_versions SET nature = ?, category = ?, eligible = ?, reason = ?
                        WHERE source = 'mvi_cad' AND natural_key = ? AND version = ?""", changes)
                db.execute("UPDATE source_types SET adapter_version = ? WHERE code = 'mvi_cad'",
                           [CAD_ADAPTER_VERSION])
                db.execute('COMMIT')
            except Exception:
                db.execute('ROLLBACK')
                raise
