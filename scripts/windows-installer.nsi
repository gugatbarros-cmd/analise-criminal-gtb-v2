Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "LogicLib.nsh"
!ifndef VERSION
!error "Defina VERSION ao compilar."
!endif
Name "Análise Criminal GTB 2.0"
!ifdef GTB_INSTALLER_TEST
OutFile "..\dist\GTB2-Instalador-Test-${VERSION}.exe"
!else
OutFile "..\dist\GTB2-Instalador-${VERSION}.exe"
!endif
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
!define MUI_ICON "..\desktop\brasao.ico"
!define MUI_UNICON "..\desktop\brasao.ico"
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
  InitPluginsDir
  File /oname=$PLUGINSDIR\encerrar-gtb.ps1 "encerrar-gtb.ps1"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\encerrar-gtb.ps1" -ExecutablePath "$INSTDIR\GTB2-Local.exe"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "O GTB 2.0 não pôde ser encerrado. Feche o programa e execute a instalação novamente."
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  SetOverwrite on
  IfFileExists "$INSTDIR\GTB2-Local.next.exe" 0 executable_stage
  ClearErrors
  Delete "$INSTDIR\GTB2-Local.next.exe"
  IfErrors executable_blocked
  executable_stage:
  File /oname=GTB2-Local.next.exe "..\dist\GTB2-Local.exe"
  Delete "$INSTDIR\GTB2-Local.previous.exe"
  IfFileExists "$INSTDIR\GTB2-Local.exe" 0 executable_swap
  ClearErrors
  Rename "$INSTDIR\GTB2-Local.exe" "$INSTDIR\GTB2-Local.previous.exe"
  IfErrors executable_blocked
  executable_swap:
  ClearErrors
  Rename "$INSTDIR\GTB2-Local.next.exe" "$INSTDIR\GTB2-Local.exe"
  IfErrors executable_restore
  Delete "$INSTDIR\GTB2-Local.previous.exe"
  Goto executable_ready
  executable_restore:
    IfFileExists "$INSTDIR\GTB2-Local.previous.exe" 0 executable_blocked
    Rename "$INSTDIR\GTB2-Local.previous.exe" "$INSTDIR\GTB2-Local.exe"
  executable_blocked:
    Delete "$INSTDIR\GTB2-Local.next.exe"
    MessageBox MB_ICONSTOP "O executável do GTB 2.0 está em uso ou não pôde ser substituído. A versão anterior foi preservada. Feche o programa e execute a instalação novamente."
    SetErrorLevel 1
    Abort
  executable_ready:
  File "atualizar-gtb.ps1"
  File "..\desktop\brasao.ico"
  File "iniciar-gtb.ps1"
  File "encerrar-gtb.ps1"
  File "..\README.md"
  FileOpen $1 "$INSTDIR\version.txt" w
  FileWrite $1 "${VERSION}"
  FileClose $1
  WriteUninstaller "$INSTDIR\Desinstalar-GTB2.exe"
  !ifndef GTB_INSTALLER_TEST
  CreateDirectory "$SMPROGRAMS\GTB 2.0"
  CreateShortCut "$DESKTOP\Análise Criminal GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\iniciar-gtb.ps1"' "$INSTDIR\brasao.ico"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Análise Criminal GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\iniciar-gtb.ps1"' "$INSTDIR\brasao.ico"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Encerrar GTB 2.0.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\encerrar-gtb.ps1"' "$INSTDIR\brasao.ico"
  CreateShortCut "$SMPROGRAMS\GTB 2.0\Desinstalar.lnk" "$INSTDIR\Desinstalar-GTB2.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayName" "Análise Criminal GTB 2.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "Publisher" "Projeto GTB"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "DisplayIcon" "$INSTDIR\brasao.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "UninstallString" '$\"$INSTDIR\Desinstalar-GTB2.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "QuietUninstallString" '$\"$INSTDIR\Desinstalar-GTB2.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2" "NoRepair" 1
  !endif
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
  Delete "$INSTDIR\GTB2-Local.next.exe"
  Delete "$INSTDIR\GTB2-Local.previous.exe"
  Delete "$INSTDIR\brasao.ico"
  Delete "$INSTDIR\iniciar-gtb.ps1"
  Delete "$INSTDIR\encerrar-gtb.ps1"
  Delete "$INSTDIR\atualizar-gtb.ps1"
  Delete "$INSTDIR\version.txt"
  Delete "$INSTDIR\desinstalar-gtb.ps1"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Desinstalar-GTB2.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GTB2"
SectionEnd
