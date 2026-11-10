param(
  [string]$UpdaterPath = (Join-Path $PSScriptRoot 'atualizar-gtb.ps1'),
  [switch]$NoWindow
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $UpdaterPath -PathType Leaf)) { return }

$form = $null
$label = $null
$job = $null
$lastPhase = ''

try {
  if (-not $NoWindow) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Atualização do GTB 2.0'
    $form.Width = 430
    $form.Height = 145
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ControlBox = $false
    $form.TopMost = $true
    $form.BackColor = [System.Drawing.Color]::White

    $label = New-Object System.Windows.Forms.Label
    $label.Left = 20
    $label.Top = 18
    $label.Width = 380
    $label.Height = 38
    $label.Text = 'Verificando se existe uma nova versão…'
    $label.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $form.Controls.Add($label)

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Left = 20
    $progress.Top = 68
    $progress.Width = 380
    $progress.Height = 18
    $progress.Style = 'Marquee'
    $progress.MarqueeAnimationSpeed = 24
    $form.Controls.Add($progress)
    $form.Show()
  }

  $job = Start-Job -ScriptBlock {
    param($scriptPath)
    & $scriptPath -EmitStatus
  } -ArgumentList $UpdaterPath

  do {
    foreach ($item in @(Receive-Job -Job $job -ErrorAction SilentlyContinue)) {
      if ($item.Type -ne 'GTB.UpdateStatus') { continue }
      $lastPhase = [string]$item.Phase
      if ($NoWindow) {
        Write-Output $item
      } else {
        $label.Text = [string]$item.Message
      }
    }
    if (-not $NoWindow) { [System.Windows.Forms.Application]::DoEvents() }
    if ($job.State -notin @('Running', 'NotStarted')) { break }
    Start-Sleep -Milliseconds 150
  } while ($true)

  if ($job.State -eq 'Failed' -and $lastPhase -ne 'failed') {
    if ($NoWindow) {
      Write-Output ([pscustomobject]@{ Type = 'GTB.UpdateStatus'; Phase = 'failed';
          Message = 'Não foi possível verificar a atualização. Abrindo a versão instalada…' })
    } else {
      $label.Text = 'Não foi possível verificar a atualização. Abrindo a versão instalada…'
      $lastPhase = 'failed'
    }
  }
  if (-not $NoWindow -and $lastPhase -in @('complete', 'failed')) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 1200
  }
} catch {
  if (-not $job) {
    & $UpdaterPath
  } elseif ($job.State -in @('Running', 'NotStarted')) {
    Wait-Job -Job $job | Out-Null
  }
} finally {
  if ($job) { Remove-Job -Job $job -Force -ErrorAction SilentlyContinue }
  if ($form) { $form.Close(); $form.Dispose() }
}
