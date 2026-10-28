param([switch]$NoLaunch)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceExecutable = Join-Path $projectRoot 'dist\GTB2-Local.exe'
$sourceLauncher = Join-Path $PSScriptRoot 'iniciar-gtb.ps1'
$sourceUninstaller = Join-Path $PSScriptRoot 'desinstalar-gtb.ps1'
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\GTB2'
$installedExecutable = Join-Path $installDirectory 'GTB2-Local.exe'
$installedLauncher = Join-Path $installDirectory 'iniciar-gtb.ps1'

if (-not (Test-Path -LiteralPath $sourceExecutable -PathType Leaf)) {
  throw "Executável ausente: $sourceExecutable. Execute scripts\build-windows.ps1 primeiro."
}
if (-not (Test-Path -LiteralPath $sourceLauncher -PathType Leaf)) {
  throw "Inicializador ausente: $sourceLauncher"
}

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 1
  if ($health.status -eq 'ok') {
    throw 'O GTB 2.0 está aberto. Feche a janela do sistema antes de instalar ou atualizar.'
  }
} catch {
  if ($_.Exception.Message -like 'O GTB 2.0 está aberto*') { throw }
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourceExecutable -Destination $installedExecutable -Force
Copy-Item -LiteralPath $sourceLauncher -Destination $installedLauncher -Force
Copy-Item -LiteralPath $sourceUninstaller -Destination (Join-Path $installDirectory 'desinstalar-gtb.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'encerrar-gtb.ps1') -Destination (Join-Path $installDirectory 'encerrar-gtb.ps1') -Force

$shortcutName = 'An' + [char]0x00E1 + 'lise Criminal GTB 2.0.lnk'
$destinations = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))
$shell = New-Object -ComObject WScript.Shell
foreach ($destination in $destinations) {
  if (-not (Test-Path -LiteralPath $destination -PathType Container)) { continue }
  $shortcut = $shell.CreateShortcut((Join-Path $destination $shortcutName))
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installedLauncher`""
  $shortcut.WorkingDirectory = $installDirectory
  $shortcut.IconLocation = "$installedExecutable,0"
  $shortcut.Description = 'Análise Criminal GTB 2.0 - sistema local'
  $shortcut.Save()
  $stopShortcut = $shell.CreateShortcut((Join-Path $destination 'Encerrar GTB 2.0.lnk'))
  $stopShortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $stopShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $installDirectory 'encerrar-gtb.ps1')`""
  $stopShortcut.WorkingDirectory = $installDirectory
  $stopShortcut.IconLocation = "$installedExecutable,0"
  $stopShortcut.Save()
}

Write-Output "GTB 2.0 instalado em $installDirectory"
Write-Output "Os dados permanecem em $env:LOCALAPPDATA\GTB2\data e não são removidos em atualizações."
if (-not $NoLaunch) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $installedLauncher
  if ($LASTEXITCODE -ne 0) { throw 'O programa foi instalado, mas não iniciou corretamente.' }
}
