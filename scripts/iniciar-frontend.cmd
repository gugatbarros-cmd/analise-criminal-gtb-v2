@echo off
setlocal
cd /d "%~dp0..\frontend"
if not exist "node_modules\vite" (
  call npm.cmd install || exit /b 1
)
call npm.cmd run dev
