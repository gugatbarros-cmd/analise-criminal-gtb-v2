$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

function Confirm-Exit([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step falhou (código $LASTEXITCODE)." }
}

$repo = 'gugatbarros-cmd/analise-criminal-gtb-v2'

function Get-InstallerPath([string]$version) {
  Join-Path $root "dist\GTB2-Instalador-$version.exe"
}

$manifestName = 'gtb2-atualizacao.json'

function Test-ReleaseExists([string]$version) {
  $releases = & gh release list --repo $repo --limit 100 --json tagName | ConvertFrom-Json
  Confirm-Exit 'Consulta das releases'
  return [bool](@($releases | Where-Object { $_.tagName -eq "v$version" }).Count)
}

function Test-ReleaseManifest([string]$version) {
  $assets = (& gh release view "v$version" --repo $repo --json assets | ConvertFrom-Json).assets
  Confirm-Exit 'Consulta dos arquivos da release'
  return [bool](@($assets | Where-Object { $_.name -eq $manifestName }).Count)
}

# Manifesto lido pelos aplicativos instalados pelo endereço de download do GitHub,
# que não tem o limite de 60 consultas por hora da API.
function New-ReleaseManifest([string]$version, [string]$installer) {
  $stream = [System.IO.File]::OpenRead($installer)
  try { $hash = ([System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
  finally { $stream.Dispose() }
  $folder = Join-Path ([System.IO.Path]::GetTempPath()) "gtb2-release-$version"
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  $path = Join-Path $folder $manifestName
  $manifest = [ordered]@{ version = $version; installer = (Split-Path $installer -Leaf); size = (Get-Item -LiteralPath $installer).Length; sha256 = $hash }
  [System.IO.File]::WriteAllText($path, ($manifest | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
  return $path
}

# Aguarda o GitHub Actions do commit e confirma que o site exibe a versão publicada.
function Wait-PublishedSite([string]$commit, [string]$version) {
  $deadline = (Get-Date).AddMinutes(25)
  $run = $null
  do {
    $runs = & gh run list --repo $repo --workflow pages.yml --branch main --limit 10 --json headSha,status,conclusion,url | ConvertFrom-Json
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
}

# O aplicativo instalado só se atualiza a partir da release com o instalador anexado.
function Publish-Release([string]$version, [string]$commit) {
  $installer = Get-InstallerPath $version
  if (-not (Test-Path -LiteralPath $installer)) { throw "Instalador ausente: $installer" }
  $fileVersion = (Get-Item -LiteralPath $installer).VersionInfo.FileVersion
  if ($fileVersion -and $fileVersion.Trim() -ne $version) {
    throw "O instalador $installer declara a versão $fileVersion, não $version."
  }
  $manifest = New-ReleaseManifest $version $installer
  # O manifesto vai depois do instalador: só anuncia a versão quando o instalador já está anexado.
  & gh release create "v$version" $installer $manifest --repo $repo --target $commit --title "GTB 2.0 v$version" --notes "Atualização do GTB 2.0. O instalador preserva as bases e contas locais."
  Confirm-Exit 'Publicação do instalador'
}

& git fetch origin main
Confirm-Exit 'Atualização da referência remota'
if ((& git rev-parse HEAD) -ne (& git rev-parse origin/main)) {
  throw 'Esta cópia está atrás de origin/main. Integre as mudanças antes de publicar.'
}
if (-not (& git status --porcelain=v1 --untracked-files=normal)) {
  # Retoma uma publicação interrompida depois do envio: site publicado sem release do instalador.
  $published = (Get-Content frontend/package.json -Raw | ConvertFrom-Json).version
  if (Test-ReleaseExists $published) {
    if (-not (Test-ReleaseManifest $published)) {
      $installer = Get-InstallerPath $published
      if (-not (Test-Path -LiteralPath $installer)) { throw "A release v$published não tem manifesto e o instalador não está em dist." }
      & gh release upload "v$published" (New-ReleaseManifest $published $installer) --repo $repo
      Confirm-Exit 'Envio do manifesto'
      Write-Output "Manifesto de atualização anexado à release v$published."
      return
    }
    Write-Output 'Nenhuma mudança nova para publicar.'
    return
  }
  if ((& git log -1 --format=%s).Trim() -ne "Publica GTB 2.0 v$published") {
    throw "A versão $published não tem release, mas o último commit não é a publicação dessa versão. Verifique manualmente."
  }
  if (-not (Test-Path -LiteralPath (Get-InstallerPath $published))) {
    throw "A versão $published não tem release e o instalador não está em dist. Gere-o a partir deste commit antes de retomar."
  }
  Write-Output "A versão $published foi enviada sem release. Retomando a publicação do instalador."
  $commit = (& git rev-parse HEAD).Trim()
  Wait-PublishedSite $commit $published
  Publish-Release $published $commit
  Write-Output "GTB 2.0 v$published publicado: site e instalador confirmados."
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
$installer = Get-InstallerPath $version
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
Wait-PublishedSite $commit $version
Publish-Release $version $commit
Write-Output "GTB 2.0 v$version publicado: site e instalador confirmados."
