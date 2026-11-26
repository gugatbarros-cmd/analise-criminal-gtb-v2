param([switch]$CheckOnly, [switch]$EmitStatus, [switch]$AllowRunning, [switch]$Restart, [string]$StatusFile = '',
  [switch]$DownloadOnly,
  [string]$ReleaseApi = 'https://api.github.com/repos/gugatbarros-cmd/analise-criminal-gtb-v2/releases/latest',
  [string]$DownloadBase = 'https://github.com/gugatbarros-cmd/analise-criminal-gtb-v2/releases/download',
  [string]$UpdatesDirectory = '',
  [int]$StallSeconds = 60, [int]$DownloadAttempts = 5, [int]$RetryDelaySeconds = 10)

$ErrorActionPreference = 'Stop'
$versionFile = Join-Path $PSScriptRoot 'version.txt'
$logFile = Join-Path $env:LOCALAPPDATA 'GTB2\logs\updates.log'
if (-not $UpdatesDirectory) { $UpdatesDirectory = Join-Path $env:LOCALAPPDATA 'GTB2\updates' }

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

# Baixa para "$Temporary", retomando de onde parou (cabeçalho Range) quando a conexão cai.
# Só desiste quando nenhum dado chega por $StallSeconds em $DownloadAttempts tentativas seguidas.
function Receive-Installer([string]$Url, [string]$Temporary, [long]$ExpectedSize, [string]$Version) {
  Add-Type -AssemblyName System.Net.Http
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $true
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan
  $client.DefaultRequestHeaders.UserAgent.ParseAdd('GTB2-Updater')
  $failures = 0
  $lastPercent = -5
  try {
    while ($true) {
      $received = [long]0
      if (Test-Path -LiteralPath $Temporary -PathType Leaf) { $received = (Get-Item -LiteralPath $Temporary).Length }
      if ($received -gt $ExpectedSize) {
        Remove-Item -LiteralPath $Temporary -Force
        $received = 0
      }
      if ($received -eq $ExpectedSize) { return }
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Url)
      if ($received -gt 0) { $request.Headers.Range = [System.Net.Http.Headers.RangeHeaderValue]::new($received, $null) }
      $watchdog = [System.Threading.CancellationTokenSource]::new()
      $response = $null
      $inputStream = $null
      $outputStream = $null
      $progressed = $false
      try {
        $watchdog.CancelAfter([TimeSpan]::FromSeconds($StallSeconds))
        $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead,
          $watchdog.Token).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode() | Out-Null
        if ($received -gt 0 -and [int]$response.StatusCode -ne 206) {
          # O servidor ignorou a retomada: recomeça do início.
          $received = 0
          $mode = [System.IO.FileMode]::Create
        } else {
          $mode = if ($received -gt 0) { [System.IO.FileMode]::Append } else { [System.IO.FileMode]::Create }
        }
        if ($received -gt 0) { Write-UpdateLog "Retomando o download da versão $Version a partir de $received bytes." }
        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [System.IO.File]::Open($Temporary, $mode, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $buffer = New-Object byte[] (256 * 1024)
        while ($true) {
          $watchdog.CancelAfter([TimeSpan]::FromSeconds($StallSeconds))
          $count = $inputStream.ReadAsync($buffer, 0, $buffer.Length, $watchdog.Token).GetAwaiter().GetResult()
          if ($count -le 0) { break }
          $outputStream.Write($buffer, 0, $count)
          $received += $count
          $progressed = $true
          if ($received -gt $ExpectedSize) { throw 'O download excedeu o tamanho publicado.' }
          $percent = [int][Math]::Floor(100 * $received / $ExpectedSize)
          if ($percent -ge $lastPercent + 5 -or $percent -eq 100) {
            $lastPercent = $percent
            Send-UpdateStatus 'downloading' "Baixando a versão ${Version}: ${percent}%." $percent
          }
        }
      } catch {
        if ($_.Exception.Message -like '*excedeu o tamanho*') { throw }
        Write-UpdateLog "Download da versão $Version interrompido em $received bytes: $($_.Exception.Message)"
      } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        $request.Dispose()
        $watchdog.Dispose()
      }
      if ($received -eq $ExpectedSize) { return }
      if ($progressed) { $failures = 0 } else { $failures++ }
      if ($failures -ge $DownloadAttempts) {
        throw "O download não avançou após $DownloadAttempts tentativas. A parte já baixada será aproveitada na próxima tentativa."
      }
      Send-UpdateStatus 'downloading' "Conexão interrompida. Retomando o download da versão $Version…" $lastPercent
      Start-Sleep -Seconds $RetryDelaySeconds
    }
  } finally {
    $client.Dispose()
  }
}

$updateLock = $null
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

  # Um único atualizador por vez: outro em andamento continua e este encerra sem alterar o estado.
  New-Item -ItemType Directory -Path $UpdatesDirectory -Force | Out-Null
  try {
    $updateLock = [System.IO.File]::Open((Join-Path $UpdatesDirectory 'atualizacao.lock'), [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch {
    Write-UpdateLog 'Outra atualização já está em andamento; esta chamada foi ignorada.'
    if ($CheckOnly) { throw 'Outra atualização já está em andamento.' }
    return
  }

  Send-UpdateStatus 'checking' 'Verificando se existe uma nova versão…'
  $release = Invoke-RestMethod -Uri $ReleaseApi -TimeoutSec 15 -Headers @{ 'User-Agent' = 'GTB2-Updater' }
  if ($release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw 'Versão da publicação inválida.' }
  $publishedText = $Matches[1]
  if ([version]$publishedText -le $current) {
    Send-UpdateStatus 'ready' "Versão $currentText atualizada. Abrindo o sistema…"
    return
  }

  $expectedName = "GTB2-Instalador-$publishedText.exe"
  $asset = @($release.assets | Where-Object { $_.name -eq $expectedName }) | Select-Object -First 1
  if (-not $asset) { throw "Instalador $publishedText ainda indisponível." }
  $expectedUrl = "$DownloadBase/v$publishedText/$expectedName"
  if ($asset.browser_download_url -cne $expectedUrl -or $asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') {
    throw 'Origem ou SHA-256 do instalador inválido.'
  }
  $expectedHash = $Matches[1].ToUpperInvariant()
  if ([long]$asset.size -le 0) { throw 'Tamanho do instalador inválido.' }
  if ($CheckOnly) { Write-Output $publishedText; return }

  Send-UpdateStatus 'available' "Nova versão $publishedText encontrada. Preparando o download…"

  $destination = Join-Path $UpdatesDirectory $expectedName
  $valid = (Test-Path -LiteralPath $destination -PathType Leaf) -and
    ((Get-Item -LiteralPath $destination).Length -eq [long]$asset.size) -and
    ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $expectedHash)
  if (-not $valid) {
    $temporary = Join-Path $UpdatesDirectory "$expectedName.download"
    Send-UpdateStatus 'downloading' "Baixando a versão ${publishedText}…" 0
    Receive-Installer $expectedUrl $temporary ([long]$asset.size) $publishedText
    Send-UpdateStatus 'verifying' 'Conferindo a integridade do arquivo baixado…'
    if ((Get-Item -LiteralPath $temporary).Length -ne [long]$asset.size -or
        (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $expectedHash) {
      # Arquivo completo mas corrompido: descarta para baixar de novo do zero.
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
      throw 'O instalador baixado não passou na verificação SHA-256.'
    }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
  }
  # Remove downloads parciais de versões antigas.
  Get-ChildItem -LiteralPath $UpdatesDirectory -Filter 'GTB2-Instalador-*.exe.download' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "$expectedName.download" } | Remove-Item -Force -ErrorAction SilentlyContinue
  if ($DownloadOnly) {
    Send-UpdateStatus 'ready' "Instalador $publishedText baixado e conferido."
    Write-Output $destination
    return
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
} finally {
  if ($updateLock) { $updateLock.Dispose() }
}
