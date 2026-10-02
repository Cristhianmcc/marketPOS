@echo off
set "ELECTRON_RUN_AS_NODE="
start "" "%~dp0Monterrial POS SUNAT Beta.exe" --sunat-beta-isolated --no-sandbox --disable-gpu --enable-logging --user-data-dir="%APPDATA%\monterrial-pos-sunat-beta\isolated-test"
