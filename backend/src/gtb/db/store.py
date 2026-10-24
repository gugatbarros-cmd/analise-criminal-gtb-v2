"""Importação transacional e consultas por fonte em um DuckDB local."""

import csv
import hashlib
import json
import os
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from gtb.indicators.arms import arm_field, arm_quantity, arm_restricted, arm_seized
from gtb.indicators.drugs import drug_field, drug_quantity, drug_weight_grams
from gtb.indicators.mvi_time import mvi_hour, time_band
from gtb.indicators.rules import domestic_triage, key, operational_action, plain
from gtb.indicators.teams import team_complexity, team_field, team_group, team_officers
from gtb.ingestion.adapters.normalize import SOURCES, Record, declared_instrument, normalize, pick
from gtb.ingestion.adapters.tabular import read_rows

MAX_UPLOAD_BYTES = 30 * 1024 * 1024
ADAPTER_VERSION = "0.1.17"


def indicator_evidence(raw_json: str, source: str, indicator: str | None) -> str:
    if source != "ocorrencias" or not indicator:
        return ""
    row = json.loads(raw_json)
    if indicator in {"Mandados", "Visitas", "Sossego"}:
        return operational_action(row, indicator)[1]
    if indicator.startswith("Doméstica"):
        decision = domestic_triage(row)
        return decision["reason"] + (" · " + decision["evidence"]
                                     if decision["evidence"] else "")
    return ""


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
                        pending_rows.append((record.natural_key, version, row_hash,
                                             json.dumps(row, ensure_ascii=False, sort_keys=True),
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
                        db.execute("INSERT INTO quarantine VALUES (?, ?, ?, ?)",
                                   [batch_id, number, reason, json.dumps(row, ensure_ascii=False)])
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
                               [batch_id, source, filename, digest, stamp, scope, ADAPTER_VERSION,
                                len(rows),
                                inserted, updated, unchanged, len(rejected), status,
                                str(backup_path) if backup_path else None, str(raw_path)])
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

    def quarantines(self, batch_id: str) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT row_number, reason, raw_json FROM quarantine
                WHERE batch_id = ? ORDER BY row_number LIMIT 1000""", [batch_id]).fetchall()
        return [{"row_number": number, "reason": reason, "fields": json.loads(raw_json)}
                for number, reason, raw_json in rows]

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
                           if source == "ocorrencias" and "TCO" in indicators),
                "mandados": sum(total for source, _category, indicators, *_rest, total in rows
                                if source == "ocorrencias" and "Mandados" in indicators),
                "visitas": sum(total for source, _category, indicators, *_rest, total in rows
                              if source == "ocorrencias" and "Visitas" in indicators),
                "sossego": sum(total for source, _category, indicators, *_rest, total in rows
                                if source == "ocorrencias" and "Sossego" in indicators),
                "domestica": sum(total for source, _category, indicators, *_rest, total in rows
                                 if source == "ocorrencias" and "Doméstica" in indicators)}

    def tco_analysis(self, year: int | None = None,
                     municipality: str | None = None) -> dict:
        return self._occurrence_analysis("TCO", year, municipality)

    def operational_analysis(self, kind: str, year: int | None = None,
                             municipality: str | None = None) -> dict:
        if kind not in {"Mandados", "Visitas", "Sossego"}:
            raise ValueError("Ação operacional desconhecida")
        return self._occurrence_analysis(kind, year, municipality)

    def domestic_analysis(self, year: int | None = None,
                          municipality: str | None = None) -> dict:
        result = self._occurrence_analysis("Doméstica", year, municipality)
        result["reviews"] = {status: self._occurrence_analysis(
            f"Doméstica:{status}", year, municipality)["total"]
            for status in ("pending", "excluded", "outside")}
        return result

    def _occurrence_analysis(self, indicator: str, year: int | None,
                             municipality: str | None) -> dict:
        clauses = ["source = 'ocorrencias'", "is_current", "eligible",
                   "list_contains(indicators, ?)"]
        params: list[object] = [indicator]
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
            months = db.execute(f"""SELECT year, month(event_date), count(*)
                FROM record_versions WHERE {where}
                GROUP BY year, month(event_date) ORDER BY year, month(event_date)""",
                                params).fetchall()
            weekday_rows = db.execute(f"""SELECT dayofweek(event_date), count(*)
                FROM record_versions WHERE {where}
                GROUP BY dayofweek(event_date)""", params).fetchall()
            cities = db.execute(f"""SELECT municipality, count(*) AS total
                FROM record_versions WHERE {where}
                GROUP BY municipality ORDER BY total DESC, municipality LIMIT 10""",
                                params).fetchall()
            classifications = db.execute(f"""SELECT category, count(*) AS total
                FROM record_versions WHERE {where}
                GROUP BY category ORDER BY total DESC, category""", params).fetchall()
            instrument_rows = db.execute(f"""SELECT raw_json, municipality, category FROM record_versions
                WHERE {where}""", params).fetchall()
        instruments: dict[str, int] = {}
        bands: dict[str, int] = {}
        city_bands: dict[str, dict[str, object]] = {}
        valid_hours = 0
        for raw_json, city, category in instrument_rows:
            raw = json.loads(raw_json)
            group = declared_instrument(raw)
            instruments[group] = instruments.get(group, 0) + 1
            city_profile = city_bands.setdefault(city, {"total": 0, "valid": 0, "bands": {}})
            city_profile["total"] += 1
            hour = mvi_hour(raw)
            if hour is None:
                continue
            valid_hours += 1
            city_profile["valid"] += 1
            band = time_band(hour)
            bands[band] = bands.get(band, 0) + 1
            city_band = city_profile["bands"].setdefault(band, {"total": 0, "categories": {}})
            city_band["total"] += 1
            city_band["categories"][category] = city_band["categories"].get(category, 0) + 1
        city_time = []
        for city, profile in city_bands.items():
            ranked = sorted(profile["bands"].items(),
                            key=lambda item: (-item[1]["total"], item[0]))
            top_band, top = ranked[0] if ranked else (None, None)
            top_category = (min(top["categories"].items(),
                                key=lambda item: (-item[1], item[0]))[0]
                            if top else None)
            city_time.append({"municipality": city, "total": profile["total"],
                              "valid": profile["valid"], "top_band": top_band,
                              "top_band_total": top["total"] if top else 0,
                              "top_category": top_category})
        city_time.sort(key=lambda item: (-item["top_band_total"], item["municipality"]))
        weekday_counts = dict(weekday_rows)
        weekday_names = ("Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
                         "Quinta-feira", "Sexta-feira", "Sábado")
        return {"source": source, "total": sum(total for _year, total in years),
                "yearly": [{"year": row_year, "total": total} for row_year, total in years],
                "monthly": [{"period": f"{row_year:04d}-{month:02d}", "total": total}
                            for row_year, month, total in months],
                "weekdays": [{"name": name, "total": weekday_counts.get(day, 0)}
                             for day, name in enumerate(weekday_names)],
                "municipalities": [{"name": name, "total": total} for name, total in cities],
                "classifications": [{"name": name, "total": total}
                                    for name, total in classifications],
                "instruments": [{"name": name, "total": total} for name, total in
                                sorted(instruments.items(), key=lambda item: (-item[1], item[0]))],
                "time_coverage": {"valid": valid_hours, "total": len(instrument_rows)},
                "time_bands": [{"name": name, "total": total} for name, total in
                               sorted(bands.items(), key=lambda item: (-item[1], item[0]))],
                "city_time_bands": city_time}

    def mvi_comparison(self, year: int | None = None,
                       municipality: str | None = None) -> dict:
        """Aponta correspondências exatas potenciais sem fundir ou somar as fontes."""
        clauses = ["source IN ('mvi_cad', 'mvi_neac')", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT source, year, occurrence, victim, natural_key,
                event_date, municipality, category FROM record_versions
                WHERE {' AND '.join(clauses)}""", params).fetchall()
        groups: dict[tuple[int, str, str], dict[str, list[dict]]] = {}
        totals = {"mvi_cad": 0, "mvi_neac": 0}
        unmatched_identity = {"mvi_cad": 0, "mvi_neac": 0}
        for source, row_year, occurrence, victim, natural_key, date, city, category in rows:
            totals[source] += 1
            if not key(occurrence) or not key(victim):
                unmatched_identity[source] += 1
                continue
            identity = (row_year, key(occurrence), key(victim))
            groups.setdefault(identity, {"mvi_cad": [], "mvi_neac": []})[source].append({
                "natural_key": natural_key, "occurrence": occurrence,
                "victim": victim, "date": date.isoformat(),
                "municipality": city, "category": category,
            })
        counts = {"candidate_pairs": 0, "cad_only": unmatched_identity["mvi_cad"],
                  "neac_only": unmatched_identity["mvi_neac"], "ambiguous": 0}
        examples = []
        for identity, sources in sorted(groups.items()):
            cad, neac = sources["mvi_cad"], sources["mvi_neac"]
            if len(cad) > 1 or len(neac) > 1:
                counts["ambiguous"] += len(cad) + len(neac)
            elif cad and neac:
                counts["candidate_pairs"] += 1
                if len(examples) < 20:
                    examples.append({"cad": cad[0], "neac": neac[0],
                                     "same_date": cad[0]["date"] == neac[0]["date"],
                                     "same_municipality": key(cad[0]["municipality"]) ==
                                     key(neac[0]["municipality"])})
            elif cad:
                counts["cad_only"] += 1
            elif neac:
                counts["neac_only"] += 1
        return {"cad_total": totals["mvi_cad"], "neac_total": totals["mvi_neac"],
                **counts, "examples": examples}

    def arms_analysis(self, year: int | None = None,
                      municipality: str | None = None) -> dict:
        clauses = ["source = 'armas'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT raw_json, event_date, municipality, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        total = seized = restricted = 0
        monthly: dict[str, int] = {}
        groups: dict[str, dict[str, int]] = {name: {} for name in
                                            ("municipalities", "types", "calibers", "situations")}
        for raw_json, event_date, city, category in rows:
            row = json.loads(raw_json)
            units = arm_quantity(row)
            total += units
            seized_item = arm_seized(row)
            if seized_item:
                seized += units
                month = event_date.strftime("%Y-%m")
                monthly[month] = monthly.get(month, 0) + units
            if arm_restricted(row):
                restricted += units
            values = (city, category, arm_field(row, "caliber") or "Não informado",
                      arm_field(row, "situation") or "Não informado")
            for group, value in zip(groups.values(), values):
                group[value] = group.get(value, 0) + units
        return {"total": total, "seized": seized, "restricted": restricted,
                "records": len(rows),
                "monthly": [{"period": period, "total": value}
                            for period, value in sorted(monthly.items())],
                **{name: [{"name": value, "total": count} for value, count in
                          sorted(group.items(), key=lambda item: (-item[1], item[0]))[:10]]
                   for name, group in groups.items()}}

    def drugs_analysis(self, year: int | None = None,
                       municipality: str | None = None) -> dict:
        clauses = ["source = 'drogas'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT raw_json, event_date, municipality, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        monthly: dict[str, int] = {}
        groups: dict[str, dict[str, int]] = {name: {} for name in
                                            ("types", "municipalities", "locations")}
        weights: dict[str, float] = {}
        total_weight = 0.0
        weighted_records = 0
        for raw_json, event_date, city, category in rows:
            row = json.loads(raw_json)
            month = event_date.strftime("%Y-%m")
            monthly[month] = monthly.get(month, 0) + 1
            location = drug_field(row, "location") or "Não informado"
            for group, value in zip(groups.values(), (category, city, location)):
                group[value] = group.get(value, 0) + 1
            weight = drug_weight_grams(row)
            if weight is not None:
                weighted_records += 1
                total_weight += weight
                weights[category] = weights.get(category, 0) + weight
        return {"total": len(rows), "total_weight_grams": round(total_weight, 3),
                "weighted_records": weighted_records,
                "monthly": [{"period": period, "total": count}
                            for period, count in sorted(monthly.items())],
                **{name: [{"name": value, "total": count} for value, count in
                          sorted(group.items(), key=lambda item: (-item[1], item[0]))[:10]]
                   for name, group in groups.items()},
                "weights_by_type": [{"name": name, "grams": round(grams, 3)}
                                    for name, grams in sorted(weights.items(),
                                                              key=lambda item: (-item[1], item[0]))]}

    def teams_analysis(self, year: int | None = None,
                       municipality: str | None = None) -> dict:
        clauses = ["source = 'guarnicoes'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT natural_key, raw_json, occurrence, nature, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        team_scores: dict[str, dict[str, int]] = {}
        officer_scores: dict[str, dict] = {}
        officer_occurrences: set[tuple[str, str]] = set()
        natures: dict[str, int] = {}
        roster = extra = unlisted = points = 0
        for natural_key, raw_json, occurrence, nature, team in rows:
            row = json.loads(raw_json)
            score, _level = team_complexity(nature, pick(row, "solution"))
            group = team_group(team)
            if group == "roster":
                roster += 1
                points += score
                item = team_scores.setdefault(team, {"occurrences": 0, "points": 0})
                item["occurrences"] += 1
                item["points"] += score
                label = nature or "Não informada"
                natures[label] = natures.get(label, 0) + 1
            elif group == "extra":
                extra += 1
            else:
                unlisted += 1
            for officer in team_officers(team_field(row, "officers")):
                registration = officer["registration"]
                occurrence_key = occurrence or natural_key
                if (registration, occurrence_key) in officer_occurrences:
                    continue
                officer_occurrences.add((registration, occurrence_key))
                item = officer_scores.setdefault(registration, {"name": officer["name"],
                    "registration": registration, "occurrences": 0, "points": 0})
                item["occurrences"] += 1
                item["points"] += score
        return {"roster_occurrences": roster, "weighted_points": points,
                "teams": len(team_scores), "officers": len(officer_scores),
                "extra_occurrences": extra, "unlisted_occurrences": unlisted,
                "ranking": [{"name": name, **item} for name, item in
                            sorted(team_scores.items(), key=lambda pair:
                                   (-pair[1]["points"], -pair[1]["occurrences"], pair[0]))],
                "officer_ranking": sorted(officer_scores.values(), key=lambda item:
                                          (-item["points"], -item["occurrences"], item["name"])),
                "natures": [{"name": name, "total": total} for name, total in
                            sorted(natures.items(), key=lambda item: (-item[1], item[0]))[:10]]}

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
                    "action_evidence": indicator_evidence(row[-1], source, indicator),
                    "arm_quantity": arm_quantity(json.loads(row[-1])) if source == "armas" else None,
                    "arm_situation": arm_field(json.loads(row[-1]), "situation")
                    if source == "armas" else None,
                    "arm_caliber": arm_field(json.loads(row[-1]), "caliber")
                    if source == "armas" else None,
                    "arm_seized": arm_seized(json.loads(row[-1])) if source == "armas" else None,
                    "drug_quantity": drug_quantity(json.loads(row[-1]))
                    if source == "drogas" else None,
                    "drug_unit": drug_field(json.loads(row[-1]), "unit")
                    if source == "drogas" else None,
                    "drug_weight_grams": drug_weight_grams(json.loads(row[-1]))
                    if source == "drogas" else None,
                    "drug_location": drug_field(json.loads(row[-1]), "location")
                    if source == "drogas" else None,
                    "team_score": team_complexity(row[5], pick(json.loads(row[-1]), "solution"))[0]
                    if source == "guarnicoes" else None,
                    "team_role": team_field(json.loads(row[-1]), "role")
                    if source == "guarnicoes" else None,
                    "team_group": team_group(row[6]) if source == "guarnicoes" else None,
                } for row in rows]}

    def mvi_record_versions(self, source: str, natural_key: str) -> list[dict]:
        if source not in {"mvi_cad", "mvi_neac"}:
            raise ValueError("Fonte MVI desconhecida")
        with self.lock, self._connect() as db:
            rows = db.execute("""SELECT version, is_current, valid_from, valid_to,
                batch_id, eligible, category FROM record_versions
                WHERE source = ? AND natural_key = ? ORDER BY version DESC""",
                              [source, natural_key]).fetchall()
        columns = ("version", "is_current", "valid_from", "valid_to", "batch_id",
                   "eligible", "category")
        return [dict(zip(columns, row)) for row in rows]

    def mvi_record_detail(self, source: str, natural_key: str,
                          version: int | None = None) -> dict | None:
        if source not in {"mvi_cad", "mvi_neac"}:
            raise ValueError("Fonte MVI desconhecida")
        where = "version = ?" if version is not None else "is_current"
        params: list[object] = [source, natural_key]
        if version is not None:
            params.append(version)
        with self.lock, self._connect() as db:
            row = db.execute("""SELECT occurrence, victim, event_date, municipality,
                category, eligible, reason, version, batch_id, is_current, raw_json
                FROM record_versions WHERE source = ? AND natural_key = ? AND """ + where,
                             params).fetchone()
        if row is None:
            return None
        columns = ("occurrence", "victim", "event_date", "municipality", "category",
                   "eligible", "reason", "version", "batch_id", "is_current")
        return dict(zip(columns, row[:-1])) | {
            "source": source, "natural_key": natural_key, "fields": json.loads(row[-1]),
        }
