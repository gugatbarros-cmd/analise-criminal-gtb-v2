"""Importação, validação, auditoria e restauração por fonte."""

import csv
import gzip
import hashlib
import json
import os
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from gtb.db.store_common import (
    MAX_UPLOAD_BYTES,
    source_adapter_version,
)
from gtb.indicators.rules import plain
from gtb.ingestion.adapters.mvi_fields import project_mvi_fields
from gtb.ingestion.adapters.normalize import SOURCES, Record, normalize, pick
from gtb.ingestion.adapters.tabular import read_rows
from gtb.sync.outbox import enqueue_import


class StoreImportMixin:
    def import_file(self, source: str, filename: str, content: bytes,
                    scope: str = "partial", *, require_accepted: bool = False) -> dict:
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        if scope not in {"partial", "complete"}:
            raise ValueError("Escopo deve ser partial ou complete")
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("Arquivo vazio ou acima de 64 MB")
        filename = Path(filename).name
        digest = hashlib.sha256(content).hexdigest()
        with self.lock:  # noqa: SIM117 - importação usa a conexão dentro do bloqueio
            with self._connect() as db:
                self._schema(db)
                previous = db.execute("""SELECT id, row_count, inserted, updated, unchanged,
                    quarantined, status FROM import_batches WHERE source = ? AND sha256 = ?
                    AND adapter_version = ? AND status IN ('completed', 'completed_with_quarantine')
                    ORDER BY imported_at DESC LIMIT 1""",
                    [source, digest, source_adapter_version(source)]).fetchone()
                if previous and (not require_accepted or sum(previous[2:5]) > 0):
                    differences = db.execute("SELECT count(*) FROM import_divergences WHERE batch_id = ?",
                                             [previous[0]]).fetchone()[0]
                    return dict(zip(("id", "row_count", "inserted", "updated", "unchanged",
                                     "quarantined", "status"), previous)) | {
                                         "repeated": True, "differences": differences}
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

        if require_accepted and not prepared:
            raise ValueError("Nenhum registro válido de " + source + " foi encontrado no XLS.")

        with self.lock:
            with self._connect() as db:
                self._schema(db)
                existing = db.execute("""SELECT id, row_count, inserted, updated, unchanged,
                    quarantined, status FROM import_batches WHERE source = ? AND sha256 = ?
                    AND adapter_version = ? AND status IN ('completed', 'completed_with_quarantine')
                    ORDER BY imported_at DESC LIMIT 1""", [source, digest, source_adapter_version(source)]).fetchone()
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
            suffix = Path(filename).suffix.lower()
            raw_path = raw_dir / f"{batch_id}{suffix}{'.gz' if suffix == '.xls' else ''}"
            raw_path.write_bytes(gzip.compress(content, mtime=0) if suffix == '.xls' else content)
            keys_path = raw_dir / f"stage-{batch_id}-keys.csv"
            changes_path = raw_dir / f"stage-{batch_id}-changes.csv"
            inserted = updated = unchanged = 0
            differences = 0
            try:
                with keys_path.open("w", encoding="utf-8", newline="") as output:
                    writer = csv.writer(output, delimiter=";")
                    writer.writerow(("natural_key",))
                    writer.writerows((record.natural_key,) for _, _, record, _ in prepared)
                with self._connect() as db:
                    db.execute("BEGIN TRANSACTION")
                    db.execute("""CREATE TEMP TABLE incoming_keys AS SELECT natural_key
                        FROM read_csv(?, header=true, delim=';',
                        columns={'natural_key':'VARCHAR'})""", [str(keys_path)])
                    matches = db.execute("""SELECT r.natural_key, r.version, r.row_hash,
                        r.raw_json FROM record_versions r JOIN incoming_keys i
                        ON r.natural_key = i.natural_key
                        WHERE r.source = ? AND r.is_current""", [source]).fetchall()
                    existing_rows = {natural_key: (version, row_hash, raw_json)
                                     for natural_key, version, row_hash, raw_json in matches}
                    pending_rows: list[tuple] = []
                    for _number, row, record, row_hash in prepared:
                        current = existing_rows.get(record.natural_key)
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
                            updated += 1
                        else:
                            inserted += 1
                        stored_row = project_mvi_fields(source, row) if source == 'mvi_cad' else row
                        pending_rows.append((record.natural_key, version, row_hash,
                                             json.dumps(stored_row, ensure_ascii=False, sort_keys=True),
                                             record.event_date, record.year, record.municipality,
                                             record.occurrence, record.victim, record.nature,
                                             record.category, record.eligible, record.reason,
                                             json.dumps(record.indicators, ensure_ascii=False)))
                    if pending_rows:
                        with changes_path.open("w", encoding="utf-8", newline="") as output:
                            writer = csv.writer(output, delimiter=";")
                            writer.writerow(("natural_key", "version", "row_hash", "raw_json",
                                             "event_date", "year", "municipality", "occurrence",
                                             "victim", "nature", "category", "eligible", "reason",
                                             "indicators_json"))
                            writer.writerows(pending_rows)
                        db.execute("""CREATE TEMP TABLE changed_rows AS SELECT *
                            FROM read_csv(?, header=true, delim=';', all_varchar=true)""",
                                   [str(changes_path)])
                        db.execute("""UPDATE record_versions SET is_current = false,
                            valid_to = ? WHERE source = ? AND is_current
                            AND natural_key IN (SELECT natural_key FROM changed_rows)""",
                                   [stamp, source])
                        db.execute("""INSERT INTO record_versions SELECT ?, natural_key,
                            CAST(version AS INTEGER), row_hash, ?, NULL::TIMESTAMP, true,
                            ?, raw_json, CAST(event_date AS DATE), CAST(year AS INTEGER),
                            municipality, COALESCE(occurrence, ''), COALESCE(victim, ''),
                            COALESCE(nature, ''), COALESCE(category, ''),
                            CAST(eligible AS BOOLEAN), COALESCE(reason, ''),
                            CAST(json_extract(indicators_json, '$') AS VARCHAR[])
                            FROM changed_rows""", [source, stamp, batch_id])
                    for number, row, reason in rejected:
                        stored_row = project_mvi_fields(source, row) if source == 'mvi_cad' else row
                        db.execute("INSERT INTO quarantine VALUES (?, ?, ?, ?)",
                                   [batch_id, number, reason, json.dumps(stored_row, ensure_ascii=False)])
                    if scope == "complete":
                        db.execute("""INSERT INTO import_divergences
                            SELECT ?, ?, r.natural_key,
                                'Ausente do arquivo completo; revisão necessária'
                            FROM record_versions r
                            WHERE r.source = ? AND r.is_current
                                AND NOT EXISTS (SELECT 1 FROM incoming_keys i
                                    WHERE i.natural_key = r.natural_key)""",
                                   [batch_id, source, source])
                        differences = db.execute("""SELECT count(*) FROM import_divergences
                            WHERE batch_id = ?""", [batch_id]).fetchone()[0]
                    status = "completed_with_quarantine" if rejected else "completed"
                    db.execute("""INSERT INTO import_batches VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                               [batch_id, source, filename, digest, stamp, scope, source_adapter_version(source),
                                len(rows),
                                inserted, updated, unchanged, len(rejected), status,
                                str(backup_path) if backup_path else None, str(raw_path)])
                    enqueue_import(db, batch_id=batch_id, source=source,
                                   row_count=len(rows), inserted=inserted, updated=updated,
                                   quarantined=len(rejected), differences=differences)
                    db.execute("COMMIT")
            except Exception:
                raw_path.unlink(missing_ok=True)
                raise
            finally:
                keys_path.unlink(missing_ok=True)
                changes_path.unlink(missing_ok=True)
            return {"id": batch_id, "row_count": len(rows), "inserted": inserted,
                    "updated": updated, "unchanged": unchanged, "quarantined": len(rejected),
                    "status": status, "repeated": False, "differences": differences}

    def validate_file(self, source: str, filename: str, content: bytes) -> dict:
        """Valida uma planilha sem persistir arquivo bruto, lote ou registros."""
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("Arquivo vazio ou acima de 64 MB")
        safe_filename = Path(filename).name
        rows = read_rows(safe_filename, content)
        if not rows:
            raise ValueError("Planilha sem registros")
        accepted = eligible = ineligible = 0
        reasons: dict[str, int] = {}
        seen: dict[str, str] = {}
        for row in rows:
            try:
                record = normalize(source, row)
                raw = json.dumps(row, ensure_ascii=False, sort_keys=True)
                row_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
                previous = seen.get(record.natural_key)
                if previous is not None:
                    if previous != row_hash:
                        reasons["Colisão de chave no arquivo"] = reasons.get(
                            "Colisão de chave no arquivo", 0) + 1
                    continue
                seen[record.natural_key] = row_hash
                accepted += 1
                if record.eligible:
                    eligible += 1
                else:
                    ineligible += 1
            except ValueError as error:
                reason = str(error)
                reasons[reason] = reasons.get(reason, 0) + 1
        quarantined = sum(reasons.values())
        return {
            "filename": safe_filename,
            "source": source,
            "sha256": hashlib.sha256(content).hexdigest(),
            "row_count": len(rows),
            "accepted": accepted,
            "eligible": eligible,
            "ineligible": ineligible,
            "quarantined": quarantined,
            "reasons": [{"reason": reason, "count": count}
                        for reason, count in sorted(reasons.items(), key=lambda item: (-item[1], item[0]))],
        }

    def batches(self, limit: int = 20, offset: int = 0) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT id, source, filename, imported_at, row_count, inserted,
                updated, unchanged, quarantined, status,
                (SELECT count(*) FROM import_divergences d WHERE d.batch_id = b.id) AS differences
                FROM import_batches b
                ORDER BY imported_at DESC, id DESC LIMIT ? OFFSET ?""",
                              [min(max(limit, 1), 100), max(offset, 0)]).fetchall()
        columns = ("id", "source", "filename", "imported_at", "row_count", "inserted",
                   "updated", "unchanged", "quarantined", "status", "differences")
        return [dict(zip(columns, row)) for row in rows]

    def batch_count(self) -> int:
        with self.lock, self._connect() as db:
            return db.execute("SELECT count(*) FROM import_batches").fetchone()[0]

    def restore_points_for_source(self, source: str) -> list[dict]:
        """Lista pontos locais recuperáveis de uma fonte, sem expor caminhos internos."""
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        with self.lock, self._connect() as db:
            batches = db.execute("""SELECT id, imported_at, filename, backup_path
                FROM import_batches WHERE source = ? AND backup_path IS NOT NULL""", [source]).fetchall()
            safety = db.execute("""SELECT id, created_at, label, backup_path
                FROM restore_points WHERE source = ?""", [source]).fetchall()
        backup_dir = (self.path.parent / "backups").resolve()
        result = []
        for kind, rows in (("batch", batches), ("safety", safety)):
            for point_id, created_at, label, path in rows:
                target = Path(path).resolve()
                if target.is_relative_to(backup_dir) and target.is_file():
                    result.append({"id": f"{kind}:{point_id}", "source": source,
                                   "created_at": created_at, "label": label,
                                   "kind": kind})
        return sorted(result, key=lambda point: (point["created_at"], point["id"]), reverse=True)

    def restore_source_point(self, source: str, point_id: str) -> dict:
        """Restaura só uma fonte e guarda a situação atual para desfazer a operação."""
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        kind, separator, identifier = point_id.partition(":")
        if not separator or kind not in {"batch", "safety"} or not identifier:
            raise ValueError("Ponto de recuperação inválido")
        with self.lock:
            with self._connect() as db:
                if kind == "batch":
                    row = db.execute("""SELECT backup_path, filename FROM import_batches
                        WHERE id = ? AND source = ?""", [identifier, source]).fetchone()
                else:
                    row = db.execute("""SELECT backup_path, label FROM restore_points
                        WHERE id = ? AND source = ?""", [identifier, source]).fetchone()
            if not row or not row[0]:
                raise ValueError("Ponto de recuperação não encontrado para este indicador")
            backup_dir = (self.path.parent / "backups").resolve()
            target = Path(row[0]).resolve()
            if not target.is_relative_to(backup_dir) or not target.is_file() or target.suffix != ".duckdb":
                raise ValueError("Cópia de segurança indisponível")
            safety_id = str(uuid.uuid4())
            safety_path = backup_dir / f"before-source-restore-{safety_id}.duckdb"
            shutil.copy2(self.path, safety_path)
            try:
                with self._connect() as db:
                    escaped_path = str(target).replace("'", "''")
                    db.execute(f"ATTACH '{escaped_path}' AS checkpoint (READ_ONLY)")
                    for table in ("record_versions", "import_batches", "quarantine", "import_divergences"):
                        current_columns = [row[1] for row in db.execute(f"PRAGMA table_info('{table}')").fetchall()]
                        saved_columns = [row[1] for row in db.execute(f"PRAGMA table_info('checkpoint.{table}')").fetchall()]
                        if current_columns != saved_columns:
                            raise ValueError("Cópia incompatível com a versão atual do banco")
                    restored_count = db.execute("""SELECT count(*) FROM checkpoint.record_versions
                        WHERE source = ? AND is_current""", [source]).fetchone()[0]
                    db.execute("BEGIN TRANSACTION")
                    try:
                        db.execute("""DELETE FROM quarantine WHERE batch_id IN
                            (SELECT id FROM import_batches WHERE source = ?)""", [source])
                        db.execute("DELETE FROM import_divergences WHERE source = ?", [source])
                        db.execute("DELETE FROM import_batches WHERE source = ?", [source])
                        db.execute("DELETE FROM record_versions WHERE source = ?", [source])
                        if source == 'mvi_cad':
                            db.execute('DELETE FROM mvi_cad_reviews')
                            db.execute('DELETE FROM mvi_cad_review_evidence')
                        db.execute('DELETE FROM map_location_overrides WHERE source = ?', [source])
                        db.execute("""INSERT INTO record_versions SELECT * FROM checkpoint.record_versions
                            WHERE source = ?""", [source])
                        has_locations = db.execute("""SELECT count(*) FROM information_schema.tables
                            WHERE table_catalog = 'checkpoint' AND table_name = 'map_location_overrides'""").fetchone()[0]
                        if has_locations:
                            db.execute('INSERT INTO map_location_overrides SELECT * FROM checkpoint.map_location_overrides WHERE source = ?', [source])
                        if source == 'mvi_cad':
                            has_reviews = db.execute("""SELECT count(*) FROM information_schema.tables
                                WHERE table_catalog = 'checkpoint' AND table_name = 'mvi_cad_reviews'""").fetchone()[0]
                            if has_reviews:
                                db.execute('INSERT INTO mvi_cad_reviews SELECT * FROM checkpoint.mvi_cad_reviews')
                            has_evidence = db.execute("""SELECT count(*) FROM information_schema.tables
                                WHERE table_catalog = 'checkpoint' AND table_name = 'mvi_cad_review_evidence'""").fetchone()[0]
                            if has_evidence:
                                db.execute('INSERT INTO mvi_cad_review_evidence '
                                           'SELECT * FROM checkpoint.mvi_cad_review_evidence')
                        db.execute("""INSERT INTO import_batches SELECT * FROM checkpoint.import_batches
                            WHERE source = ?""", [source])
                        db.execute("""INSERT INTO quarantine SELECT q.* FROM checkpoint.quarantine q
                            JOIN checkpoint.import_batches b ON b.id = q.batch_id WHERE b.source = ?""", [source])
                        db.execute("""INSERT INTO import_divergences SELECT * FROM checkpoint.import_divergences
                            WHERE source = ?""", [source])
                        db.execute("INSERT INTO restore_points VALUES (?, ?, ?, ?, ?)",
                                   [safety_id, source, datetime.now(UTC),
                                    f"Antes de restaurar {row[1]}", str(safety_path)])
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
            except duckdb.Error as error:
                safety_path.unlink(missing_ok=True)
                raise ValueError("Cópia de segurança inválida ou incompatível") from error
            except Exception:
                safety_path.unlink(missing_ok=True)
                raise
            return {"source": source, "restored_records": restored_count,
                    "safety_point": f"safety:{safety_id}"}

    def divergences(self, batch_id: str, limit: int = 1000,
                    offset: int = 0) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT source, natural_key, reason FROM import_divergences
                WHERE batch_id = ? ORDER BY natural_key LIMIT ? OFFSET ?""",
                              [batch_id, min(max(limit, 1), 1000), max(offset, 0)]).fetchall()
        return [dict(zip(("source", "natural_key", "reason"), row)) for row in rows]

    def quarantines(self, batch_id: str, limit: int = 1000,
                    offset: int = 0) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT row_number, reason, raw_json FROM quarantine
                WHERE batch_id = ? ORDER BY row_number LIMIT ? OFFSET ?""",
                              [batch_id, min(max(limit, 1), 1000), max(offset, 0)]).fetchall()
        return [{"row_number": number, "reason": reason, "fields": json.loads(raw_json)}
                for number, reason, raw_json in rows]

    def audit_counts(self, batch_id: str) -> dict[str, int]:
        with self.lock, self._connect() as db:
            row = db.execute("""SELECT
                (SELECT count(*) FROM import_divergences WHERE batch_id = ?),
                (SELECT count(*) FROM quarantine WHERE batch_id = ?)""",
                             [batch_id, batch_id]).fetchone()
        return {"divergences": row[0], "quarantine": row[1]}

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
