$ErrorActionPreference = 'Stop'
# Encerra apenas a cópia instalada ou a compilação deste projeto.
$installed = Join-Path $env:LOCALAPPDATA 'Programs\GTB2\GTB2-Local.exe'
$built = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist\GTB2-Local.exe'
$allowed = @($installed, $built)
$processes = Get-Process -Name 'GTB2-Local' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $allowed -contains $_.Path }
if (-not $processes) { Write-Output 'O GTB 2.0 já está encerrado.'; exit 0 }
$processes | Stop-Process
Write-Output 'GTB 2.0 encerrado. Os dados locais foram preservados.'
