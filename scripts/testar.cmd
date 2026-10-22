@echo off
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv || exit /b 1
)
".venv\Scripts\python.exe" -m pip install -e ".\backend[dev]" || exit /b 1
".venv\Scripts\python.exe" -m pytest backend\tests || exit /b 1
".venv\Scripts\python.exe" -m ruff check backend || exit /b 1
cd frontend
call npm.cmd install || exit /b 1
call npm.cmd test || exit /b 1
call npm.cmd run build || exit /b 1
