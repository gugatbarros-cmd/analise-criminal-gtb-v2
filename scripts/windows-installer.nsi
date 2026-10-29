Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!ifndef VERSION
!error "Defina VERSION ao compilar."
!endif
Name "Análise Criminal GTB 2.0"
OutFile "..\dist\GTB2-Instalador-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\GTB2"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Análise Criminal GTB 2.0"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do sistema local GTB 2.0"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Projeto GTB"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o sistema completo neste usuário do Windows, cria atalhos e registra a desinstalação.$\r$\n$\r$\nAtualizações e desinstalações preservam as bases e as contas locais. Não é necessário instalar Python ou Node.js."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o sistema"
!define MUI_FINISHPAGE_RUN_FUNCTION Launch
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este sistema requer Windows 10 ou 11 de 64 bits."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Este sistema requer Windows 10 ou 11."
    Abort
  ${EndIf}
FunctionEnd

Section "Sistema completo" Main
  SetShellVarContext current
  SetRegView 64
  IfFileExists "$INSTDIR\encerrar-gtb.ps1" 0 +2
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\encerrar-gtb.ps1"' $0
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File "..\dist\GTB2-Local.exe"
  File "iniciar-gtb.ps1"
  File "encerrar-gtb.ps1"
  File "..\README.md"
  WriteUninstaller "$INSTDIR\Desinstalar-GTB2.exe"
  CreateDirectory "$SMPROGRAMS\GTB 2.0"
  CreateShortCut "$DESKTOP\Análise Criminal GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\iniciar-gtb.ps1"' "$INSTDIR\GTB2-Local.exe"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Análise Criminal GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\iniciar-gtb.ps1"' "$INSTDIR\GTB2-Local.exe"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Encerrar GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\encerrar-gtb.ps1"' "$INSTDIR\GTB2-Local.exe"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Desinstalar.lnk" "$INSTDIR\Desinstalar-GTB2.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayName" "Análise Criminal GTB 2.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "Publisher" "Projeto GTB"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayIcon" "$INSTDIR\GTB2-Local.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "UninstallString" '$\"$INSTDIR\Desinstalar-GTB2.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "QuietUninstallString" '$\"$INSTDIR\Desinstalar-GTB2.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "NoRepair" 1
SectionEnd

Function Launch
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\iniciar-gtb.ps1"'
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\encerrar-gtb.ps1"' $0
  Delete "$DESKTOP\Análise Criminal GTB 2.0.lnk"
  Delete "$DESKTOP\Encerrar GTB 2.0.lnk"
  Delete "$SMPROGRAMS\Análise Criminal GTB 2.0.lnk"
  Delete "$SMPROGRAMS\Encerrar GTB 2.0.lnk"
  Delete "$SMPROGRAMS\GTB 2.0\Análise Criminal GTB 2.0.lnk"
  Delete "$SMPROGRAMS\GTB 2.0\Encerrar GTB 2.0.lnk"
  Delete "$SMPROGRAMS\GTB 2.0\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\GTB 2.0"
  Delete "$INSTDIR\GTB2-Local.exe"
  Delete "$INSTDIR\iniciar-gtb.ps1"
  Delete "$INSTDIR\encerrar-gtb.ps1"
  Delete "$INSTDIR\desinstalar-gtb.ps1"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Desinstalar-GTB2.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2"
SectionEnd
