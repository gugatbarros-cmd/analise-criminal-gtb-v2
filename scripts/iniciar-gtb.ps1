$ErrorActionPreference = 'Stop'
$installedExecutable = Join-Path $PSScriptRoot 'GTB2-Local.exe'
if (Test-Path -LiteralPath $installedExecutable -PathType Leaf) {
  $root = $PSScriptRoot
  $executable = $installedExecutable
} else {
  $root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $executable = Join-Path $root 'dist\GTB2-Local.exe'
}
$address = 'http://127.0.0.1:8000'
$log = Join-Path $env:LOCALAPPDATA 'GTB2\logs\launcher.log'

function Test-GtbHealth([int]$TimeoutSec = 5) {
  # Com o computador ocupado, a instância aberta pode levar alguns segundos para responder.
  try {
    $health = Invoke-RestMethod -Uri "$address/health" -TimeoutSec $TimeoutSec
    return $health.status -eq 'ok'
  } catch {
    return $false
  }
}

function Test-GtbListening {
  # Reconhece o GTB já aberto pela porta local, mesmo quando /health demora a responder.
  try {
    $owners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8000 -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($owner in $owners) {
      $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
      if ($name -eq 'GTB2-Local') { return $true }
    }
  } catch { }
  return $false
}

function Write-GtbLog([string]$Message) {
  try { Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" } catch { }
}

function Test-GtbRunning {
  if (Test-GtbHealth) { return $true }
  if (Test-GtbListening) {
    # Dá mais uma chance à resposta antes de abrir a interface de uma instância ocupada.
    if (Test-GtbHealth -TimeoutSec 15) { return $true }
    Write-GtbLog 'Instância aberta ocupada; interface reaberta sem confirmação de /health'
    return $true
  }
  return $false
}

function Show-GtbError([string]$Message) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    $Message,
    'Análise Criminal GTB 2.0',
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Error
  ) | Out-Null
}

function Open-GtbInterface {
  $edge = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\Edge\Application\msedge.exe'
  if (Test-Path -LiteralPath $edge -PathType Leaf) {
    Start-Process -FilePath $edge -ArgumentList "--app=$address", '--no-first-run'
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Interface aberta em janela própria do Edge em $address"
    return
  }
  try {
    Start-Process -FilePath 'explorer.exe' -ArgumentList $address
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Interface solicitada ao Windows em $address"
  } catch {
    try {
      Start-Process -FilePath $address
      Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Interface aberta pelo navegador padrão em $address"
    } catch {
      throw "O sistema iniciou em $address, mas o navegador não abriu. Abra esse endereço manualmente."
    }
  }
}

try {
  $updater = Join-Path $PSScriptRoot 'atualizar-gtb.ps1'
  if (Test-Path -LiteralPath $updater -PathType Leaf) {
    $updateStatus = Join-Path $PSScriptRoot 'mostrar-atualizacao.ps1'
    if (Test-Path -LiteralPath $updateStatus -PathType Leaf) {
      & $updateStatus -UpdaterPath $updater
    } else {
      & $updater
    }
  }
  if (-not (Test-Path -LiteralPath $executable)) {
    throw "Executável não encontrado: $executable"
  }

  $interfaceOpened = $false
  if (-not (Test-GtbRunning)) {
    $previousNoBrowser = $env:GTB_NO_BROWSER
    $env:GTB_NO_BROWSER = '1'
    try {
      $process = Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) -PassThru
    } finally {
      $env:GTB_NO_BROWSER = $previousNoBrowser
    }

    # A primeira abertura de uma atualização pode revisar os dados derivados.
    # O processo continua supervisionado enquanto preserva as bases originais.
    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
      if (Test-GtbHealth -TimeoutSec 3) { $ready = $true; break }
      $process.Refresh()
      if ($process.HasExited) {
        # Código 0 com o GTB na porta: o executável encontrou a instância aberta e já reabriu a interface.
        if ($process.ExitCode -eq 0 -and ((Test-GtbListening) -or (Test-GtbHealth))) {
          $ready = $true
          $interfaceOpened = $true
          break
        }
        throw "O executável encerrou antes de iniciar. Consulte o registro: $log"
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
      if (Test-GtbListening) {
        Write-GtbLog 'O GTB está aberto, mas não respondeu em 120 segundos; interface reaberta'
      } else {
        throw "O sistema não respondeu em 120 segundos. Consulte o registro: $log"
      }
    }
  }

  if (-not $interfaceOpened) { Open-GtbInterface }
} catch {
  Show-GtbError $_.Exception.Message
  exit 1
}
