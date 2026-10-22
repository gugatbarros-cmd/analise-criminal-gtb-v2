"""Mede importação e consultas com ocorrências sintéticas em banco descartável."""

import argparse
import csv
import io
import json
import os
import platform
import tempfile
from pathlib import Path
from time import perf_counter

from gtb.db.store import MAX_UPLOAD_BYTES, Store


def synthetic_csv(count: int) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(("Número da ocorrência", "Data", "Cidade", "Natureza", "Solução"))
    natures = ("Cumprimento de mandado", "Visita preventiva", "Roubo consumado",
               "Atendimento comum")
    cities = ("Igaci", "Palmeira dos Índios", "Tanque d'Arca")
    for index in range(count):
        writer.writerow((f"BEN-{index:07d}", f"05/{1 + index // 4 % 12:02d}/2026",
                         cities[index % len(cities)], natures[index % len(natures)],
                         "ELABOROU TCO (PM)" if index % len(natures) == 2 else ""))
    return output.getvalue().encode("utf-8")


def timed(call):
    start = perf_counter()
    result = call()
    return result, round(perf_counter() - start, 4)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark local com dados sintéticos")
    parser.add_argument("--rows", type=int, default=10000,
                        help="Quantidade de ocorrências únicas (padrão: 10000)")
    args = parser.parse_args()
    if not 1 <= args.rows <= 1000000:
        parser.error("--rows deve ficar entre 1 e 1000000")
    payload = synthetic_csv(args.rows)
    if len(payload) > MAX_UPLOAD_BYTES:
        parser.error("arquivo sintético acima de 30 MB; use lotes menores")
    root = Path(__file__).resolve().parents[1]
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="benchmark-", dir=data_dir) as temporary:
        store = Store(Path(temporary) / "gtb.duckdb")
        imported, import_seconds = timed(
            lambda: store.import_file("ocorrencias", "synthetic.csv", payload)
        )
        summary, summary_seconds = timed(lambda: store.summary(year=2026))
        analysis, analysis_seconds = timed(
            lambda: store.operational_analysis("Mandados", 2026, "Igaci")
        )
        page, page_seconds = timed(
            lambda: store.records("ocorrencias", page=1, indicator="Mandados")
        )
        expected = args.rows // 4 + (1 if args.rows % 4 else 0)
        assert imported["inserted"] == args.rows and imported["quarantined"] == 0
        assert summary["mandados"] == page["total"] == expected
        assert analysis["total"] <= expected and len(page["items"]) <= 20
        result = {
            "rows": args.rows, "csv_bytes": len(payload),
            "db_bytes": (Path(temporary) / "gtb.duckdb").stat().st_size,
            "python": platform.python_version(), "platform": platform.platform(),
            "logical_cpus": os.cpu_count(),
            "import_seconds": import_seconds, "summary_seconds": summary_seconds,
            "filtered_analysis_seconds": analysis_seconds,
            "first_page_seconds": page_seconds,
            "mandados": expected, "quarantined": imported["quarantined"],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
