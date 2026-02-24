; Custom NSIS installer script for Monterrial POS
; Installs Visual C++ Redistributable if not present

!macro customInit
  ; Check if VC++ Runtime DLL exists
  IfFileExists "$SYSDIR\vcruntime140.dll" VCAlreadyInstalled
  
  ; VC++ Runtime not found, install it
  DetailPrint "Instalando Visual C++ Redistributable..."
  SetOutPath "$PLUGINSDIR"
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
  
  ; Run silent install using ExecWait
  ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart'
  DetailPrint "VC++ Redistributable instalacion completada"
  Goto VCInstallDone
  
  VCAlreadyInstalled:
    DetailPrint "Visual C++ Redistributable ya esta presente"
  
  VCInstallDone:
!macroend

!macro customInstall
  DetailPrint "Configurando Monterrial POS..."
!macroend

!macro customUnInstall
  DetailPrint "Limpiando Monterrial POS..."
!macroend
