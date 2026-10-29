param([string]$Compiler = '', [switch]$BuildApplication)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($BuildApplication) {
  & (Join-Path $PSScriptRoot 'build-windows.ps1') -SkipInstall
  if ($LASTEXITCODE -ne 0) { throw 'Build do aplicativo falhou' }
}
if (-not $Compiler) { $Compiler = Join-Path $root 'data\tools\nsis-3.12\makensis.exe' }
if (-not (Test-Path -LiteralPath $Compiler)) {
  throw 'Compilador NSIS ausente. Instale o NSIS gratuito e informe -Compiler com o caminho de makensis.exe.'
}
$version = (Get-Content (Join-Path $root 'frontend\package.json') -Raw | ConvertFrom-Json).version
Push-Location $PSScriptRoot
try {
  & $Compiler '/INPUTCHARSET' 'UTF8' "/DVERSION=$version" 'windows-installer.nsi'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o instalador' }
} finally { Pop-Location }
Write-Output (Join-Path $root "dist\GTB2-Instalador-$version.exe")
