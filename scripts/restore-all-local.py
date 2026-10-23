"""Restaura banco, contas e arquivos brutos do projeto novo após conferir hashes."""

import argparse
import os
from pathlib import Path

from gtb.ops.backup import restore_backup

ROOT = Path(__file__).resolve().parents[1]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restaurar backup integral local do GTB 2.0")
    parser.add_argument("archive", type=Path, help="Arquivo ZIP de data/backups/")
    args = parser.parse_args()
    data_dir = Path(os.environ.get("GTB_DATA_DIR", ROOT / "data"))
    previous = restore_backup(data_dir, args.archive)
    print(f"Restauração concluída. Estado anterior: {previous or 'sem dados anteriores'}")
