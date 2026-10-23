"""Cria contas locais sem expor senhas na linha de comando ou em arquivos versionados."""

import argparse
import getpass
import os
import sys
from pathlib import Path

from gtb.security.local_auth import ROLES, AuthManager

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Criar usuário do sistema GTB 2.0 local")
    parser.add_argument("username", help="Identificador da nova conta")
    parser.add_argument("--role", choices=sorted(ROLES), default="viewer")
    args = parser.parse_args()
    data_dir = Path(os.environ.get("GTB_DATA_DIR", ROOT / "data"))
    manager = AuthManager(data_dir / "auth.sqlite3")
    first = not manager.has_users()
    role = "admin" if first else args.role
    actor = None
    if not first:
        admin_name = input("Usuário administrador: ").strip()
        admin_password = getpass.getpass("Senha do administrador: ")
        session = manager.authenticate(admin_name, admin_password)
        if not session or session["role"] != "admin":
            print("Administrador não autenticado.", file=sys.stderr)
            return 1
        actor = session
    password = getpass.getpass("Senha da nova conta (mínimo 12 caracteres): ")
    confirmation = getpass.getpass("Repita a senha: ")
    if password != confirmation:
        print("As senhas não conferem.", file=sys.stderr)
        return 1
    try:
        manager.create_user(args.username, password, role, actor)
    except (ValueError, PermissionError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        if actor:
            manager.revoke(actor["token"])
    print(f"Conta {args.username} criada com papel {role}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
