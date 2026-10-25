"""A fila registra apenas contagens e permanece bloqueada sem destino autorizado."""

import pytest
from test_imports import cad, csv_bytes

from gtb.db.store import Store
from gtb.sync.outbox import DeliveryResult, LocalOutbox


def test_import_writes_aggregate_event_without_personal_fields(tmp_path):
    store = Store(tmp_path / "gtb.duckdb")
    content = csv_bytes([cad()])
    result = store.import_file("mvi_cad", "cad.csv", content)
    outbox = LocalOutbox(store.path)
    events = outbox.events()
    assert len(events) == 1
    event = events[0]
    assert event["id"] == result["id"]
    assert event["schema_version"] == 1
    assert event["status"] == "awaiting_authorization"
    assert event["attempts"] == 0
    assert event["payload"] == {
        "schema_version": 1, "batch_id": result["id"], "source": "mvi_cad",
        "row_count": 1, "inserted": 1, "updated": 0, "quarantined": 0,
        "differences": 0,
    }
    assert "Maria Aparecida Silva" not in str(event)
    assert "cad.csv" not in str(event)
    assert store.import_file("mvi_cad", "cad.csv", content)["repeated"]
    assert len(outbox.events()) == 1
    with pytest.raises(PermissionError, match="não autorizada"):
        outbox.record_result(event["id"], DeliveryResult("delivered"))


def test_outbox_contract_records_retry_and_conflict_after_explicit_activation(tmp_path):
    store = Store(tmp_path / "gtb.duckdb")
    event_id = store.import_file("mvi_cad", "cad.csv", csv_bytes([cad()]))["id"]
    with store._connect() as db:
        db.execute("UPDATE sync_outbox SET status = 'retry' WHERE id = ?", [event_id])
    outbox = LocalOutbox(store.path)
    outbox.record_result(event_id, DeliveryResult("retry", "falha temporária"),
                         retry_after_seconds=60)
    retried = outbox.events("retry")[0]
    assert retried["attempts"] == 1
    assert retried["next_attempt_at"] is not None
    outbox.record_result(event_id, DeliveryResult("conflict", "versão divergente"))
    conflicted = outbox.events("conflict")[0]
    assert conflicted["attempts"] == 2
    assert conflicted["next_attempt_at"] is None
