param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Ambiente .venv ausente. Execute scripts\iniciar-backend.cmd uma vez.' }

Push-Location (Join-Path $root 'frontend')
try {
  if (-not $SkipInstall -and -not (Test-Path -LiteralPath 'node_modules\vite')) { & npm.cmd install; if ($LASTEXITCODE -ne 0) { throw 'npm install falhou' } }
  $env:VITE_STATIC_DEMO = '0'
  & npm.cmd run build -- --outDir dist-local
  if ($LASTEXITCODE -ne 0) { throw 'Build da interface falhou' }
} finally { Pop-Location }

if (-not $SkipInstall) {
  & $python -m pip install 'pyinstaller>=6,<7'
  if ($LASTEXITCODE -ne 0) { throw 'Instalação do empacotador falhou' }
}

Push-Location $root
try {
  & $python -m PyInstaller --noconfirm --clean --onefile --name GTB2-Local `
    --add-data 'frontend\dist-local;web' `
    --collect-all duckdb --collect-all polars --collect-all openpyxl `
    desktop\launcher.py
  if ($LASTEXITCODE -ne 0) { throw 'Empacotamento falhou' }
  Write-Output (Join-Path $root 'dist\GTB2-Local.exe')
} finally { Pop-Location }
