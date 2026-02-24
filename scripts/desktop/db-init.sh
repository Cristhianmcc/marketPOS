#!/bin/bash
# ============================================================================
# MarketPOS Desktop - Inicialización de Base de Datos Local (Linux/Mac)
# ============================================================================
# Ejecutar como: ./scripts/desktop/db-init.sh
# Requiere: PostgreSQL instalado y corriendo
# ============================================================================

set -e

# Configuración
DB_NAME="${DB_NAME:-marketpos_desktop}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
SKIP_SEED="${SKIP_SEED:-false}"
RESET="${RESET:-false}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

info() { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${MAGENTA}============================================${NC}"
echo -e "${MAGENTA}  MarketPOS Desktop - DB Init (Linux/Mac)${NC}"
echo -e "${MAGENTA}============================================${NC}"
echo ""

# ============================================================================
# 1. Verificar PostgreSQL instalado
# ============================================================================
info "Verificando instalación de PostgreSQL..."

if ! command -v psql &> /dev/null; then
    error "PostgreSQL no encontrado.
    
Instala PostgreSQL:
  - macOS:   brew install postgresql@15
  - Ubuntu:  sudo apt install postgresql
  - Fedora:  sudo dnf install postgresql-server"
fi

success "PostgreSQL encontrado: $(which psql)"

# ============================================================================
# 2. Verificar servicio corriendo
# ============================================================================
info "Verificando servicio PostgreSQL..."

# macOS (Homebrew)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! brew services list | grep -q "postgresql.*started"; then
        warn "PostgreSQL no corriendo. Intentando iniciar..."
        brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
        sleep 3
    fi
fi

# Linux (systemd)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if ! systemctl is-active --quiet postgresql 2>/dev/null; then
        warn "PostgreSQL no corriendo. Intentando iniciar..."
        sudo systemctl start postgresql || true
        sleep 3
    fi
fi

# Verificar conexión
export PGPASSWORD="$DB_PASSWORD"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "SELECT 1" postgres &> /dev/null; then
    error "No se puede conectar a PostgreSQL en $DB_HOST:$DB_PORT
    
Verifica que PostgreSQL esté corriendo y las credenciales sean correctas.
Usuario: $DB_USER"
fi

success "Conexión a PostgreSQL exitosa"

# ============================================================================
# 3. Crear/Reset base de datos
# ============================================================================
if [ "$RESET" = "true" ]; then
    warn "RESET: Eliminando base de datos existente..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME" postgres 2>/dev/null || true
fi

info "Verificando base de datos '$DB_NAME'..."

DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres 2>/dev/null)

if [ "$DB_EXISTS" = "1" ]; then
    success "Base de datos '$DB_NAME' ya existe"
else
    info "Creando base de datos '$DB_NAME'..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME" postgres
    success "Base de datos '$DB_NAME' creada"
fi

# ============================================================================
# 4. Configurar .env.desktop
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
ENV_DESKTOP="$PROJECT_ROOT/.env.desktop"
ENV_DESKTOP_EXAMPLE="$PROJECT_ROOT/.env.desktop.example"

if [ ! -f "$ENV_DESKTOP" ]; then
    if [ -f "$ENV_DESKTOP_EXAMPLE" ]; then
        info "Creando .env.desktop desde .env.desktop.example..."
        cp "$ENV_DESKTOP_EXAMPLE" "$ENV_DESKTOP"
        
        # Actualizar DATABASE_URL
        NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        sed -i.bak "s|DATABASE_URL=\"[^\"]*\"|DATABASE_URL=\"$NEW_DB_URL\"|g" "$ENV_DESKTOP"
        sed -i.bak "s|DIRECT_URL=\"[^\"]*\"|DIRECT_URL=\"$NEW_DB_URL\"|g" "$ENV_DESKTOP"
        rm -f "$ENV_DESKTOP.bak"
        
        success ".env.desktop creado"
    else
        warn ".env.desktop.example no encontrado. Creando .env.desktop básico..."
        cat > "$ENV_DESKTOP" << EOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
DIRECT_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
SESSION_SECRET="desktop-local-secret-key-change-in-production-32chars"
NODE_ENV="production"
DESKTOP_MODE="1"
EOF
        success ".env.desktop creado"
    fi
fi

# ============================================================================
# 5. Ejecutar Prisma migrate deploy
# ============================================================================
info "Ejecutando migraciones de Prisma..."

cd "$PROJECT_ROOT"

# Exportar variables de .env.desktop
set -a
source .env.desktop
set +a

npx prisma migrate deploy
success "Migraciones aplicadas"

# ============================================================================
# 6. Ejecutar seed (opcional)
# ============================================================================
if [ "$SKIP_SEED" != "true" ]; then
    info "Ejecutando seed de datos iniciales..."
    if npx prisma db seed; then
        success "Seed completado"
    else
        warn "Seed falló (puede que ya existan datos)"
    fi
else
    info "Saltando seed (SKIP_SEED=true)"
fi

# ============================================================================
# RESUMEN
# ============================================================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Base de Datos Local Lista!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Host:     $DB_HOST:$DB_PORT"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo ""
echo -e "  ${YELLOW}Siguiente paso:${NC}"
echo -e "    ${CYAN}npm run desktop:dev${NC}"
echo ""
