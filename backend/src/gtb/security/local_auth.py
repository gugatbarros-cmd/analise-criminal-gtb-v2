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
            columns = {row[1] for row in db.execute("PRAGMA table_info(users)")}
            if "status" not in columns:
                db.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
            if "must_change_password" not in columns:
                db.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")

    @staticmethod
    def _validate_password(password: str) -> None:
        if not 12 <= len(password) <= 256:
            raise ValueError("Senha deve ter de 12 a 256 caracteres")
        if (not any(char.isupper() for char in password)
                or not any(char.islower() for char in password)
                or not any(not char.isalnum() and not char.isspace() for char in password)):
            raise ValueError("Senha deve incluir letra maiúscula, letra minúscula e caractere especial")

    @staticmethod
    def _digest(password: str, salt: bytes) -> bytes:
        return hashlib.scrypt(password.encode("utf-8"), salt=salt,
                              n=2**14, r=8, p=1, dklen=32)

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
        self._validate_password(password)
        if role not in ROLES:
            raise ValueError("Papel desconhecido")
        with self.lock, self._connect() as db:
            first = db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None
            if first and (role != "admin" or actor is not None):
                raise PermissionError("A primeira conta deve ser administradora local")
            if not first and (not actor or actor["role"] != "admin"):
                raise PermissionError("Somente administrador pode criar contas")
            salt = secrets.token_bytes(32)
            digest = self._digest(password, salt)
            try:
                db.execute("INSERT INTO users (username, role, salt, password_hash, created_at, must_change_password) VALUES (?, ?, ?, ?, ?, ?)",
                           (username, role, salt, digest, datetime.now(UTC).isoformat(), int(not first)))
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
            row = db.execute("SELECT role, salt, password_hash, status, must_change_password FROM users WHERE username = ?",
                             (username,)).fetchone()
            if not row:
                attempts.append(now)
                return None
            role, salt, expected, status, must_change = row
            digest = self._digest(password, salt)
            if status != "active" or not hmac.compare_digest(digest, expected):
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
                    "must_change_password": bool(must_change),
                    "expires_at": expires.isoformat()}

    def user_for_token(self, token: str) -> dict | None:
        if not token or len(token) > 256:
            return None
        with self.lock, self._connect() as db:
            row = db.execute("""SELECT users.username, users.role, sessions.expires_at,
                users.status, users.must_change_password
                FROM sessions JOIN users ON users.username = sessions.username
                WHERE sessions.token_hash = ?""", (self._token_hash(token),)).fetchone()
            if not row or row[3] != "active" or datetime.fromisoformat(row[2]) <= datetime.now(UTC):
                return None
            return {"username": row[0], "role": row[1], "expires_at": row[2],
                    "must_change_password": bool(row[4])}

    def revoke(self, token: str) -> None:
        with self.lock, self._connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (self._token_hash(token),))

    def users(self) -> list[dict]:
        with self.lock, self._connect() as db:
            rows = db.execute("SELECT username, role, created_at, status, must_change_password FROM users ORDER BY username").fetchall()
        return [dict(zip(("username", "role", "created_at", "status", "must_change_password"), row)) for row in rows]

    def update_user(self, username: str, role: str, status: str, actor: dict) -> None:
        if actor["role"] != "admin" or role not in ROLES or status not in {"active", "revoked"}:
            raise ValueError("Perfil ou situação inválida")
        with self.lock, self._connect() as db:
            row = db.execute("SELECT role, status FROM users WHERE username = ?", (username,)).fetchone()
            if not row:
                raise ValueError("Conta não encontrada")
            if username == actor["username"] and (role != "admin" or status != "active"):
                raise ValueError("Não é possível revogar o próprio acesso administrador")
            if row == ("admin", "active") and (role != "admin" or status != "active"):
                remaining = db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'").fetchone()[0]
                if remaining <= 1:
                    raise ValueError("Mantenha pelo menos um administrador ativo")
            db.execute("UPDATE users SET role = ?, status = ? WHERE username = ?",
                       (role, status, username))
            if status != "active":
                db.execute("DELETE FROM sessions WHERE username = ?", (username,))

    def reset_password(self, username: str, password: str, actor: dict) -> None:
        if actor["role"] != "admin":
            raise PermissionError("Somente administrador pode redefinir senhas")
        self._validate_password(password)
        with self.lock, self._connect() as db:
            if not db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                raise ValueError("Conta não encontrada")
            salt = secrets.token_bytes(32)
            db.execute("UPDATE users SET salt = ?, password_hash = ?, must_change_password = 1 WHERE username = ?",
                       (salt, self._digest(password, salt), username))
            db.execute("DELETE FROM sessions WHERE username = ?", (username,))

    def change_password(self, username: str, current: str, new: str, token: str) -> None:
        self._validate_password(new)
        with self.lock, self._connect() as db:
            row = db.execute("SELECT salt, password_hash FROM users WHERE username = ? AND status = 'active'",
                             (username,)).fetchone()
            if not row or not hmac.compare_digest(self._digest(current, row[0]), row[1]):
                raise ValueError("Senha atual incorreta")
            if current == new:
                raise ValueError("Escolha uma senha diferente")
            salt = secrets.token_bytes(32)
            db.execute("UPDATE users SET salt = ?, password_hash = ?, must_change_password = 0 WHERE username = ?",
                       (salt, self._digest(new, salt), username))
            db.execute("DELETE FROM sessions WHERE username = ? AND token_hash != ?",
                       (username, self._token_hash(token)))

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()
