"""Cópias verificáveis do banco, contas e arquivos importados do projeto novo."""

import hashlib
import json
import shutil
import sqlite3
import uuid
import zipfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb

BACKUP_FORMAT = 1
MAX_MANIFEST_BYTES = 1024 * 1024


def _digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def _files(data_dir: Path) -> list[tuple[str, Path]]:
    found = []
    for name in ("gtb.duckdb", "auth.sqlite3"):
        path = data_dir / name
        if path.is_file():
            if path.is_symlink():
                raise ValueError("Backup não aceita arquivos simbólicos")
            found.append((name, path))
    raw_dir = data_dir / "raw"
    if raw_dir.exists():
        if raw_dir.is_symlink():
            raise ValueError("Backup não aceita diretórios simbólicos")
        for path in sorted(raw_dir.rglob("*")):
            if path.is_symlink():
                raise ValueError("Backup não aceita arquivos simbólicos")
            if path.is_file():
                found.append((path.relative_to(data_dir).as_posix(), path))
    return found


def create_backup(data_dir: Path) -> Path:
    """Gera ZIP em data/backups; a API deve estar parada para copiar DuckDB."""
    data_dir = data_dir.resolve()
    backup_dir = data_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    name = f"gtb-v2-{datetime.now(UTC):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:8]}.zip"
    target = backup_dir / name
    staging = backup_dir / f".{name}.tmp"
    try:
        with TemporaryDirectory(prefix="gtb-backup-") as directory:
            snapshot = Path(directory)
            files = _files(data_dir)
            if not files:
                raise ValueError("Nenhum dado local do sistema novo para copiar")
            for relative, source in files:
                destination = snapshot / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if relative == "auth.sqlite3":
                    with closing(sqlite3.connect(source)) as original, closing(sqlite3.connect(destination)) as copy:
                        original.backup(copy)
                else:
                    if relative == "gtb.duckdb":
                        # Outro processo segurando o DuckDB impede uma cópia inconsistente.
                        connection = duckdb.connect(str(source), read_only=True)
                        connection.close()
                    shutil.copy2(source, destination)
            manifest = {
                "format": BACKUP_FORMAT,
                "created_at": datetime.now(UTC).isoformat(),
                "files": [{"name": relative, "size": (snapshot / relative).stat().st_size,
                           "sha256": _digest(snapshot / relative)} for relative, _ in files],
            }
            with zipfile.ZipFile(staging, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
                for relative, _ in files:
                    archive.write(snapshot / relative, relative)
        staging.replace(target)
        return target
    finally:
        staging.unlink(missing_ok=True)


def restore_backup(data_dir: Path, archive_path: Path) -> Path | None:
    """Confere hashes antes de substituir os dados; guarda o estado anterior."""
    data_dir = data_dir.resolve()
    backup_dir = (data_dir / "backups").resolve()
    archive_path = archive_path.resolve()
    if not archive_path.is_relative_to(backup_dir) or archive_path.suffix.lower() != ".zip":
        raise ValueError("Arquivo deve ser um ZIP em data/backups")
    # A troca por rename precisa ocorrer no mesmo volume, inclusive no Windows.
    with TemporaryDirectory(prefix="gtb-restore-", dir=data_dir) as directory:
        staging = Path(directory)
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or "manifest.json" not in names:
                raise ValueError("Arquivo de backup inválido")
            if archive.getinfo("manifest.json").file_size > MAX_MANIFEST_BYTES:
                raise ValueError("Manifesto acima do limite")
            manifest = json.loads(archive.read("manifest.json"))
            if (manifest.get("format") != BACKUP_FORMAT or
                not isinstance(manifest.get("files"), list) or not manifest["files"]):
                raise ValueError("Formato de backup desconhecido")
            listed = [item["name"] for item in manifest["files"]]
            if len(listed) != len(set(listed)) or set(names) != set(listed) | {"manifest.json"}:
                raise ValueError("Lista de arquivos divergente")
            for item in manifest["files"]:
                relative = Path(item["name"])
                parts = relative.parts
                if (relative.is_absolute() or not parts or ".." in parts or
                    not (item["name"] in {"gtb.duckdb", "auth.sqlite3"} or
                         (parts[0] == "raw" and len(parts) > 1))):
                    raise ValueError("Caminho inválido no backup")
                destination = staging / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not isinstance(item["size"], int) or item["size"] < 0:
                    raise ValueError("Tamanho inválido no backup")
                with archive.open(item["name"]) as source, destination.open("wb") as output:
                    while chunk := source.read(1024 * 1024):
                        if output.tell() + len(chunk) > item["size"]:
                            raise ValueError("Arquivo de backup corrompido")
                        output.write(chunk)
                if destination.stat().st_size != item["size"] or _digest(destination) != item["sha256"]:
                    raise ValueError("Arquivo de backup corrompido")
        previous = create_backup(data_dir) if _files(data_dir) else None
        raw_dir = data_dir / "raw"
        if raw_dir.exists():
            shutil.rmtree(raw_dir)
        for name in ("gtb.duckdb", "auth.sqlite3"):
            if name not in listed:
                (data_dir / name).unlink(missing_ok=True)
        for item in manifest["files"]:
            destination = data_dir / item["name"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            (staging / item["name"]).replace(destination)
        return previous
