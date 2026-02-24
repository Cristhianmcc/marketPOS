@echo off
echo ======================================
echo Construyendo Monterrial POS Installer
echo ======================================
echo.

cd /d "%~dp0"

echo Limpiando builds anteriores...
del /f /q "dist-electron\Monterrial POS-Setup-0.1.0.exe" 2>nul
del /f /q "dist-electron\*.blockmap" 2>nul
del /f /q "dist-electron\*.nsis.7z" 2>nul

echo Configurando variables...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set NODE_ENV=production

echo.
echo [1/3] Preparando archivos de build...
call node scripts/prepare-build.js
if errorlevel 1 (
    echo ERROR en prepare-build
    pause
    exit /b 1
)

echo.
echo [2/3] Compilando TypeScript...
call npx tsc
if errorlevel 1 (
    echo ERROR en TypeScript
    pause
    exit /b 1
)

echo.
echo [3/3] Creando instalador...
echo (Esto puede tomar 5-10 minutos, NO CIERRES esta ventana)
echo.
call npx electron-builder --win --x64
echo Ejecutando electron-builder...
echo (Esto puede tomar 3-5 minutos, NO CIERRES esta ventana)
echo.

call npx electron-builder --win --x64

echo.
echo ======================================
if exist "dist-electron\Monterrial POS-Setup-0.1.0.exe" (
    echo EXITO! Instalador creado:
    dir "dist-electron\Monterrial POS-Setup-0.1.0.exe"
    echo.
    echo El instalador incluye VC++ Redistributable
) else (
    echo ERROR: No se creo el instalador
    echo Revisa los mensajes de error arriba
)
echo ======================================
echo.
pause
