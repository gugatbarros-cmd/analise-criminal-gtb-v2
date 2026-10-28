param([switch]$RemoveData)

$ErrorActionPreference = 'Stop'
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\GTB2'
$shortcutName = 'An' + [char]0x00E1 + 'lise Criminal GTB 2.0.lnk'
foreach ($destination in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))) {
  $shortcut = Join-Path $destination $shortcutName
  if (Test-Path -LiteralPath $shortcut -PathType Leaf) { Remove-Item -LiteralPath $shortcut -Force }
  $stopShortcut = Join-Path $destination 'Encerrar GTB 2.0.lnk'
  if (Test-Path -LiteralPath $stopShortcut -PathType Leaf) { Remove-Item -LiteralPath $stopShortcut -Force }
}
if ($RemoveData) {
  throw 'A remoção de dados exige backup e confirmação manual; o desinstalador não apaga bases automaticamente.'
}
Write-Output "Atalhos removidos. Feche o GTB e remova a pasta $installDirectory para concluir."
Write-Output "Os dados foram preservados em $env:LOCALAPPDATA\GTB2\data."
