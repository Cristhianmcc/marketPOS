#!/bin/bash
# start.sh - Script de inicio para producción

echo "🚀 Iniciando Market POS..."

# 1. Generar Prisma Client
echo "📦 Generando Prisma Client..."
npx prisma generate

# 2. Aplicar migraciones pendientes
echo "🗃️  Aplicando migraciones..."
npx prisma migrate deploy

# 3. Verificar estado
echo "✅ Verificando estado de migraciones..."
npx prisma migrate status

# 4. Iniciar servidor
echo "🌐 Iniciando servidor Next.js..."
npm start
