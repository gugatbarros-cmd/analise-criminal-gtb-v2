"""Mede importação e consultas com ocorrências sintéticas em banco descartável."""

import argparse
import csv
import ctypes
import io
import json
import os
import platform
import sys
import tempfile
import threading
from pathlib import Path
from time import perf_counter

from gtb.db.store import MAX_UPLOAD_BYTES, Store


def synthetic_csv(count: int, offset: int = 0) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(("Número da ocorrência", "Data", "Cidade", "Natureza", "Solução"))
    natures = ("Cumprimento de mandado", "Visita preventiva", "Roubo consumado",
               "Atendimento comum")
    cities = ("Igaci", "Palmeira dos Índios", "Tanque d'Arca")
    for local_index in range(count):
        index = offset + local_index
        writer.writerow((f"BEN-{index:07d}", f"05/{1 + index // 4 % 12:02d}/2026",
                         cities[index % len(cities)], natures[index % len(natures)],
                         "ELABOROU TCO (PM)" if index % len(natures) == 2 else ""))
    return output.getvalue().encode("utf-8")


def timed(call):
    start = perf_counter()
    result = call()
    return result, round(perf_counter() - start, 4)


def working_set_bytes() -> int:
    """Memória física atual do processo, sem dependências adicionais no Windows."""
    if os.name == "nt":
        class Counters(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("page_fault_count", ctypes.c_ulong),
                        ("peak_working_set", ctypes.c_size_t),
                        ("working_set", ctypes.c_size_t),
                        ("quota_peak_paged_pool", ctypes.c_size_t),
                        ("quota_paged_pool", ctypes.c_size_t),
                        ("quota_peak_nonpaged_pool", ctypes.c_size_t),
                        ("quota_nonpaged_pool", ctypes.c_size_t),
                        ("pagefile_usage", ctypes.c_size_t),
                        ("peak_pagefile_usage", ctypes.c_size_t)]

        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        get_process = ctypes.windll.kernel32.GetCurrentProcess
        get_process.restype = ctypes.c_void_p
        get_memory = ctypes.windll.psapi.GetProcessMemoryInfo
        get_memory.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        if not get_memory(get_process(), ctypes.byref(counters), counters.cb):
            raise OSError("Não foi possível medir memória do processo")
        return counters.working_set
    import resource
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return usage * (1024 if platform.system() == "Linux" else 1)


class MemorySampler:
    def __init__(self):
        self.stop = threading.Event()
        self.peak = working_set_bytes()
        self.thread = threading.Thread(target=self._sample, daemon=True)

    def _sample(self):
        while not self.stop.wait(0.1):
            self.peak = max(self.peak, working_set_bytes())

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stop.set()
        self.thread.join()
        self.peak = max(self.peak, working_set_bytes())


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark local com dados sintéticos")
    parser.add_argument("--rows", type=int, default=10000,
                        help="Quantidade de ocorrências únicas (padrão: 10000)")
    parser.add_argument("--batch-size", type=int, default=100000,
                        help="Máximo de linhas por CSV sintético (padrão: 100000)")
    args = parser.parse_args()
    if not 1 <= args.rows <= 1000000:
        parser.error("--rows deve ficar entre 1 e 1000000")
    if not 1 <= args.batch_size <= 100000:
        parser.error("--batch-size deve ficar entre 1 e 100000")
    root = Path(__file__).resolve().parents[1]
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="benchmark-", dir=data_dir) as temporary:
        store = Store(Path(temporary) / "gtb.duckdb")
        csv_bytes = 0
        batch_times = []
        with MemorySampler() as memory:
            for offset in range(0, args.rows, args.batch_size):
                count = min(args.batch_size, args.rows - offset)
                payload = synthetic_csv(count, offset)
                if len(payload) > MAX_UPLOAD_BYTES:
                    parser.error("lote sintético acima de 64 MB; reduza --batch-size")
                csv_bytes += len(payload)
                start = perf_counter()
                imported = store.import_file("ocorrencias", f"synthetic-{offset}.csv", payload)
                seconds = round(perf_counter() - start, 4)
                assert imported["inserted"] == count and imported["quarantined"] == 0
                batch_times.append(seconds)
                print(f"Lote {len(batch_times)}: {offset + count}/{args.rows} linhas "
                      f"em {seconds:.1f} s", file=sys.stderr, flush=True)
                del payload
            summary, summary_seconds = timed(lambda: store.summary(year=2026))
            analysis, analysis_seconds = timed(
                lambda: store.operational_analysis("Mandados", 2026, "Igaci")
            )
            page, page_seconds = timed(
                lambda: store.records("ocorrencias", page=1, indicator="Mandados")
            )
        expected = args.rows // 4 + (1 if args.rows % 4 else 0)
        assert summary["mandados"] == page["total"] == expected
        assert analysis["total"] <= expected and len(page["items"]) <= 20
        result = {
            "rows": args.rows, "batch_size": args.batch_size,
            "batches": len(batch_times), "csv_bytes": csv_bytes,
            "db_bytes": (Path(temporary) / "gtb.duckdb").stat().st_size,
            "python": platform.python_version(), "platform": platform.platform(),
            "logical_cpus": os.cpu_count(),
            "import_seconds": round(sum(batch_times), 4),
            "batch_seconds": batch_times,
            "import_rows_per_second": round(args.rows / sum(batch_times), 1),
            "peak_working_set_bytes": memory.peak,
            "summary_seconds": summary_seconds,
            "filtered_analysis_seconds": analysis_seconds,
            "first_page_seconds": page_seconds,
            "mandados": expected, "quarantined": imported["quarantined"],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
