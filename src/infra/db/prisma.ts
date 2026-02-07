import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Cliente Prisma optimizado para múltiples tiendas (10+)
 * 
 * Connection Pooling:
 * - Los parámetros se configuran en DATABASE_URL (.env)
 * - connection_limit=10: Máximo 10 conexiones por instancia serverless
 * - pool_timeout=20: Espera 20s si todas las conexiones están ocupadas
 * - connect_timeout=10: Timeout de 10s al conectar inicialmente
 * 
 * Ejemplo DATABASE_URL:
 * postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20&connect_timeout=10
 * 
 * Para 10 tiendas con RDS Free Tier (100 conexiones max):
 * - 10 instancias serverless × 10 conexiones = 100 conexiones totales
 * - Cada request reutiliza conexiones del pool
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // ✅ MÓDULO 18.2: Query logging deshabilitado para mejor rendimiento
    // En desarrollo solo mostrar errores y warnings (no queries)
    log: process.env.NODE_ENV === 'development' 
      ? ['error', 'warn'] 
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Manejo de señales para cerrar conexiones limpiamente
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });

  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
