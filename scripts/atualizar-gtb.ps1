param([switch]$CheckOnly, [switch]$EmitStatus, [switch]$AllowRunning, [switch]$Restart, [string]$StatusFile = '')

$ErrorActionPreference = 'Stop'
$versionFile = Join-Path $PSScriptRoot 'version.txt'
$logFile = Join-Path $env:LOCALAPPDATA 'GTB2\logs\updates.log'

function Write-UpdateLog([string]$Message) {
  $directory = Split-Path $logFile -Parent
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
}

function Send-UpdateStatus([string]$Phase, [string]$Message, [int]$Progress = -1) {
  $report = @{ phase = $Phase; message = $Message }
  if ($Progress -ge 0) { $report.progress = [Math]::Min(100, $Progress) }
  if ($StatusFile) {
    $status = $report | ConvertTo-Json -Compress
    $temporaryStatus = "$StatusFile.tmp"
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
      try {
        [System.IO.File]::WriteAllText($temporaryStatus, $status, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryStatus -Destination $StatusFile -Force
        break
      } catch {
        if ($attempt -eq 4) { throw }
        Start-Sleep -Milliseconds 50
      }
    }
  }
  if ($EmitStatus) {
    Write-Output ([pscustomobject]@{ Type = 'GTB.UpdateStatus'; Phase = $Phase; Message = $Message;
        Progress = $(if ($Progress -ge 0) { $report.progress } else { $null }) })
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
    Send-UpdateStatus 'downloading' "Baixando a versão ${publishedText}: 0%." 0
    $temporary = Join-Path $updates "$expectedName.download"
    try {
      Add-Type -AssemblyName System.Net.Http
      $client = [System.Net.Http.HttpClient]::new()
      $client.Timeout = [TimeSpan]::FromMinutes(5)
      $client.DefaultRequestHeaders.UserAgent.ParseAdd('GTB2-Updater')
      $deadline = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromMinutes(5))
      $response = $null
      $inputStream = $null
      $outputStream = $null
      $sha = $null
      try {
        $response = $client.GetAsync($expectedUrl, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead,
          $deadline.Token).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode() | Out-Null
        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::Create,
          [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $buffer = New-Object byte[] (1024 * 1024)
        $received = [long]0
        $lastPercent = 0
        while (($count = $inputStream.ReadAsync($buffer, 0, $buffer.Length,
            $deadline.Token).GetAwaiter().GetResult()) -gt 0) {
          $outputStream.Write($buffer, 0, $count)
          [void]$sha.TransformBlock($buffer, 0, $count, $buffer, 0)
          $received += $count
          if ($received -gt [long]$asset.size) { throw 'O download excedeu o tamanho publicado.' }
          $percent = [int][Math]::Floor(100 * $received / [long]$asset.size)
          if ($percent -ge $lastPercent + 5 -or $percent -eq 100) {
            $lastPercent = $percent
            Send-UpdateStatus 'downloading' "Baixando a versão ${publishedText}: ${percent}%." $percent
          }
        }
        [void]$sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
        $downloadHash = [BitConverter]::ToString($sha.Hash).Replace('-', '')
      } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        if ($client) { $client.Dispose() }
        if ($deadline) { $deadline.Dispose() }
        if ($sha) { $sha.Dispose() }
      }
      Send-UpdateStatus 'verifying' 'Conferindo a integridade do arquivo baixado…'
      if ($received -ne [long]$asset.size -or $downloadHash -ne $expectedHash) {
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
