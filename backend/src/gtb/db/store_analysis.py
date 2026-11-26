"""Resumo e análises calculadas sobre as bases importadas."""

import json
import re
from datetime import date as calendar_date

from gtb.indicators.arms import arm_field, arm_quantity, arm_restricted, arm_seized
from gtb.indicators.drugs import drug_field, drug_weight_grams
from gtb.indicators.mvi_time import mvi_hour, time_band
from gtb.indicators.rules import key, plain
from gtb.indicators.teams import team_complexity, team_field, team_group, team_officers
from gtb.ingestion.adapters.normalize import SOURCES, declared_instrument, pick


class StoreAnalysisMixin:
    def summary(self, year: int | None = None, municipality: str | None = None,
                bpm_only: bool = False) -> dict:
        clauses = ["is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if bpm_only:
            cities = ("Palmeira dos Índios", "Belém", "Tanque d'Arca", "Maribondo", "Igaci",
                      "Quebrangulo", "Paulo Jacinto", "Mar Vermelho", "Estrela de Alagoas",
                      "Minador do Negrão", "Cacimbinhas")
            clauses.append("regexp_replace(strip_accents(lower(municipality)), "
                           "'[^a-z0-9]', '', 'g') IN (" + ",".join("?" for _ in cities) + ")")
            params.extend(key(city) for city in cities)
            # A fiscalização isolada permanece na auditoria, como no legado,
            # mas não representa uma nova ocorrência operacional do painel.
            clauses.append("NOT (source = 'ocorrencias' AND "
                           "contains(strip_accents(lower(nature)), 'apoio ao judiciario') AND "
                           "contains(strip_accents(lower(nature)), 'fiscalizacao de medida protetiva'))")
        with self.lock, self._connect() as db:
            latest_imports = dict(db.execute("SELECT source, max(imported_at) FROM import_batches "
                                             "GROUP BY source").fetchall())
            last_import_day = max((str(value)[:10] for value in latest_imports.values() if value),
                                  default=None)
            period_end = (last_import_day if year == calendar_date.today().year and
                          last_import_day and last_import_day.startswith(f"{year}-") else None)
            if period_end:
                clauses.append("event_date <= ?")
                params.append(period_end)
            where = " AND ".join(clauses)
            rows = db.execute(f"""SELECT source, category, indicators, year,
                month(event_date) AS month,
                count(*) AS total FROM record_versions WHERE {where}
                GROUP BY source, category, indicators, year, month
                ORDER BY year, month, source, category""",
                              params).fetchall()
            quarantine_count = db.execute("SELECT count(*) FROM quarantine").fetchone()[0]
            distributions = db.execute(f"""SELECT municipality, nature, year, month(event_date), count(*)
                FROM record_versions WHERE {where} AND source = 'ocorrencias'
                GROUP BY municipality, nature, year, month(event_date)""", params).fetchall()
            independent = db.execute(f"""SELECT source, raw_json FROM record_versions
                WHERE {where} AND source IN ('armas', 'drogas')""", params).fetchall()
            coverage = dict(db.execute("SELECT source, count(*) FROM record_versions "
                                       "WHERE is_current GROUP BY source").fetchall())
            general_raw = db.execute(f"SELECT raw_json FROM record_versions WHERE {where} "
                                     "AND source = 'ocorrencias'", params).fetchall()
        general_arms, general_drugs = 0, 0
        for (raw,) in general_raw:
            text = plain(' '.join(str(value) for column, value in json.loads(raw).items()
                                  if not column.startswith('__siopm')))
            general_arms += bool(re.search(r"arma|armas|revolver|pistola|faca|facao|garrucha|espingarda", text))
            general_drugs += bool(re.search(r"droga|entorpecente|maconha|cocaina|crack|ecstasy|lsd|pasta base", text))
        seized_units, drug_grams, weighted_records = 0, 0.0, 0
        for source, raw in independent:
            record = json.loads(raw)
            if source == "armas":
                if arm_seized(record):
                    seized_units += arm_quantity(record)
            else:
                grams = drug_weight_grams(record)
                if grams is not None:
                    drug_grams += grams
                    weighted_records += 1
        city_counts, nature_counts, month_counts = {}, {}, {}
        for city, nature, row_year, month, total in distributions:
            city_counts[city] = city_counts.get(city, 0) + total
            label = nature or "Não informada"
            nature_counts[label] = nature_counts.get(label, 0) + total
            period = f"{row_year:04d}-{month:02d}"
            month_counts[period] = month_counts.get(period, 0) + total
        def ranking(counts: dict, temporal: bool = False) -> list[dict]:
            ordered = sorted(counts.items(), key=(lambda item: item[0]) if temporal
                             else (lambda item: (-item[1], item[0])))
            return [{"name": name, "total": total} for name, total in ordered]
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
                "period_end": period_end,
                "occurrences": by_source["ocorrencias"], "seized_arms": seized_units,
                "general_arm_occurrences": general_arms, "general_drug_occurrences": general_drugs,
                "drug_weight_grams": drug_grams, "weighted_drug_records": weighted_records,
                "source_coverage": {source: coverage.get(source, 0) for source in SOURCES},
                "last_imported_at": {source: str(latest_imports[source]) if source in latest_imports
                                     else None for source in SOURCES},
                "occurrence_charts": {"monthly": ranking(month_counts, True),
                                      "cities": ranking(city_counts), "natures": ranking(nature_counts)},
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

    def crime_analysis(self, kind: str, year: int | None = None,
                       municipality: str | None = None) -> dict:
        if kind not in {"CVP", "Tentativa de homicídio"}:
            raise ValueError("Indicador criminal desconhecido")
        return self._occurrence_analysis(kind, year, municipality)

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
                      municipality: str | None = None, month: int | None = None,
                      start_date: calendar_date | None = None,
                      end_date: calendar_date | None = None,
                      arm_type: str | None = None,
                      situation: str | None = None) -> dict:
        if start_date and end_date and start_date > end_date:
            raise ValueError("Data inicial posterior à data final")
        if month is not None and not 1 <= month <= 12:
            raise ValueError("Mês deve ficar entre 1 e 12")
        clauses = ["source = 'armas'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if month is not None:
            clauses.append("month(event_date) = ?")
            params.append(month)
        if start_date:
            clauses.append("event_date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("event_date <= ?")
            params.append(end_date)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT raw_json, event_date, municipality, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        total = seized = restricted = record_count = 0
        monthly: dict[str, int] = {}
        groups: dict[str, dict[str, int]] = {name: {} for name in
                                            ("municipalities", "types", "calibers", "situations")}
        for raw_json, event_date, city, category in rows:
            row = json.loads(raw_json)
            if arm_type and key(arm_type) != key(category or "Não informado"):
                continue
            if situation and key(situation) != key(arm_field(row, "situation") or "Não informado"):
                continue
            record_count += 1
            units = arm_quantity(row)
            total += units
            seized_item = arm_seized(row)
            if seized_item:
                seized += units
                month = event_date.strftime("%Y-%m")
                monthly[month] = monthly.get(month, 0) + units
            if arm_restricted(row):
                restricted += units
            values = (city, category or "Não informado", arm_field(row, "caliber") or "Não informado",
                      arm_field(row, "situation") or "Não informado")
            for group, value in zip(groups.values(), values):
                group[value] = group.get(value, 0) + units
        return {"total": total, "seized": seized, "restricted": restricted,
                "records": record_count,
                "available_types": sorted(groups["types"]),
                "available_situations": sorted(groups["situations"]),
                "monthly": [{"period": period, "total": value}
                            for period, value in sorted(monthly.items())],
                **{name: [{"name": value, "total": count} for value, count in
                          sorted(group.items(), key=lambda item: (-item[1], item[0]))[:10]]
                   for name, group in groups.items()}}

    def drugs_analysis(self, year: int | None = None,
                       municipality: str | None = None, month: int | None = None,
                       start_date: calendar_date | None = None,
                       end_date: calendar_date | None = None,
                       drug_type: str | None = None) -> dict:
        if start_date and end_date and start_date > end_date:
            raise ValueError("Data inicial posterior à data final")
        if month is not None and not 1 <= month <= 12:
            raise ValueError("Mês deve ficar entre 1 e 12")
        clauses = ["source = 'drogas'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if month is not None:
            clauses.append("month(event_date) = ?")
            params.append(month)
        if start_date:
            clauses.append("event_date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("event_date <= ?")
            params.append(end_date)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT raw_json, event_date, municipality, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        monthly: dict[str, int] = {}
        groups: dict[str, dict[str, int]] = {name: {} for name in
                                            ("types", "municipalities", "locations")}
        weights: dict[str, float] = {}
        total_weight = 0.0
        weighted_records = 0
        record_count = 0
        for raw_json, event_date, city, category in rows:
            if drug_type and key(drug_type) != key(category or "Não informado"):
                continue
            record_count += 1
            row = json.loads(raw_json)
            month = event_date.strftime("%Y-%m")
            monthly[month] = monthly.get(month, 0) + 1
            location = drug_field(row, "location") or "Não informado"
            for group, value in zip(groups.values(), (category or "Não informado", city, location)):
                group[value] = group.get(value, 0) + 1
            weight = drug_weight_grams(row)
            if weight is not None:
                weighted_records += 1
                total_weight += weight
                label = category or "Não informado"
                weights[label] = weights.get(label, 0) + weight
        return {"total": record_count, "total_weight_grams": round(total_weight, 3),
                "weighted_records": weighted_records,
                "available_types": sorted(groups["types"]),
                "monthly": [{"period": period, "total": count}
                            for period, count in sorted(monthly.items())],
                **{name: [{"name": value, "total": count} for value, count in
                          sorted(group.items(), key=lambda item: (-item[1], item[0]))[:10]]
                   for name, group in groups.items()},
                "weights_by_type": [{"name": name, "grams": round(grams, 3)}
                                    for name, grams in sorted(weights.items(),
                                                              key=lambda item: (-item[1], item[0]))]}

    def teams_analysis(self, year: int | None = None,
                       municipality: str | None = None,
                       month: int | None = None,
                       start_date: calendar_date | None = None,
                       end_date: calendar_date | None = None,
                       team_name: str | None = None,
                       officer_registration: str | None = None,
                       nature_filter: str | None = None) -> dict:
        if start_date and end_date and start_date > end_date:
            raise ValueError("Data inicial posterior à data final")
        if month is not None and not 1 <= month <= 12:
            raise ValueError("Mês deve ficar entre 1 e 12")
        clauses = ["source = 'guarnicoes'", "is_current", "eligible"]
        params: list[object] = []
        if year:
            clauses.append("year = ?")
            params.append(year)
        if municipality:
            clauses.append("lower(municipality) = lower(?)")
            params.append("Tanque d'Arca" if key(municipality) == "tanquedarca" else municipality)
        if month is not None:
            clauses.append("month(event_date) = ?")
            params.append(month)
        if start_date:
            clauses.append("event_date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("event_date <= ?")
            params.append(end_date)
        with self.lock, self._connect() as db:
            rows = db.execute(f"""SELECT natural_key, raw_json, occurrence, nature, category
                FROM record_versions WHERE {' AND '.join(clauses)}""", params).fetchall()
        available_teams = sorted({row[4] for row in rows if row[4]})
        available_natures = sorted({row[3] for row in rows if row[3]})
        available_officers = sorted({officer["registration"]
            for row in rows for officer in team_officers(team_field(json.loads(row[1]),
                                                           "officers"))})
        team_scores: dict[str, dict[str, int]] = {}
        officer_scores: dict[str, dict] = {}
        officer_occurrences: set[tuple[str, str]] = set()
        natures: dict[str, int] = {}
        roster = extra = unlisted = points = 0
        for natural_key, raw_json, occurrence, nature, team in rows:
            if team_name and key(team_name) != key(team or "Não informado"):
                continue
            if nature_filter and key(nature_filter) != key(nature or "Não informada"):
                continue
            row = json.loads(raw_json)
            members = team_officers(team_field(row, "officers"))
            if officer_registration and not any(
                    key(member["registration"]) == key(officer_registration)
                    for member in members):
                continue
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
            for officer in members:
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
                "available_teams": available_teams,
                "available_natures": available_natures,
                "available_officers": available_officers,
                "teams": len(team_scores), "officers": len(officer_scores),
                "extra_occurrences": extra, "unlisted_occurrences": unlisted,
                "ranking": [{"name": name, **item} for name, item in
                            sorted(team_scores.items(), key=lambda pair:
                                   (-pair[1]["points"], -pair[1]["occurrences"], pair[0]))],
                "officer_ranking": sorted(officer_scores.values(), key=lambda item:
                                          (-item["points"], -item["occurrences"], item["name"])),
                "natures": [{"name": name, "total": total} for name, total in
                            sorted(natures.items(), key=lambda item: (-item[1], item[0]))[:10]]}
