@echo off
echo ============================================
echo   MarketPOS Print Service - Instalador
echo ============================================
echo.

:: Crear carpeta de instalación
set "INSTALL_DIR=%LOCALAPPDATA%\MarketPOS-Print"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copiar el exe al destino
echo Copiando archivos...
copy /Y "%~dp0MarketPOS-Print.exe" "%INSTALL_DIR%\MarketPOS-Print.exe" >nul

:: Crear el script VBS para ejecución sin ventana
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\start-hidden.vbs"
echo WshShell.Run """" ^& "%INSTALL_DIR%\MarketPOS-Print.exe" ^& """", 0, False >> "%INSTALL_DIR%\start-hidden.vbs"

:: Crear acceso directo en Inicio de Windows (auto-arranque)
echo Configurando inicio automatico...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP%\MarketPOS-Print.lnk'); $s.TargetPath = '%INSTALL_DIR%\start-hidden.vbs'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'MarketPOS Print Service'; $s.Save()"

:: Iniciar el servicio ahora
echo Iniciando servicio...
taskkill /F /IM MarketPOS-Print.exe >nul 2>&1
timeout /t 2 /nobreak >nul
start "" wscript.exe "%INSTALL_DIR%\start-hidden.vbs"

echo.
echo ============================================
echo   Instalacion completada!
echo.
echo   - Se instalo en: %INSTALL_DIR%
echo   - Arranca automaticamente con Windows
echo   - Ya esta corriendo en segundo plano
echo.
echo   Para desinstalar, ejecute desinstalar.bat
echo ============================================
echo.
pause
