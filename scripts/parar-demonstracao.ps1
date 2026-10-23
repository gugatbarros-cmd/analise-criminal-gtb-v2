$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $projectRoot 'data\demo\processos.json'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Output 'Nenhuma demonstração registrada.'
    exit 0
}

$saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
foreach ($entry in @(@{ id = $saved.api; started = $saved.apiStarted; name = 'python' },
                     @{ id = $saved.web; started = $saved.webStarted; name = 'node' })) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.Ticks -eq $entry.started -and
        $process.ProcessName -like "$($entry.name)*") {
        Stop-Process -Id $entry.id
    }
}
Remove-Item -LiteralPath $pidFile
Write-Output 'Demonstração encerrada.'
