"""Compara seis planilhas anonimizadas com totais oficiais, sem persistir os dados."""

import argparse
import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from gtb.db.store import Store
from gtb.ingestion.adapters.normalize import SOURCES

METRICS = {
    "summary": {"mvi_cad", "mvi_neac", "cvp", "tentativas", "tco", "mandados",
                "visitas", "sossego", "domestica", "quarantined_rows"},
    "arms": {"total", "records", "seized", "restricted"},
    "drugs": {"total", "total_weight_grams", "weighted_records"},
    "teams": {"roster_occurrences", "weighted_points", "teams", "officers",
              "extra_occurrences", "unlisted_occurrences"},
    "mvi_cad": {"total"},
    "mvi_neac": {"total"},
}


def _digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _analysis(store: Store, kind: str, filters: dict) -> dict:
    year, city = filters.get("year"), filters.get("municipality")
    if kind == "summary":
        return store.summary(year, city)
    if kind in {"mvi_cad", "mvi_neac"}:
        return store.mvi_analysis(kind, year, city)
    start, end = _date(filters.get("start_date")), _date(filters.get("end_date"))
    month = filters.get("month")
    if kind == "arms":
        return store.arms_analysis(year, city, month, start, end,
                                   filters.get("arm_type"), filters.get("situation"))
    if kind == "drugs":
        return store.drugs_analysis(year, city, month, start, end,
                                    filters.get("drug_type"))
    return store.teams_analysis(year, city, month, start, end,
                                filters.get("team_name"),
                                filters.get("officer_registration"),
                                filters.get("nature_filter"))


def compare(manifest_path: Path) -> dict:
    manifest_path = manifest_path.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("sources"), list):
        raise TypeError("Manifesto deve conter a lista sources")
    if not isinstance(manifest.get("checks"), list) or not manifest["checks"]:
        raise ValueError("Manifesto deve conter checks com totais oficiais")
    sources = manifest["sources"]
    if any(not isinstance(entry, dict) for entry in sources):
        raise TypeError("Cada fonte deve ser um objeto")
    if {entry.get("source") for entry in sources} != set(SOURCES) or len(sources) != len(SOURCES):
        raise ValueError("Informe exatamente as seis fontes, uma vez cada")
    verified = []
    for entry in sources:
        source = entry["source"]
        path = (manifest_path.parent / entry["path"]).resolve()
        if not path.is_file():
            raise ValueError(f"Arquivo da fonte {source} não encontrado")
        digest = _digest(path)
        if digest != entry.get("sha256"):
            raise ValueError(f"SHA-256 divergente na fonte {source}")
        verified.append((source, path, digest))

    with TemporaryDirectory(prefix="gtb-reference-") as directory:
        store = Store(Path(directory) / "gtb.duckdb")
        imports = []
        for source, path, digest in verified:
            result = store.import_file(source, path.name, path.read_bytes(), "complete")
            imports.append({"source": source, "sha256": digest, "inserted": result["inserted"],
                            "quarantined": result["quarantined"],
                            "status": result["status"]})
        checks = []
        for item in manifest["checks"]:
            if not isinstance(item, dict):
                raise TypeError("Cada total oficial deve ser um objeto")
            metric = item.get("metric", "")
            kind, _, field = metric.partition(".")
            if field not in METRICS.get(kind, set()):
                raise ValueError(f"Métrica desconhecida: {metric}")
            expected = item.get("expected")
            if (isinstance(expected, bool) or not isinstance(expected, (int, float)) or
                    not math.isfinite(expected)):
                raise TypeError(f"Total oficial inválido: {metric}")
            filters = item.get("filters", {})
            if not isinstance(filters, dict):
                raise TypeError(f"Filtros inválidos: {metric}")
            allowed = {"year", "municipality"}
            if kind in {"arms", "drugs", "teams"}:
                allowed |= {"month", "start_date", "end_date"}
            if kind == "arms":
                allowed |= {"arm_type", "situation"}
            if kind == "drugs":
                allowed.add("drug_type")
            if kind == "teams":
                allowed |= {"team_name", "officer_registration", "nature_filter"}
            if set(filters) - allowed:
                raise ValueError(f"Filtros não permitidos em {metric}")
            actual = _analysis(store, kind, filters)[field]
            difference = round(actual - expected, 3)
            passed = difference == 0
            checks.append({"metric": metric, "filters": filters, "expected": expected,
                           "actual": actual, "difference": difference, "passed": passed})
    return {"status": "passed" if all(item["passed"] for item in checks) else "mismatch",
            "imports": imports, "checks": checks}


def main() -> int:
    parser = argparse.ArgumentParser(description="Comparar planilhas locais e totais de referência")
    parser.add_argument("manifest", type=Path, help="JSON local com fontes e totais esperados")
    args = parser.parse_args()
    try:
        report = compare(args.manifest)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"Manifesto ou fonte inválida: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
