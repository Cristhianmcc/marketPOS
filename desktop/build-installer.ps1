# Build Monterrial POS Installer
# Run this script directly with PowerShell

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Construyendo Monterrial POS Installer" -ForegroundColor Cyan  
Write-Host "(Con VC++ Redistributable incluido)" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

Write-Host "Directorio actual: $(Get-Location)" -ForegroundColor Yellow

# Clean cache
Write-Host "Limpiando cache..." -ForegroundColor Yellow
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache\nsis" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "dist-electron\*.nsis.7z" -Force -ErrorAction SilentlyContinue
Remove-Item "dist-electron\Monterrial POS-Setup-*.exe" -Force -ErrorAction SilentlyContinue

# Set environment
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Write-Host ""
Write-Host "Ejecutando electron-builder..." -ForegroundColor Green
Write-Host ""

# Run build
& "C:\Program Files\nodejs\npm.cmd" run build

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan

# Check result
$exeFile = Get-ChildItem "dist-electron\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exeFile) {
    Write-Host "EXITO! Instalador creado:" -ForegroundColor Green
    Write-Host "  $($exeFile.FullName)" -ForegroundColor White
    Write-Host "  Tamaño: $([math]::Round($exeFile.Length/1MB, 1)) MB" -ForegroundColor White
} else {
    Write-Host "ERROR: No se creó el archivo .exe" -ForegroundColor Red
    Write-Host "Revisar logs en dist-electron\" -ForegroundColor Yellow
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Presione Enter para salir"
