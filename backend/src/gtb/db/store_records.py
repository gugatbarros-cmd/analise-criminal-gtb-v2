"""Consulta paginada de registros e detalhes por fonte."""

import json
from datetime import date as calendar_date

from gtb.db.store_common import (
    indicator_evidence,
)
from gtb.indicators.arms import arm_field, arm_quantity, arm_restricted, arm_seized
from gtb.indicators.drugs import drug_field, drug_quantity, drug_weight_grams
from gtb.indicators.rules import key
from gtb.indicators.teams import team_complexity, team_field, team_group, team_officers
from gtb.ingestion.adapters.normalize import SOURCES, declared_instrument, pick


class StoreRecordsMixin:
    def records(self, source: str, page: int = 1, size: int = 20,
                year: int | None = None, municipality: str | None = None,
                victim: str | None = None, eligible_only: bool = False,
                category_prefix: str | None = None, indicator: str | None = None,
                start_date: calendar_date | None = None,
                end_date: calendar_date | None = None,
                month: int | None = None, arm_type: str | None = None,
                situation: str | None = None,
                drug_type: str | None = None,
                team_name: str | None = None,
                officer_registration: str | None = None,
                nature_filter: str | None = None) -> dict:
        if source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        if (arm_type or situation) and source != "armas":
            raise ValueError("Filtros de arma exigem a fonte armas")
        if drug_type and source != "drogas":
            raise ValueError("Filtro de droga exige a fonte drogas")
        if team_name and source != "guarnicoes":
            raise ValueError("Filtro de equipe exige a fonte guarnicoes")
        if (officer_registration or nature_filter) and source != "guarnicoes":
            raise ValueError("Filtros de policial e natureza exigem a fonte guarnicoes")
        if start_date and end_date and start_date > end_date:
            raise ValueError("Data inicial posterior à data final")
        if month is not None and not 1 <= month <= 12:
            raise ValueError("Mês deve ficar entre 1 e 12")
        page, size = max(page, 1), min(max(size, 1), 100)
        clauses = ["source = ?", "is_current"]
        params: list[object] = [source]
        if year:
            clauses.append("year = ?")
            params.append(year)
        if month is not None:
            clauses.append("month(event_date) = ?")
            params.append(month)
        if start_date:
            clauses.append("event_date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("event_date <= ?")
            params.append(end_date)
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
            selection = f"""SELECT natural_key, event_date, municipality, occurrence, victim, nature,
                category, eligible, reason, version, indicators, raw_json FROM record_versions
                WHERE {where} ORDER BY event_date DESC, occurrence, victim, natural_key"""
            if arm_type or situation or drug_type or team_name or officer_registration or nature_filter:
                rows = []
                total = 0
                cursor = db.execute(selection, params)
                while batch := cursor.fetchmany(1000):
                    for row in batch:
                        original = json.loads(row[-1]) if situation or officer_registration else None
                        if arm_type and key(arm_type) != key(row[6] or "Não informado"):
                            continue
                        if situation and key(situation) != key(arm_field(original, "situation") or
                                                               "Não informado"):
                            continue
                        if drug_type and key(drug_type) != key(row[6] or "Não informado"):
                            continue
                        if team_name and key(team_name) != key(row[6] or "Não informado"):
                            continue
                        if nature_filter and key(nature_filter) != key(row[5] or "Não informada"):
                            continue
                        if officer_registration and not any(
                                key(member["registration"]) == key(officer_registration)
                                for member in team_officers(team_field(original, "officers"))):
                            continue
                        if (page - 1) * size <= total < page * size:
                            rows.append(row)
                        total += 1
            else:
                total = db.execute(f"SELECT count(*) FROM record_versions WHERE {where}",
                                   params).fetchone()[0]
                rows = db.execute(selection + " LIMIT ? OFFSET ?",
                                  [*params, size, (page - 1) * size]).fetchall()
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
                    "arm_restricted": arm_restricted(json.loads(row[-1]))
                    if source == "armas" else None,
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
                    "team_officers": team_officers(team_field(json.loads(row[-1]), "officers"))
                    if source == "guarnicoes" else None,
                } for row in rows]}

    def consolidated_records(self, page: int = 1, size: int = 50,
                             source: str | None = None, year: int | None = None,
                             municipality: str | None = None,
                             search: str | None = None) -> dict:
        """Relação auditável comum às seis fontes, sem fundir registros."""
        if source and source not in SOURCES:
            raise ValueError("Fonte desconhecida")
        page, size = max(page, 1), min(max(size, 1), 100)
        clauses = ["is_current"]
        params: list[object] = []
        if source:
            clauses.append("source = ?")
            params.append(source)
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if search:
            clauses.append("position(lower(?) in lower(concat_ws(' ', occurrence, victim, nature, category))) > 0")
            params.append(search)
        where = " AND ".join(clauses)
        with self.lock, self._connect() as db:
            total = db.execute(f"SELECT count(*) FROM record_versions WHERE {where}", params).fetchone()[0]
            rows = db.execute(f"""SELECT source, natural_key, event_date, municipality,
                occurrence, victim, nature, category, eligible, reason, version
                FROM record_versions WHERE {where}
                ORDER BY event_date DESC, source, occurrence, victim, natural_key
                LIMIT ? OFFSET ?""", [*params, size, (page - 1) * size]).fetchall()
        columns = ("source", "natural_key", "event_date", "municipality", "occurrence",
                   "victim", "nature", "category", "eligible", "reason", "version")
        return {"total": total, "page": page, "size": size,
                "items": [dict(zip(columns, row)) for row in rows]}

    def municipality_overview(self, year: int | None = None) -> list[dict]:
        clauses = ["is_current", "municipality <> ''"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT municipality, count(*) AS total,
                count(*) FILTER (WHERE source = 'ocorrencias') AS ocorrencias,
                count(*) FILTER (WHERE source = 'mvi_cad' AND eligible) AS mvi_cad,
                count(*) FILTER (WHERE source = 'mvi_neac' AND eligible) AS mvi_neac,
                count(*) FILTER (WHERE source = 'armas') AS armas,
                count(*) FILTER (WHERE source = 'drogas') AS drogas,
                count(*) FILTER (WHERE source = 'guarnicoes') AS guarnicoes
                FROM record_versions WHERE {' AND '.join(clauses)}
                GROUP BY municipality ORDER BY total DESC, municipality""", params).fetchall()
        columns = ("municipality", "total", "ocorrencias", "mvi_cad", "mvi_neac",
                   "armas", "drogas", "guarnicoes")
        return [dict(zip(columns, row)) for row in rows]

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
