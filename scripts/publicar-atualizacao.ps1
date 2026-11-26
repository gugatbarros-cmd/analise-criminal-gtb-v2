$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

function Confirm-Exit([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step falhou (código $LASTEXITCODE)." }
}

& git fetch origin main
Confirm-Exit 'Atualização da referência remota'
if ((& git rev-parse HEAD) -ne (& git rev-parse origin/main)) {
  throw 'Esta cópia está atrás de origin/main. Integre as mudanças antes de publicar.'
}
if (-not (& git status --porcelain=v1 --untracked-files=normal)) {
  Write-Output 'Nenhuma mudança nova para publicar.'
  return
}
if (-not (& git status --porcelain=v1 -- docs/STATUS_IMPLEMENTACAO.md) -or
    -not (& git status --porcelain=v1 -- frontend/src/project-progress.json)) {
  throw 'Atualize STATUS_IMPLEMENTACAO.md e project-progress.json nesta entrega.'
}

& node scripts/auto-version.mjs
Confirm-Exit 'Versão automática'
$version = (Get-Content frontend/package.json -Raw | ConvertFrom-Json).version
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Ambiente Python .venv ausente.' }
$env:PYTHONPATH = Join-Path $root 'backend\src'

& $python -m pytest backend/tests -q -p no:cacheprovider --basetemp "data/pytest-release-$version"
Confirm-Exit 'Testes do backend'
& $python -m ruff check backend
Confirm-Exit 'Ruff'
Push-Location frontend
try {
  & npm.cmd test -- --run
  Confirm-Exit 'Testes da interface'
} finally { Pop-Location }

& (Join-Path $PSScriptRoot 'build-windows.ps1') -SkipInstall
Confirm-Exit 'Build do aplicativo'
$compiler = @(
  (Join-Path $root 'data\tools\nsis-3.12\makensis.exe'),
  'C:\Program Files (x86)\NSIS\makensis.exe',
  'C:\Program Files\NSIS\makensis.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Compilador NSIS gratuito não encontrado.' }
& (Join-Path $PSScriptRoot 'build-installer.ps1') -Compiler $compiler
Confirm-Exit 'Build do instalador'
$installer = Join-Path $root "dist\GTB2-Instalador-$version.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw 'Instalador ausente após o build.' }

& git add -A -- .
Confirm-Exit 'Preparação do commit'
& git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { throw 'Nenhuma mudança foi preparada para o commit.' }
& git commit -m "Publica GTB 2.0 v$version"
Confirm-Exit 'Commit'
& git push origin HEAD:main
Confirm-Exit 'Envio ao GitHub'

$commit = (& git rev-parse HEAD).Trim()
$deadline = (Get-Date).AddMinutes(25)
$run = $null
do {
  $runs = & gh run list --repo gugatbarros-cmd/analise-criminal-gtb-v2 --workflow pages.yml --branch main --limit 10 --json headSha,status,conclusion,url | ConvertFrom-Json
  Confirm-Exit 'Consulta do GitHub Actions'
  $run = @($runs | Where-Object { $_.headSha -eq $commit } | Select-Object -First 1)
  if ($run.Count -and $run[0].status -eq 'completed') {
    if ($run[0].conclusion -ne 'success') { throw "Publicação do site falhou: $($run[0].url)" }
    break
  }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
if (-not $run.Count -or $run[0].status -ne 'completed') { throw 'Tempo esgotado no GitHub Actions.' }

$onlineVersion = ''
do {
  try {
    $manifest = Invoke-RestMethod "https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/app-version.json?verify=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 15
    $onlineVersion = $manifest.version
  } catch { $onlineVersion = '' }
  if ($onlineVersion -eq $version) { break }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
if ($onlineVersion -ne $version) { throw "O site não confirmou a versão $version." }

& gh release create "v$version" $installer --repo gugatbarros-cmd/analise-criminal-gtb-v2 --title "GTB 2.0 v$version" --notes "Atualização do GTB 2.0. O instalador preserva as bases e contas locais."
Confirm-Exit 'Publicação do instalador'
Write-Output "GTB 2.0 v$version publicado: site e instalador confirmados."
