@echo off
set "ELECTRON_RUN_AS_NODE="
start "" "%~dp0Monterrial POS SUNAT Beta.exe" --no-sandbox --disable-gpu --user-data-dir="%LOCALAPPDATA%\MonterrialPOS-SUNAT-Beta-Electron"
