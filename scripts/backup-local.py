"""Copia e verifica os dados do projeto novo para data/backups/."""

import os
from pathlib import Path

from gtb.ops.backup import create_backup

ROOT = Path(__file__).resolve().parents[1]


if __name__ == "__main__":
    data_dir = Path(os.environ.get("GTB_DATA_DIR", ROOT / "data"))
    print(f"Backup criado: {create_backup(data_dir)}")
