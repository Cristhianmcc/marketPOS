@echo off
cd /d "%~dp0"
set LOG=%~dp0build-log-20260926.txt
echo Generando instalador Monterrial POS (Supabase)... > "%LOG%"
echo Inicio: %date% %time% >> "%LOG%"

rem Conservar el instalador anterior de dist-electron (27/03) renombrando la carpeta
if exist "desktop\dist-electron" ren "desktop\dist-electron" "dist-electron-20260327-anterior" >> "%LOG%" 2>&1

echo.
echo Generando instalador. Tarda varios minutos. NO CIERRES esta ventana.
echo El avance se guarda en build-log-20260926.txt
echo.
call npm run desktop:build >> "%LOG%" 2>&1
echo CODIGO_SALIDA=%errorlevel% >> "%LOG%"
echo Fin: %date% %time% >> "%LOG%"
echo.
echo ===== TERMINADO. Puedes cerrar esta ventana. =====
pause
