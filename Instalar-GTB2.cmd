@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-windows.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao nao foi concluida. Consulte a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Instalacao concluida. O sistema foi aberto no navegador.
timeout /t 4 /nobreak >nul
