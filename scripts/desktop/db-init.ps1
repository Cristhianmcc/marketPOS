# ============================================================================
# MarketPOS Desktop - Inicialización de Base de Datos Local (Windows)
# ============================================================================
# Ejecutar como: .\scripts\desktop\db-init.ps1
# Requiere: PostgreSQL instalado y corriendo
# ============================================================================

param(
    [switch]$SkipSeed,
    [switch]$Reset,
    [string]$DbName = "marketpos_desktop",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "postgres",
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 5432
)

$ErrorActionPreference = "Stop"

# Colores para output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  MarketPOS Desktop - DB Init (Windows)" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

# ============================================================================
# 1. Verificar PostgreSQL instalado
# ============================================================================
Write-Info "Verificando instalacion de PostgreSQL..."

$psqlPath = $null

# Buscar en PATH
$psqlInPath = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlInPath) {
    $psqlPath = $psqlInPath.Source
}

# Buscar en ubicaciones comunes
if (-not $psqlPath) {
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe",
        "$env:LOCALAPPDATA\Programs\PostgreSQL\16\bin\psql.exe",
        "$env:LOCALAPPDATA\Programs\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $psqlPath = $path
            break
        }
    }
}

if (-not $psqlPath) {
    Write-Error "PostgreSQL no encontrado."
    Write-Host ""
    Write-Host "Instala PostgreSQL desde:" -ForegroundColor Yellow
    Write-Host "  https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host ""
    Write-Host "O usa Chocolatey:" -ForegroundColor Yellow
    Write-Host "  choco install postgresql16" -ForegroundColor White
    exit 1
}

Write-Success "PostgreSQL encontrado: $psqlPath"

# ============================================================================
# 2. Verificar servicio corriendo
# ============================================================================
Write-Info "Verificando servicio PostgreSQL..."

$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($pgService) {
    if ($pgService.Status -ne "Running") {
        Write-Warning "Servicio PostgreSQL detenido. Intentando iniciar..."
        Start-Service $pgService.Name
        Start-Sleep -Seconds 3
    }
    Write-Success "Servicio PostgreSQL corriendo"
} else {
    # Intentar conexion directa
    Write-Warning "No se encontro servicio. Verificando conexion directa..."
}

# Verificar conexion
$env:PGPASSWORD = $DbPassword
$testConnection = & $psqlPath -h $DbHost -p $DbPort -U $DbUser -c "SELECT 1" postgres 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "No se puede conectar a PostgreSQL"
    Write-Host "Verifica que PostgreSQL este corriendo en $DbHost`:$DbPort" -ForegroundColor Yellow
    Write-Host "Usuario: $DbUser" -ForegroundColor Yellow
    exit 1
}
Write-Success "Conexion a PostgreSQL exitosa"

# ============================================================================
# 3. Crear/Reset base de datos
# ============================================================================
if ($Reset) {
    Write-Warning "RESET: Eliminando base de datos existente..."
    & $psqlPath -h $DbHost -p $DbPort -U $DbUser -c "DROP DATABASE IF EXISTS $DbName" postgres 2>&1 | Out-Null
}

Write-Info "Verificando base de datos '$DbName'..."

$dbExists = & $psqlPath -h $DbHost -p $DbPort -U $DbUser -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" postgres 2>&1
if ($dbExists -eq "1") {
    Write-Success "Base de datos '$DbName' ya existe"
} else {
    Write-Info "Creando base de datos '$DbName'..."
    & $psqlPath -h $DbHost -p $DbPort -U $DbUser -c "CREATE DATABASE $DbName" postgres 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Error creando base de datos"
        exit 1
    }
    Write-Success "Base de datos '$DbName' creada"
}

# ============================================================================
# 4. Configurar .env.desktop
# ============================================================================
$envDesktopPath = Join-Path $PSScriptRoot "..\..\env.desktop"
$envDesktopExamplePath = Join-Path $PSScriptRoot "..\..\.env.desktop.example"

if (-not (Test-Path $envDesktopPath)) {
    if (Test-Path $envDesktopExamplePath) {
        Write-Info "Creando .env.desktop desde .env.desktop.example..."
        Copy-Item $envDesktopExamplePath $envDesktopPath
        
        # Actualizar DATABASE_URL con los parametros actuales
        $content = Get-Content $envDesktopPath -Raw
        $newDbUrl = "postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/${DbName}"
        $content = $content -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$newDbUrl`""
        $content = $content -replace 'DIRECT_URL="[^"]*"', "DIRECT_URL=`"$newDbUrl`""
        Set-Content $envDesktopPath $content
        
        Write-Success ".env.desktop creado"
    } else {
        Write-Warning ".env.desktop.example no encontrado. Creando .env.desktop basico..."
        $envContent = @"
DATABASE_URL="postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/${DbName}"
DIRECT_URL="postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/${DbName}"
SESSION_SECRET="desktop-local-secret-key-change-in-production-32chars"
NODE_ENV="production"
DESKTOP_MODE="1"
"@
        Set-Content $envDesktopPath $envContent
        Write-Success ".env.desktop creado"
    }
}

# ============================================================================
# 5. Ejecutar Prisma migrate deploy
# ============================================================================
Write-Info "Ejecutando migraciones de Prisma..."

$projectRoot = Join-Path $PSScriptRoot "..\.."
Push-Location $projectRoot

# Usar .env.desktop
$env:DOTENV_CONFIG_PATH = ".env.desktop"

try {
    # Cargar variables de entorno
    $envDesktop = Get-Content ".env.desktop" | Where-Object { $_ -match "=" -and $_ -notmatch "^#" }
    foreach ($line in $envDesktop) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    
    # Ejecutar migrate deploy
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Error en migraciones"
        Pop-Location
        exit 1
    }
    Write-Success "Migraciones aplicadas"
    
    # ============================================================================
    # 6. Ejecutar seed (opcional)
    # ============================================================================
    if (-not $SkipSeed) {
        Write-Info "Ejecutando seed de datos iniciales..."
        npx prisma db seed
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Seed fallo (puede que ya existan datos)"
        } else {
            Write-Success "Seed completado"
        }
    } else {
        Write-Info "Saltando seed (-SkipSeed)"
    }
} finally {
    Pop-Location
}

# ============================================================================
# RESUMEN
# ============================================================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Base de Datos Local Lista!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Host:     $DbHost`:$DbPort" -ForegroundColor White
Write-Host "  Database: $DbName" -ForegroundColor White
Write-Host "  User:     $DbUser" -ForegroundColor White
Write-Host ""
Write-Host "  Siguiente paso:" -ForegroundColor Yellow
Write-Host "    npm run desktop:dev" -ForegroundColor Cyan
Write-Host ""
