param([string]$ExecutablePath = (Join-Path $env:LOCALAPPDATA 'Programs\GTB2\GTB2-Local.exe'))

$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($ExecutablePath)
$processes = @(Get-CimInstance Win32_Process -Filter "Name = 'GTB2-Local.exe'" |
  Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [StringComparison]::OrdinalIgnoreCase) })
if ($processes.Count -eq 0) { exit 0 }

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 250
  $remaining = @(Get-CimInstance Win32_Process -Filter "Name = 'GTB2-Local.exe'" |
    Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [StringComparison]::OrdinalIgnoreCase) })
} while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)
if ($remaining.Count -gt 0) {
  Write-Error 'O GTB 2.0 continua aberto. Feche o sistema antes de instalar a atualização.'
  exit 1
}
exit 0
