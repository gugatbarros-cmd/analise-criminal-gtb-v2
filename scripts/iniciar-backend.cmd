@echo off
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv || exit /b 1
)
".venv\Scripts\python.exe" -m pip install -e ".\backend[dev]" || exit /b 1
".venv\Scripts\python.exe" -m uvicorn gtb.api.main:app --host 127.0.0.1 --port 8000
