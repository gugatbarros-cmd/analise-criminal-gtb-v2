"""Importação transacional e consultas por fonte em um DuckDB local."""

import hashlib
import json
import os
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from gtb.indicators.rules import key, plain
from gtb.ingestion.adapters.normalize import SOURCES, Record, declared_instrument, normalize, pick
from gtb.ingestion.adapters.tabular import read_rows

MAX_UPLOAD_BYTES = 30 * 1024 * 1024
ADAPTER_VERSION = "0.1.6"


class Store:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            self._schema(db)
        self._upgrade_occurrences()

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.path))

    @staticmethod
    def _schema(db: duckdb.DuckDBPyConnection) -> None:
        db.execute("""CREATE TABLE IF NOT EXISTS source_types (
            code VARCHAR PRIMARY KEY, label VARCHAR NOT NULL, adapter_version VARCHAR NOT NULL)""")
        db.executemany("INSERT OR IGNORE INTO source_types VALUES (?, ?, ?)",
                       [(source, source.replace("_", " ").upper(), ADAPTER_VERSION)
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
                for natural_key, version, raw_json in rows:
                    record = normalize("ocorrencias", json.loads(raw_json))
                    db.execute("""UPDATE record_versions SET nature = ?, category = ?, indicators = ?
                        WHERE source = 'ocorrencias' AND natural_key = ? AND version = ?""",
                               [record.nature, record.category, list(record.indicators),
                                natural_key, version])
                db.execute("UPDATE source_types SET adapter_version = ?", [ADAPTER_VERSION])
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise

    def import_file(self, source: str, filename: str, content: bytes,
                    scope: str = "partial") -> dict:
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        if scope not in {"partial", "complete"}:
            raise ValueError("Escopo deve ser partial ou complete")
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("Arquivo vazio ou acima de 30 MB")
        filename = Path(filename).name
        digest = hashlib.sha256(content).hexdigest()
        rows = read_rows(filename, content)
        if not rows:
            raise ValueError("Planilha sem registros")
        prepared: list[tuple[int, dict[str, str], Record, str]] = []
        rejected: list[tuple[int, dict[str, str], str]] = []
        seen: dict[str, str] = {}
        for number, row in enumerate(rows, start=2):
            try:
                record = normalize(source, row)
                raw = json.dumps(row, ensure_ascii=False, sort_keys=True)
                row_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
                previous = seen.get(record.natural_key)
                if previous is not None:
                    if previous != row_hash:
                        rejected.append((number, row, "Colisão de chave no arquivo"))
                    continue
                seen[record.natural_key] = row_hash
                prepared.append((number, row, record, row_hash))
            except ValueError as error:
                rejected.append((number, row, str(error)))

        with self.lock:
            with self._connect() as db:
                self._schema(db)
                existing = db.execute("""SELECT id, row_count, inserted, updated, unchanged,
                    quarantined, status FROM import_batches WHERE source = ? AND sha256 = ?
                    AND status IN ('completed', 'completed_with_quarantine')
                    ORDER BY imported_at DESC LIMIT 1""", [source, digest]).fetchone()
                if existing:
                    differences = db.execute("SELECT count(*) FROM import_divergences WHERE batch_id = ?",
                                             [existing[0]]).fetchone()[0]
                    return dict(zip(("id", "row_count", "inserted", "updated", "unchanged",
                                     "quarantined", "status"), existing)) | {
                                         "repeated": True, "differences": differences}

            batch_id = str(uuid.uuid4())
            stamp = datetime.now(UTC)
            backup_path = None
            if self.path.exists() and self.path.stat().st_size:
                backup_dir = self.path.parent / "backups"
                backup_dir.mkdir(exist_ok=True)
                backup_path = backup_dir / f"before-{batch_id}.duckdb"
                shutil.copy2(self.path, backup_path)
            raw_dir = self.path.parent / "raw"
            raw_dir.mkdir(exist_ok=True)
            raw_path = raw_dir / f"{batch_id}{Path(filename).suffix.lower()}"
            raw_path.write_bytes(content)
            inserted = updated = unchanged = 0
            differences = 0
            try:
                with self._connect() as db:
                    db.execute("BEGIN TRANSACTION")
                    for _number, row, record, row_hash in prepared:
                        current = db.execute("""SELECT version, row_hash, raw_json FROM record_versions
                            WHERE source = ? AND natural_key = ? AND is_current""",
                                             [source, record.natural_key]).fetchone()
                        if current and current[1] == row_hash:
                            unchanged += 1
                            continue
                        if current and source.startswith("mvi_") and not pick(row, "nic"):
                            old = json.loads(current[2])
                            conflict = any(
                                pick(old, field) and pick(row, field)
                                and plain(pick(old, field)) != plain(pick(row, field))
                                for field in ("age", "sex", "address", "neighborhood")
                            )
                            if conflict:
                                rejected.append((_number, row, "Homônimo com contexto conflitante"))
                                continue
                        version = (current[0] + 1) if current else 1
                        if current:
                            db.execute("""UPDATE record_versions SET is_current = false,
                                valid_to = ? WHERE source = ? AND natural_key = ? AND is_current""",
                                       [stamp, source, record.natural_key])
                            updated += 1
                        else:
                            inserted += 1
                        db.execute("""INSERT INTO record_versions VALUES
                            (?, ?, ?, ?, ?, NULL, true, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                                   [source, record.natural_key, version, row_hash, stamp, batch_id,
                                    json.dumps(row, ensure_ascii=False, sort_keys=True),
                                    record.event_date, record.year, record.municipality,
                                    record.occurrence, record.victim, record.nature,
                                    record.category, record.eligible, record.reason,
                                    list(record.indicators)])
                    for number, row, reason in rejected:
                        db.execute("INSERT INTO quarantine VALUES (?, ?, ?, ?)",
                                   [batch_id, number, reason, json.dumps(row, ensure_ascii=False)])
                    if scope == "complete":
                        current_keys = db.execute("""SELECT natural_key FROM record_versions
                            WHERE source = ? AND is_current""", [source]).fetchall()
                        for (natural_key,) in current_keys:
                            if natural_key not in seen:
                                db.execute("INSERT INTO import_divergences VALUES (?, ?, ?, ?)",
                                           [batch_id, source, natural_key,
                                            "Ausente do arquivo completo; revisão necessária"])
                                differences += 1
                    status = "completed_with_quarantine" if rejected else "completed"
                    db.execute("""INSERT INTO import_batches VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                               [batch_id, source, filename, digest, stamp, scope, ADAPTER_VERSION,
                                len(rows),
                                inserted, updated, unchanged, len(rejected), status,
                                str(backup_path) if backup_path else None, str(raw_path)])
                    db.execute("COMMIT")
            except Exception:
                raw_path.unlink(missing_ok=True)
                raise
            return {"id": batch_id, "row_count": len(rows), "inserted": inserted,
                    "updated": updated, "unchanged": unchanged, "quarantined": len(rejected),
                    "status": status, "repeated": False, "differences": differences}

    def batches(self, limit: int = 20) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT id, source, filename, imported_at, row_count, inserted,
                updated, unchanged, quarantined, status,
                (SELECT count(*) FROM import_divergences d WHERE d.batch_id = b.id) AS differences
                FROM import_batches b
                ORDER BY imported_at DESC LIMIT ?""", [min(max(limit, 1), 100)]).fetchall()
        columns = ("id", "source", "filename", "imported_at", "row_count", "inserted",
                   "updated", "unchanged", "quarantined", "status", "differences")
        return [dict(zip(columns, row)) for row in rows]

    def divergences(self, batch_id: str) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT source, natural_key, reason FROM import_divergences
                WHERE batch_id = ? ORDER BY natural_key LIMIT 1000""", [batch_id]).fetchall()
        return [dict(zip(("source", "natural_key", "reason"), row)) for row in rows]

    def restore_backup(self, backup: Path) -> Path:
        """Restaura cópia local explícita, guardando antes o estado atual."""
        backup_dir = (self.path.parent / "backups").resolve()
        target = backup.resolve()
        if not target.is_relative_to(backup_dir) or target.suffix != ".duckdb":
            raise ValueError("Backup deve estar em data/backups e ter extensão .duckdb")
        if not target.is_file():
            raise ValueError("Backup não encontrado")
        with self.lock:
            with duckdb.connect(str(target), read_only=True) as check:
                check.execute("SELECT count(*) FROM import_batches").fetchone()
                check.execute("SELECT count(*) FROM record_versions").fetchone()
            saved = backup_dir / f"before-restore-{uuid.uuid4()}.duckdb"
            shutil.copy2(self.path, saved)
            staging = self.path.parent / f"restore-{uuid.uuid4()}.duckdb"
            try:
                shutil.copy2(target, staging)
                os.replace(staging, self.path)
            finally:
                staging.unlink(missing_ok=True)
        return saved

    def summary(self, year: int | None = None, municipality: str | None = None) -> dict:
        clauses = ["is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        where = " AND ".join(clauses)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT source, category, indicators, year,
                month(event_date) AS month,
                count(*) AS total FROM record_versions WHERE {where}
                GROUP BY source, category, indicators, year, month
                ORDER BY year, month, source, category""",
                              params).fetchall()
            quarantine_count = db.execute("SELECT count(*) FROM quarantine").fetchone()[0]
        by_source = {source: 0 for source in SOURCES}
        monthly: dict[str, dict[str, int]] = {}
        categories: dict[str, dict[str, int]] = {}
        for source, category, _indicators, row_year, month, total in rows:
            by_source[source] += total
            period = f"{row_year:04d}-{month:02d}"
            monthly.setdefault(period, {})[source] = monthly.setdefault(period, {}).get(source, 0) + total
            if category:
                categories.setdefault(source, {})[category] = categories.setdefault(source, {}).get(category, 0) + total
        return {"by_source": by_source, "monthly": monthly, "categories": categories,
                "quarantined_rows": quarantine_count,
                "mvi_cad": by_source["mvi_cad"], "mvi_neac": by_source["mvi_neac"],
                "cvp": sum(total for source, _category, indicators, *_rest, total in rows
                           if source == "ocorrencias" and "CVP" in indicators),
                "tentativas": sum(total for source, _category, indicators, *_rest, total in rows
                                  if source == "ocorrencias" and
                                  "Tentativa de homicídio" in indicators),
                "tco": sum(total for source, _category, indicators, *_rest, total in rows
                           if source == "ocorrencias" and "TCO" in indicators)}

    def tco_analysis(self, year: int | None = None,
                     municipality: str | None = None) -> dict:
        clauses = ["source = 'ocorrencias'", "is_current", "eligible",
                   "list_contains(indicators, 'TCO')"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        where = " AND ".join(clauses)
        with self.lock, self._connect() as db:
            months = db.execute(f"""SELECT year, month(event_date), count(*)
                FROM record_versions WHERE {where}
                GROUP BY year, month(event_date) ORDER BY year, month(event_date)""",
                                params).fetchall()
            cities = db.execute(f"""SELECT municipality, count(*) AS total
                FROM record_versions WHERE {where}
                GROUP BY municipality ORDER BY total DESC, municipality LIMIT 10""",
                                params).fetchall()
            natures = db.execute(f"""SELECT coalesce(nullif(trim(nature), ''), 'Não informada'),
                count(*) AS total FROM record_versions WHERE {where}
                GROUP BY 1 ORDER BY total DESC, 1 LIMIT 10""", params).fetchall()
        return {"total": sum(total for _year, _month, total in months),
                "monthly": [{"period": f"{row_year:04d}-{month:02d}", "total": total}
                            for row_year, month, total in months],
                "municipalities": [{"name": name, "total": total} for name, total in cities],
                "natures": [{"name": name, "total": total} for name, total in natures]}

    def mvi_analysis(self, source: str, year: int | None = None,
                     municipality: str | None = None) -> dict:
        if source not in {"mvi_cad", "mvi_neac"}:
            raise ValueError("Fonte MVI desconhecida")
        clauses = ["source = ?", "is_current", "eligible"]
        params: list[object] = [source]
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        where = " AND ".join(clauses)
        with self.lock, self._connect() as db:
            years = db.execute(f"""SELECT year, count(*) FROM record_versions
                WHERE {where} GROUP BY year ORDER BY year""", params).fetchall()
            cities = db.execute(f"""SELECT municipality, count(*) AS total
                FROM record_versions WHERE {where}
                GROUP BY municipality ORDER BY total DESC, municipality LIMIT 10""",
                                params).fetchall()
            classifications = db.execute(f"""SELECT category, count(*) AS total
                FROM record_versions WHERE {where}
                GROUP BY category ORDER BY total DESC, category""", params).fetchall()
            instrument_rows = db.execute(f"""SELECT raw_json FROM record_versions
                WHERE {where}""", params).fetchall()
        instruments: dict[str, int] = {}
        for (raw_json,) in instrument_rows:
            group = declared_instrument(json.loads(raw_json))
            instruments[group] = instruments.get(group, 0) + 1
        return {"source": source, "total": sum(total for _year, total in years),
                "yearly": [{"year": row_year, "total": total} for row_year, total in years],
                "municipalities": [{"name": name, "total": total} for name, total in cities],
                "classifications": [{"name": name, "total": total}
                                    for name, total in classifications],
                "instruments": [{"name": name, "total": total} for name, total in
                                sorted(instruments.items(), key=lambda item: (-item[1], item[0]))]}

    def records(self, source: str, page: int = 1, size: int = 20,
                year: int | None = None, municipality: str | None = None,
                victim: str | None = None, eligible_only: bool = False,
                category_prefix: str | None = None, indicator: str | None = None) -> dict:
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        page, size = max(page, 1), min(max(size, 1), 100)
        clauses = ["source = ?", "is_current"]
        params: list[object] = [source]
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if victim:
            clauses.append("position(lower(?) in lower(victim)) > 0")
            params.append(victim)
        if eligible_only:
            clauses.append("eligible")
        if category_prefix:
            clauses.append("starts_with(category, ?)")
            params.append(category_prefix)
        if indicator:
            clauses.append("list_contains(indicators, ?)")
            params.append(indicator)
        where = " AND ".join(clauses)
        with self.lock, self._connect() as db:
            total = db.execute(f"SELECT count(*) FROM record_versions WHERE {where}", params).fetchone()[0]
            rows = db.execute(f"""SELECT natural_key, event_date, municipality, occurrence, victim, nature,
                category, eligible, reason, version, indicators, raw_json FROM record_versions
                WHERE {where} ORDER BY event_date DESC, occurrence, victim
                LIMIT ? OFFSET ?""", [*params, size, (page - 1) * size]).fetchall()
        columns = ("natural_key", "event_date", "municipality", "occurrence", "victim", "nature", "category",
                   "eligible", "reason", "version", "indicators")
        return {"total": total, "page": page, "size": size,
                "items": [dict(zip(columns, row[:-1])) | {
                    "solution": pick(json.loads(row[-1]), "solution") if source == "ocorrencias" else "",
                    "instrument": declared_instrument(json.loads(row[-1]))
                    if source.startswith("mvi_") else "",
                } for row in rows]}

    def mvi_record_detail(self, source: str, natural_key: str) -> dict | None:
        if source not in {"mvi_cad", "mvi_neac"}:
            raise ValueError("Fonte MVI desconhecida")
        with self.lock, self._connect() as db:
            row = db.execute("""SELECT occurrence, victim, event_date, municipality,
                category, eligible, reason, version, batch_id, raw_json
                FROM record_versions WHERE source = ? AND natural_key = ? AND is_current""",
                             [source, natural_key]).fetchone()
        if row is None:
            return None
        columns = ("occurrence", "victim", "event_date", "municipality", "category",
                   "eligible", "reason", "version", "batch_id")
        return dict(zip(columns, row[:-1])) | {
            "source": source, "natural_key": natural_key, "fields": json.loads(row[-1]),
        }
