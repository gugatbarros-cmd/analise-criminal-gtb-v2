"""Contas e sessões locais com senhas derivadas por scrypt."""

import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROLES = {"admin", "analyst", "viewer"}
SESSION_HOURS = 8
LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300


class AuthManager:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.failed_logins: dict[str, list[float]] = {}
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY, role TEXT NOT NULL, salt BLOB NOT NULL,
                password_hash BLOB NOT NULL, created_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, username TEXT NOT NULL,
                expires_at TEXT NOT NULL, FOREIGN KEY(username) REFERENCES users(username))""")

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA foreign_keys = ON")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def has_users(self) -> bool:
        with self.lock, self._connect() as db:
            return db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None

    def create_user(self, username: str, password: str, role: str,
                    actor: dict | None = None) -> None:
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_.-]{2,31}", username):
            raise ValueError("Usuário deve ter 3 a 32 caracteres válidos")
        if len(password) < 12 or len(password) > 256:
            raise ValueError("Senha deve ter de 12 a 256 caracteres")
        if role not in ROLES:
            raise ValueError("Papel desconhecido")
        with self.lock, self._connect() as db:
            first = db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None
            if first and (role != "admin" or actor is not None):
                raise PermissionError("A primeira conta deve ser administradora local")
            if not first and (not actor or actor["role"] != "admin"):
                raise PermissionError("Somente administrador pode criar contas")
            salt = secrets.token_bytes(32)
            digest = hashlib.scrypt(password.encode("utf-8"), salt=salt,
                                    n=2**14, r=8, p=1, dklen=32)
            try:
                db.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                           (username, role, salt, digest, datetime.now(UTC).isoformat()))
            except sqlite3.IntegrityError as error:
                raise ValueError("Usuário já existe") from error

    def authenticate(self, username: str, password: str) -> dict | None:
        if len(username) > 32 or len(password) > 256:
            return None
        with self.lock, self._connect() as db:
            now = time.monotonic()
            attempts = [timepoint for timepoint in self.failed_logins.get(username, [])
                        if now - timepoint < LOGIN_WINDOW_SECONDS]
            self.failed_logins[username] = attempts
            if len(attempts) >= LOGIN_ATTEMPTS:
                return None
            row = db.execute("SELECT role, salt, password_hash FROM users WHERE username = ?",
                             (username,)).fetchone()
            if not row:
                attempts.append(now)
                return None
            role, salt, expected = row
            digest = hashlib.scrypt(password.encode("utf-8"), salt=salt,
                                    n=2**14, r=8, p=1, dklen=32)
            if not hmac.compare_digest(digest, expected):
                attempts.append(now)
                return None
            self.failed_logins.pop(username, None)
            token = secrets.token_urlsafe(32)
            expires = datetime.now(UTC) + timedelta(hours=SESSION_HOURS)
            db.execute("DELETE FROM sessions WHERE expires_at <= ?",
                       (datetime.now(UTC).isoformat(),))
            db.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                       (self._token_hash(token), username, expires.isoformat()))
            return {"token": token, "username": username, "role": role,
                    "expires_at": expires.isoformat()}

    def user_for_token(self, token: str) -> dict | None:
        if not token or len(token) > 256:
            return None
        with self.lock, self._connect() as db:
            row = db.execute("""SELECT users.username, users.role, sessions.expires_at
                FROM sessions JOIN users ON users.username = sessions.username
                WHERE sessions.token_hash = ?""", (self._token_hash(token),)).fetchone()
            if not row or datetime.fromisoformat(row[2]) <= datetime.now(UTC):
                return None
            return {"username": row[0], "role": row[1], "expires_at": row[2]}

    def revoke(self, token: str) -> None:
        with self.lock, self._connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (self._token_hash(token),))

    def users(self) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("SELECT username, role, created_at FROM users ORDER BY username").fetchall()
        return [dict(zip(("username", "role", "created_at"), row)) for row in rows]

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()
