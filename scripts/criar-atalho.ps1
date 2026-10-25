param(
  [string]$Destination = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $root 'dist\GTB2-Local.exe'
if (-not (Test-Path -LiteralPath $target)) {
  throw 'Executável ausente. Execute scripts\build-windows.ps1 primeiro.'
}
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
  throw "Pasta do atalho não encontrada: $Destination"
}

$shortcutPath = Join-Path $Destination 'Análise Criminal GTB 2.0.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = Split-Path -Parent $target
$shortcut.IconLocation = "$target,0"
$shortcut.Description = 'Análise Criminal GTB 2.0 — sistema local'
$shortcut.Save()

Write-Output $shortcutPath
