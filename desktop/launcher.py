"""Inicia API e interface local em um único processo no Windows."""

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import uvicorn
from fastapi.staticfiles import StaticFiles


def log_path() -> Path:
    path = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "GTB2" / "logs" / "launcher.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def log(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with log_path().open("a", encoding="utf-8") as stream:
        stream.write(f"{timestamp} {message}\n")


def show_error(message: str) -> None:
    log(f"ERRO: {message}")
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "Análise Criminal GTB 2.0", 0x10)
    except (AttributeError, OSError):
        print(message, file=sys.stderr)


def open_when_ready(address: str) -> None:
    for _ in range(60):
        try:
            with urlopen(f"{address}/health", timeout=1) as response:
                if response.status == 200:
                    try:
                        edge = Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
                        if edge.is_file():
                            subprocess.Popen([str(edge), f"--app={address}", "--no-first-run"])
                            log(f"Interface aberta em janela própria do Edge em {address}")
                        else:
                            os.startfile(address)  # type: ignore[attr-defined]
                            log(f"Interface solicitada ao Windows em {address}")
                    except OSError:
                        if not webbrowser.open(address):
                            raise OSError("nenhum navegador aceitou o endereço local")
                        log(f"Interface aberta pelo navegador padrão em {address}")
                    return
        except (OSError, URLError, ValueError):
            time.sleep(0.5)
    show_error(f"O servidor iniciou, mas a interface não respondeu em {address}.")


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
            try:
                with urlopen("http://127.0.0.1:8000/health", timeout=2) as response:
                    if response.status == 200:
                        try:
                            os.startfile("http://127.0.0.1:8000")  # type: ignore[attr-defined]
                        except OSError:
                            webbrowser.open("http://127.0.0.1:8000")
                        log("Instância existente localizada; interface reaberta")
                        return 0
            except (OSError, URLError, ValueError) as error:
                log(f"A porta 8000 respondeu sem identificar o GTB: {error}")
            show_error("A porta local 8000 está ocupada por outro programa. "
                       "Feche esse programa e abra o GTB 2.0 novamente.")
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
    log(f"Iniciando versão local em {address}; dados em {data}")
    if os.environ.get("GTB_NO_BROWSER") != "1":
        threading.Thread(target=open_when_ready, args=(address,), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:
        show_error(f"Não foi possível iniciar o sistema.\n\n{error}\n\nLog: {log_path()}")
        raise SystemExit(1) from error
