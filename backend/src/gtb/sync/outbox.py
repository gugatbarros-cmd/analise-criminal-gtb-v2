"""Fila local de agregados, bloqueada até autorização explícita de sincronização."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal, Protocol

import duckdb

EVENT_VERSION = 1
OutboxStatus = Literal["awaiting_authorization", "retry", "conflict", "delivered"]


@dataclass(frozen=True)
class DeliveryResult:
    outcome: Literal["delivered", "retry", "conflict"]
    detail: str = ""


class SyncProvider(Protocol):
    """Contrato futuro; a aplicação não instancia nem chama provedores remotos."""

    def deliver(self, event: dict) -> DeliveryResult: ...


def enqueue_import(db: duckdb.DuckDBPyConnection, *, batch_id: str, source: str,
                   row_count: int, inserted: int, updated: int,
                   quarantined: int, differences: int) -> None:
    """Registra só contagens; participa da mesma transação do lote importado."""
    payload = {"schema_version": EVENT_VERSION, "batch_id": batch_id,
               "source": source, "row_count": row_count, "inserted": inserted,
               "updated": updated, "quarantined": quarantined,
               "differences": differences}
    db.execute("""INSERT INTO sync_outbox VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
               [batch_id, "import_aggregate", EVENT_VERSION,
                json.dumps(payload, sort_keys=True), "awaiting_authorization",
                datetime.now(UTC), 0, None, None])


class LocalOutbox:
    """Gerencia estados da fila no DuckDB, sem enviar eventos para fora."""

    def __init__(self, path: Path):
        self.path = path

    def events(self, status: OutboxStatus | None = None) -> list[dict]:
        with duckdb.connect(str(self.path), read_only=True) as db:
            where = "WHERE status = ?" if status else ""
            rows = db.execute(f"""SELECT id, event_type, schema_version, payload_json,
                status, created_at, attempts, next_attempt_at, last_error
                FROM sync_outbox {where} ORDER BY created_at, id""",
                [status] if status else []).fetchall()
        columns = ("id", "event_type", "schema_version", "payload", "status",
                   "created_at", "attempts", "next_attempt_at", "last_error")
        return [dict(zip(columns, (row[0], row[1], row[2], json.loads(row[3]), *row[4:])))
                for row in rows]

    def record_result(self, event_id: str, result: DeliveryResult,
                      retry_after_seconds: int = 300) -> None:
        """Registra uma decisão local futura; não executa nenhuma transmissão."""
        if result.outcome == "retry" and retry_after_seconds < 1:
            raise ValueError("Intervalo de nova tentativa inválido")
        with duckdb.connect(str(self.path)) as db:
            row = db.execute("SELECT status FROM sync_outbox WHERE id = ?", [event_id]).fetchone()
            if not row:
                raise ValueError("Evento não encontrado")
            if row[0] == "awaiting_authorization":
                raise PermissionError("Sincronização ainda não autorizada")
            next_attempt = (datetime.now(UTC) + timedelta(seconds=retry_after_seconds)
                            if result.outcome == "retry" else None)
            db.execute("""UPDATE sync_outbox SET status = ?, attempts = attempts + 1,
                next_attempt_at = ?, last_error = ? WHERE id = ?""",
                       [result.outcome, next_attempt, result.detail or None, event_id])
