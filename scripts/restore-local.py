"""Restaura um backup local do DuckDB do projeto novo, sem tocar no legado."""

import argparse
from pathlib import Path

from gtb.db.store import Store


def main() -> None:
    parser = argparse.ArgumentParser(description="Restaurar banco local do GTB 2.0")
    parser.add_argument("backup", type=Path, help="Arquivo dentro de data/backups/")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    saved = Store(root / "data" / "gtb.duckdb").restore_backup(args.backup)
    print(f"Restauração concluída. Estado anterior salvo em: {saved}")


if __name__ == "__main__":
    main()
