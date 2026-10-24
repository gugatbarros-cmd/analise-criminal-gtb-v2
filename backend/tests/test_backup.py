"""A cópia integral protege versões, contas e arquivos de entrada."""

import hashlib
import json
import zipfile

import pytest
from test_imports import cad, csv_bytes

from gtb.db.store import Store
from gtb.ops.backup import create_backup, restore_backup
from gtb.security.local_auth import AuthManager


def test_full_backup_restores_data_accounts_and_raw_files(tmp_path):
    data_dir = tmp_path / "data"
    store = Store(data_dir / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([cad()]))
    manager = AuthManager(data_dir / "auth.sqlite3")
    manager.create_user("admin", "a-strong-password", "admin")
    backup = create_backup(data_dir)
    assert backup.parent == data_dir / "backups"
    with zipfile.ZipFile(backup) as archive:
        names = archive.namelist()
        assert "gtb.duckdb" in names and "auth.sqlite3" in names
        assert any(name.startswith("raw/") for name in names)
        assert json.loads(archive.read("manifest.json"))["format"] == 1
    session = manager.authenticate("admin", "a-strong-password")
    manager.create_user("reader", "reader-password-123", "viewer", session)
    store.import_file("mvi_cad", "cad2.csv", csv_bytes([cad(**{"Nº NIC": "NIC-222"})]))
    (data_dir / "raw" / "extra.txt").write_text("novo", encoding="utf-8")
    previous = restore_backup(data_dir, backup)
    assert previous and previous.exists()
    assert Store(data_dir / "gtb.duckdb").summary()["mvi_cad"] == 1
    restored = AuthManager(data_dir / "auth.sqlite3")
    assert [user["username"] for user in restored.users()] == ["admin"]
    assert not (data_dir / "raw" / "extra.txt").exists()


def test_corrupt_backup_does_not_replace_current_data(tmp_path):
    data_dir = tmp_path / "data"
    manager = AuthManager(data_dir / "auth.sqlite3")
    manager.create_user("admin", "a-strong-password", "admin")
    original = create_backup(data_dir)
    corrupt = data_dir / "backups" / "corrupt.zip"
    with zipfile.ZipFile(original) as source, zipfile.ZipFile(corrupt, "w") as target:
        for name in source.namelist():
            target.writestr(name, b"bad" if name == "auth.sqlite3" else source.read(name))
    with pytest.raises(ValueError, match="corrompido"):
        restore_backup(data_dir, corrupt)
    assert AuthManager(data_dir / "auth.sqlite3").has_users()


def test_restore_rejects_archive_outside_backup_directory(tmp_path):
    data_dir = tmp_path / "data"
    external = tmp_path / "external.zip"
    external.write_bytes(b"unused")
    with pytest.raises(ValueError, match="data/backups"):
        restore_backup(data_dir, external)


def test_restore_invalidates_sessions_from_the_backup(tmp_path):
    data_dir = tmp_path / "data"
    manager = AuthManager(data_dir / "auth.sqlite3")
    manager.create_user("admin", "a-strong-password", "admin")
    session = manager.authenticate("admin", "a-strong-password")
    assert manager.user_for_token(session["token"])
    backup = create_backup(data_dir)

    restore_backup(data_dir, backup)

    restored = AuthManager(data_dir / "auth.sqlite3")
    assert restored.has_users()
    assert restored.user_for_token(session["token"]) is None
    assert restored.authenticate("admin", "a-strong-password")


@pytest.mark.parametrize("database_name", ["gtb.duckdb", "auth.sqlite3"])
def test_restore_rejects_hash_valid_but_invalid_database(tmp_path, database_name):
    data_dir = tmp_path / "data"
    store = Store(data_dir / "gtb.duckdb")
    store.import_file("mvi_cad", "cad.csv", csv_bytes([cad()]))
    manager = AuthManager(data_dir / "auth.sqlite3")
    manager.create_user("admin", "a-strong-password", "admin")
    original = create_backup(data_dir)
    invalid = data_dir / "backups" / f"invalid-{database_name}.zip"
    with zipfile.ZipFile(original) as archive:
        content = {name: archive.read(name) for name in archive.namelist()}
    content[database_name] = b"invalid database"
    manifest = json.loads(content["manifest.json"])
    for entry in manifest["files"]:
        if entry["name"] == database_name:
            entry["size"] = len(content[database_name])
            entry["sha256"] = hashlib.sha256(content[database_name]).hexdigest()
    content["manifest.json"] = json.dumps(manifest).encode()
    with zipfile.ZipFile(invalid, "w") as archive:
        for name, payload in content.items():
            archive.writestr(name, payload)

    with pytest.raises(ValueError, match="inválido"):
        restore_backup(data_dir, invalid)
    assert Store(data_dir / "gtb.duckdb").summary()["mvi_cad"] == 1
    assert AuthManager(data_dir / "auth.sqlite3").has_users()
