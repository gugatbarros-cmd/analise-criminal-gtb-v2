$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
$viteExe = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
$demoDir = Join-Path $projectRoot 'data\demo'
$pidFile = Join-Path $demoDir 'processos.json'

if (-not (Test-Path -LiteralPath $pythonExe) -or -not (Test-Path -LiteralPath $viteExe)) {
    throw 'Instale as dependências com scripts\testar.cmd antes de iniciar a demonstração.'
}

function Test-DemoReady {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $page = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
        return ($health.mode -eq 'demo' -and $page.StatusCode -eq 200)
    } catch {
        return $false
    }
}

if (Test-Path -LiteralPath $pidFile) {
    $old = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $apiProcess = Get-Process -Id $old.api -ErrorAction SilentlyContinue | Where-Object { $_.StartTime.Ticks -eq $old.apiStarted }
    $webProcess = Get-Process -Id $old.web -ErrorAction SilentlyContinue | Where-Object { $_.StartTime.Ticks -eq $old.webStarted }
    if ($apiProcess -and $webProcess -and (Test-DemoReady)) {
        Write-Output 'Demonstração já ativa: http://127.0.0.1:5173/'
        exit 0
    }
    if ($apiProcess -or $webProcess) {
        throw 'Há processos antigos registrados. Execute scripts\parar-demonstracao.ps1 para verificar antes de reiniciar.'
    }
    Remove-Item -LiteralPath $pidFile
}

foreach ($port in 8000, 5173) {
    if (Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "A porta $port já está ocupada. A demonstração não foi iniciada."
    }
}

& $pythonExe (Join-Path $PSScriptRoot 'seed-demo.py')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao carregar dados sintéticos.' }

$oldDataDir = $env:GTB_DATA_DIR
$oldDemoMode = $env:GTB_DEMO_MODE
$api = $null
$web = $null
try {
    $env:GTB_DATA_DIR = $demoDir
    $env:GTB_DEMO_MODE = '1'
    $api = Start-Process -FilePath $pythonExe -ArgumentList '-m', 'uvicorn', 'gtb.api.main:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $web = Start-Process -FilePath 'node.exe' -ArgumentList ('"' + $viteExe + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort' -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-DemoReady) { $ready = $true; break }
        if ($api.HasExited -or $web.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'A API ou a interface não iniciou corretamente.' }
    @{ api = $api.Id; apiStarted = $api.StartTime.Ticks; web = $web.Id; webStarted = $web.StartTime.Ticks } |
        ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
    Write-Output 'Demonstração pronta: http://127.0.0.1:5173/'
} catch {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -ErrorAction SilentlyContinue }
    if ($web -and -not $web.HasExited) { Stop-Process -Id $web.Id -ErrorAction SilentlyContinue }
    throw
} finally {
    $env:GTB_DATA_DIR = $oldDataDir
    $env:GTB_DEMO_MODE = $oldDemoMode
}
