param([switch]$CheckOnly, [switch]$EmitStatus, [switch]$AllowRunning, [switch]$Restart, [string]$StatusFile = '')

$ErrorActionPreference = 'Stop'
$versionFile = Join-Path $PSScriptRoot 'version.txt'
$logFile = Join-Path $env:LOCALAPPDATA 'GTB2\logs\updates.log'

function Write-UpdateLog([string]$Message) {
  $directory = Split-Path $logFile -Parent
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
}

function Send-UpdateStatus([string]$Phase, [string]$Message) {
  if ($StatusFile) {
    $status = @{ phase = $Phase; message = $Message } | ConvertTo-Json -Compress
    $temporaryStatus = "$StatusFile.tmp"
    [System.IO.File]::WriteAllText($temporaryStatus, $status, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryStatus -Destination $StatusFile -Force
  }
  if ($EmitStatus) {
    Write-Output ([pscustomobject]@{ Type = 'GTB.UpdateStatus'; Phase = $Phase; Message = $Message })
  }
}

try {
  if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) { return }
  $currentText = (Get-Content -LiteralPath $versionFile -Raw).Trim()
  if ($currentText -notmatch '^\d+\.\d+\.\d+$') { throw 'Versão instalada inválida.' }
  $current = [version]$currentText

  # Instala na próxima abertura, após o servidor local ser encerrado.
  $running = @(Get-CimInstance Win32_Process -Filter "Name = 'GTB2-Local.exe'" |
    Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, (Join-Path $PSScriptRoot 'GTB2-Local.exe'), [StringComparison]::OrdinalIgnoreCase) })
  if ($running.Count -gt 0 -and -not $AllowRunning) {
    Send-UpdateStatus 'ready' 'O GTB já está aberto. Preparando a interface…'
    return
  }

  Send-UpdateStatus 'checking' 'Verificando se existe uma nova versão…'
  $api = 'https://api.github.com/repos/gugatbarros-cmd/analise-criminal-gtb-v2/releases/latest'
  $release = Invoke-RestMethod -Uri $api -TimeoutSec 15 -Headers @{ 'User-Agent' = 'GTB2-Updater' }
  if ($release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw 'Versão da publicação inválida.' }
  $publishedText = $Matches[1]
  if ([version]$publishedText -le $current) {
    Send-UpdateStatus 'ready' "Versão $currentText atualizada. Abrindo o sistema…"
    return
  }

  $expectedName = "GTB2-Instalador-$publishedText.exe"
  $asset = @($release.assets | Where-Object { $_.name -eq $expectedName }) | Select-Object -First 1
  if (-not $asset) { throw "Instalador $publishedText ainda indisponível." }
  $expectedUrl = "https://github.com/gugatbarros-cmd/analise-criminal-gtb-v2/releases/download/v$publishedText/$expectedName"
  if ($asset.browser_download_url -cne $expectedUrl -or $asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') {
    throw 'Origem ou SHA-256 do instalador inválido.'
  }
  $expectedHash = $Matches[1].ToUpperInvariant()
  if ([long]$asset.size -le 0) { throw 'Tamanho do instalador inválido.' }
  if ($CheckOnly) { Write-Output $publishedText; return }

  Send-UpdateStatus 'available' "Nova versão $publishedText encontrada. Preparando o download…"

  $updates = Join-Path $env:LOCALAPPDATA 'GTB2\updates'
  New-Item -ItemType Directory -Path $updates -Force | Out-Null
  $destination = Join-Path $updates $expectedName
  $valid = (Test-Path -LiteralPath $destination -PathType Leaf) -and
    ((Get-Item -LiteralPath $destination).Length -eq [long]$asset.size) -and
    ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $expectedHash)
  if (-not $valid) {
    Send-UpdateStatus 'downloading' "Baixando a versão $publishedText. Aguarde…"
    $temporary = Join-Path $updates "$expectedName.download"
    try {
      Invoke-WebRequest -Uri $expectedUrl -OutFile $temporary -TimeoutSec 300 -Headers @{ 'User-Agent' = 'GTB2-Updater' }
      Send-UpdateStatus 'verifying' 'Conferindo a integridade do arquivo baixado…'
      if ((Get-Item -LiteralPath $temporary).Length -ne [long]$asset.size -or
        (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'O instalador baixado não passou na verificação SHA-256.'
      }
      Move-Item -LiteralPath $temporary -Destination $destination -Force
    } finally {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }

  Send-UpdateStatus 'installing' "Instalando a versão $publishedText. Não feche o computador…"
  Write-UpdateLog "Instalando versão $publishedText verificada (SHA-256 $expectedHash)."
  $installer = Start-Process -FilePath $destination -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  if ($installer.ExitCode -ne 0) { throw "Instalador retornou código $($installer.ExitCode)." }
  $installedText = (Get-Content -LiteralPath $versionFile -Raw).Trim()
  if ($installedText -ne $publishedText) { throw "A instalação não confirmou a versão $publishedText." }
  Write-UpdateLog "Versão $publishedText instalada."
  Send-UpdateStatus 'complete' "Versao $publishedText instalada. Reiniciando o sistema..."
  if ($Restart) {
    $previousNoBrowser = $env:GTB_NO_BROWSER
    $env:GTB_NO_BROWSER = '1'
    try {
      Start-Process -FilePath (Join-Path $PSScriptRoot 'GTB2-Local.exe') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    } finally {
      $env:GTB_NO_BROWSER = $previousNoBrowser
    }
  }
} catch {
  Write-UpdateLog "Falha na atualização: $($_.Exception.Message)"
  if ($CheckOnly) { throw }
  Send-UpdateStatus 'failed' "Falha na atualizacao: $($_.Exception.Message)"
}
