@echo off
setlocal

rem Compatibilidad: delega al flujo versionado y validado del repositorio.
cd /d "%~dp0.."
call npm run desktop:build
exit /b %ERRORLEVEL%
