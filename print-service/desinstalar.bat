@echo off
echo ============================================
echo   MarketPOS Print Service - Desinstalador
echo ============================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\MarketPOS-Print"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

:: Detener el servicio
echo Deteniendo servicio...
taskkill /F /IM MarketPOS-Print.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Eliminar acceso directo de inicio
echo Eliminando inicio automatico...
del "%STARTUP%\MarketPOS-Print.lnk" >nul 2>&1

:: Eliminar archivos
echo Eliminando archivos...
rmdir /S /Q "%INSTALL_DIR%" >nul 2>&1

echo.
echo ============================================
echo   Desinstalacion completada!
echo ============================================
echo.
pause
