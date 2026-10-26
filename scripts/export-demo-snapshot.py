"""Exporta consultas sintéticas para uma prévia estática somente leitura."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from gtb.db.store import Store
from gtb.ingestion.adapters.normalize import SOURCES

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "demo-data.json"
VERSION = "0.1.49"


def export() -> dict:
    with TemporaryDirectory(prefix="gtb-demo-export-") as directory:
        store = Store(Path(directory) / "gtb.duckdb")
        for source, filename in (
            ("mvi_cad", "mvi-cad.csv"),
            ("mvi_neac", "mvi-neac.csv"),
            ("ocorrencias", "ocorrencias-demo.csv"),
            ("armas", "armas.csv"),
            ("drogas", "drogas.csv"),
            ("guarnicoes", "guarnicoes.csv"),
        ):
            fixture = ROOT / "fixtures" / "synthetic" / filename
            store.import_file(source, filename, fixture.read_bytes())

        records = {source: store.records(source, size=100)["items"] for source in SOURCES}
        years = sorted({item["event_date"].year for items in records.values() for item in items})
        cities = sorted({item["municipality"] for items in records.values() for item in items})
        views = {}
        for year in [None, *years, 1900]:
            for city in [None, *cities, "__sem_resultado__"]:
                lookup = f"{year or '*'}|{(city or '*').lower()}"
                views[lookup] = {
                    "summary": store.summary(year, city),
                    "tco": store.tco_analysis(year, city),
                    "domestic": store.domestic_analysis(year, city),
                    "arms": store.arms_analysis(year, city),
                    "drugs": store.drugs_analysis(year, city),
                    "teams": store.teams_analysis(year, city),
                    "operations": {kind: store.operational_analysis(kind, year, city)
                                   for kind in ("Mandados", "Visitas", "Sossego")},
                    "mvi": {source: store.mvi_analysis(source, year, city)
                            for source in ("mvi_cad", "mvi_neac")},
                    "mvi_comparison": store.mvi_comparison(year, city),
                }

        evidence = {}
        for kind in ("Mandados", "Visitas", "Sossego"):
            for item in store.records("ocorrencias", size=100, indicator=kind)["items"]:
                evidence[f"{kind}|{item['natural_key']}"] = item["action_evidence"]
        for indicator in ("Doméstica", "Doméstica:pending", "Doméstica:excluded",
                          "Doméstica:outside"):
            for item in store.records("ocorrencias", size=100, indicator=indicator)["items"]:
                evidence[f"{indicator}|{item['natural_key']}"] = item["action_evidence"]

        details = {}
        for source in ("mvi_cad", "mvi_neac"):
            details[source] = {}
            for item in records[source]:
                natural_key = item["natural_key"]
                details[source][natural_key] = {
                    "current": store.mvi_record_detail(source, natural_key),
                    "versions": store.mvi_record_versions(source, natural_key),
                }
        batches = store.batches()
        batch_ids = {batch["id"]: f"demo-batch-{batch['source']}" for batch in batches}
        audit = {batch_ids[batch["id"]]: {
            "divergences": store.divergences(batch["id"]),
            "quarantine": store.quarantines(batch["id"]),
        } for batch in batches}
        for batch in batches:
            batch["id"] = batch_ids[batch["id"]]
            batch["imported_at"] = "2026-10-23 09:00:00"
        for entries in details.values():
            for detail in entries.values():
                detail["current"]["batch_id"] = batch_ids[detail["current"]["batch_id"]]
                for version in detail["versions"]:
                    version["batch_id"] = batch_ids[version["batch_id"]]
                    version["valid_from"] = "2026-10-23 09:00:00"
        return {"version": VERSION, "years": years, "cities": cities, "views": views,
                "records": records, "evidence": evidence, "details": details,
                "batches": batches, "audit": audit}


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    snapshot = export()
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, default=str, separators=(",", ":"))
                      + "\n", encoding="utf-8")
    print(f"Prévia {VERSION}: {sum(len(items) for items in snapshot['records'].values())} "
          f"registros sintéticos em {OUTPUT}")
