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

function Test-GtbHealth {
  try {
    $health = Invoke-RestMethod -Uri "$address/health" -TimeoutSec 1
    return $health.status -eq 'ok'
  } catch {
    return $false
  }
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

try {
  if (-not (Test-Path -LiteralPath $executable)) {
    throw "Executável não encontrado: $executable"
  }

  if (-not (Test-GtbHealth)) {
    $previousNoBrowser = $env:GTB_NO_BROWSER
    $env:GTB_NO_BROWSER = '1'
    try {
      $process = Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) -PassThru
    } finally {
      $env:GTB_NO_BROWSER = $previousNoBrowser
    }

    $deadline = (Get-Date).AddSeconds(45)
    while (-not (Test-GtbHealth) -and (Get-Date) -lt $deadline) {
      if ($process.HasExited) {
        throw "O executável encerrou antes de iniciar. Consulte o registro: $log"
      }
      Start-Sleep -Milliseconds 500
      $process.Refresh()
    }
    if (-not (Test-GtbHealth)) {
      throw "O sistema não respondeu em 45 segundos. Consulte o registro: $log"
    }
  }

  Start-Process $address
} catch {
  Show-GtbError $_.Exception.Message
  exit 1
}
