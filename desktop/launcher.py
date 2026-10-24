"""Inicia API e interface local em um único processo no Windows."""

import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles


def data_directory() -> Path:
    configured = os.environ.get("GTB_DATA_DIR")
    base = Path(configured) if configured else Path(os.environ.get("LOCALAPPDATA", Path.home())) / "GTB2" / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base.resolve()


def web_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "web"
    return Path(__file__).resolve().parents[1] / "frontend" / "dist-local"


def main() -> int:
    data = data_directory()
    os.environ["GTB_DATA_DIR"] = str(data)
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", 8000)) == 0:
            print("A porta local 8000 já está em uso. Feche a outra instância antes de iniciar.",
                  file=sys.stderr)
            return 1
    if len(sys.argv) > 1:
        from gtb.ops.backup import create_backup, restore_backup

        if sys.argv[1:] == ["backup"]:
            print(f"Backup criado: {create_backup(data)}")
            return 0
        if len(sys.argv) == 3 and sys.argv[1] == "restore":
            previous = restore_backup(data, Path(sys.argv[2]))
            print("Dados restaurados.")
            if previous:
                print(f"Cópia do estado anterior: {previous}")
            return 0
        print("Uso: GTB2-Local.exe [backup | restore CAMINHO_DO_ZIP]", file=sys.stderr)
        return 2
    web = web_directory()
    if not (web / "index.html").is_file():
        print(f"Interface local não encontrada: {web}", file=sys.stderr)
        return 1
    from gtb.api.main import app  # define GTB_DATA_DIR antes da importação

    app.mount("/", StaticFiles(directory=web, html=True), name="local-ui")
    address = "http://127.0.0.1:8000"
    print(f"Análise Criminal GTB 2.0: {address}")
    print(f"Dados locais: {os.environ['GTB_DATA_DIR']}")
    print("Pressione Ctrl+C para encerrar.")
    if os.environ.get("GTB_NO_BROWSER") != "1":
        threading.Timer(2, webbrowser.open, args=(address,)).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
