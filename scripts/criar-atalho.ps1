param(
  [string]$Destination = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $root 'dist\GTB2-Local.exe'
$launcher = Join-Path $root 'scripts\iniciar-gtb.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw 'Executável ausente. Execute scripts\build-windows.ps1 primeiro.'
}
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Inicializador ausente: $launcher"
}
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
  throw "Pasta do atalho não encontrada: $Destination"
}

$shortcutName = 'An' + [char]0x00E1 + 'lise Criminal GTB 2.0.lnk'
$shortcutPath = Join-Path $Destination $shortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$target,0"
$shortcut.Description = 'Analise Criminal GTB 2.0 - sistema local'
$shortcut.Save()

Write-Output $shortcutPath
