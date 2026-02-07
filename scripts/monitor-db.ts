#!/usr/bin/env node
/**
 * Script de Monitoreo de Base de Datos
 * Verifica estado de conexiones, uso de storage, y performance
 * 
 * Uso:
 *   npm run db:monitor
 *   node scripts/monitor-db.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ConnectionStats {
  activeConnections: number;
  maxConnections: number;
  availableConnections: number;
}

interface DatabaseSize {
  totalSize: string;
  tableStats: Array<{
    table: string;
    rows: number;
    size: string;
  }>;
}

interface PerformanceStats {
  cacheHitRatio: number;
  avgQueryTime: number;
  slowQueries: number;
}

async function getConnectionStats(): Promise<ConnectionStats> {
  const result = await prisma.$queryRaw<Array<{
    active_connections: bigint;
    max_connections: number;
    available_connections: bigint;
  }>>`
    SELECT 
      count(*) as active_connections,
      (SELECT setting::int FROM pg_settings WHERE name='max_connections') as max_connections,
      (SELECT setting::int FROM pg_settings WHERE name='max_connections') - count(*) as available_connections
    FROM pg_stat_activity
    WHERE state = 'active';
  `;

  return {
    activeConnections: Number(result[0].active_connections),
    maxConnections: result[0].max_connections,
    availableConnections: Number(result[0].available_connections),
  };
}

async function getDatabaseSize(): Promise<DatabaseSize> {
  // Tamaño total de la base de datos
  const totalSizeResult = await prisma.$queryRaw<Array<{ size: string }>>`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size;
  `;

  // Estadísticas por tabla
  const tableStatsResult = await prisma.$queryRaw<Array<{
    tablename: string;
    row_count: bigint;
    size: string;
  }>>`
    SELECT 
      schemaname || '.' || tablename as tablename,
      n_live_tup as row_count,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    LIMIT 15;
  `;

  return {
    totalSize: totalSizeResult[0].size,
    tableStats: tableStatsResult.map(row => ({
      table: row.tablename,
      rows: Number(row.row_count),
      size: row.size,
    })),
  };
}

async function getPerformanceStats(): Promise<PerformanceStats> {
  // Cache hit ratio (debe ser > 90% para buen performance)
  const cacheResult = await prisma.$queryRaw<Array<{
    cache_hit_ratio: number;
  }>>`
    SELECT 
      round((sum(blks_hit) * 100.0 / NULLIF(sum(blks_hit) + sum(blks_read), 0)), 2) as cache_hit_ratio
    FROM pg_stat_database
    WHERE datname = current_database();
  `;

  // Queries lentas (> 500ms)
  const slowQueriesResult = await prisma.$queryRaw<Array<{
    count: bigint;
  }>>`
    SELECT count(*) as count
    FROM pg_stat_statements
    WHERE mean_exec_time > 500
    LIMIT 1;
  `;

  // Tiempo promedio de queries
  const avgTimeResult = await prisma.$queryRaw<Array<{
    avg_time: number;
  }>>`
    SELECT round(avg(mean_exec_time)::numeric, 2) as avg_time
    FROM pg_stat_statements
    LIMIT 1;
  `;

  return {
    cacheHitRatio: cacheResult[0]?.cache_hit_ratio || 0,
    avgQueryTime: avgTimeResult[0]?.avg_time || 0,
    slowQueries: Number(slowQueriesResult[0]?.count || 0),
  };
}

function displayResults(
  connections: ConnectionStats,
  dbSize: DatabaseSize,
  performance: PerformanceStats
) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 MARKET POS - DATABASE MONITORING REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Conexiones
  console.log('🔌 CONEXIONES:');
  console.log(`   Activas:      ${connections.activeConnections} / ${connections.maxConnections}`);
  console.log(`   Disponibles:  ${connections.availableConnections}`);
  
  const connectionUsage = (connections.activeConnections / connections.maxConnections) * 100;
  const connectionStatus = connectionUsage > 80 ? '🔴' : connectionUsage > 60 ? '🟡' : '🟢';
  console.log(`   Uso:          ${connectionStatus} ${connectionUsage.toFixed(1)}%`);
  
  if (connectionUsage > 80) {
    console.log('   ⚠️  ALERTA: Uso de conexiones alto. Considera agregar PgBouncer.');
  }

  // Almacenamiento
  console.log('\n💾 ALMACENAMIENTO:');
  console.log(`   Tamaño Total: ${dbSize.totalSize}`);
  console.log('\n   Top 10 Tablas:');
  dbSize.tableStats.slice(0, 10).forEach((table, i) => {
    console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${table.table.padEnd(35, ' ')} ${table.rows.toLocaleString().padStart(10, ' ')} rows  ${table.size.padStart(10, ' ')}`);
  });

  // Performance
  console.log('\n⚡ PERFORMANCE:');
  console.log(`   Cache Hit Ratio:     ${performance.cacheHitRatio.toFixed(2)}%`);
  const cacheStatus = performance.cacheHitRatio > 90 ? '🟢' : performance.cacheHitRatio > 80 ? '🟡' : '🔴';
  console.log(`   Estado:              ${cacheStatus} ${performance.cacheHitRatio > 90 ? 'Excelente' : performance.cacheHitRatio > 80 ? 'Bueno' : 'Necesita optimización'}`);
  
  console.log(`   Tiempo Prom. Query:  ${performance.avgQueryTime.toFixed(2)}ms`);
  console.log(`   Queries Lentas:      ${performance.slowQueries}`);

  if (performance.cacheHitRatio < 80) {
    console.log('   ⚠️  ALERTA: Cache hit ratio bajo. Considera aumentar shared_buffers.');
  }

  if (performance.slowQueries > 100) {
    console.log('   ⚠️  ALERTA: Muchas queries lentas. Revisa índices y queries.');
  }

  // Recomendaciones
  console.log('\n📋 RECOMENDACIONES:');
  
  const recommendations: string[] = [];
  
  if (connectionUsage > 80) {
    recommendations.push('- Implementar PgBouncer para pooling avanzado');
    recommendations.push('- Reducir connection_limit por instancia');
  }
  
  if (performance.cacheHitRatio < 90) {
    recommendations.push('- Aumentar shared_buffers en PostgreSQL');
    recommendations.push('- Aumentar work_mem para queries complejas');
  }
  
  if (performance.slowQueries > 50) {
    recommendations.push('- Revisar y optimizar queries lentas');
    recommendations.push('- Agregar índices faltantes');
  }

  if (recommendations.length === 0) {
    console.log('   ✅ Todo está funcionando correctamente');
  } else {
    recommendations.forEach(rec => console.log(`   ${rec}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    console.log('🔍 Recopilando estadísticas de la base de datos...\n');

    const [connections, dbSize, performance] = await Promise.all([
      getConnectionStats(),
      getDatabaseSize(),
      getPerformanceStats().catch(() => ({
        cacheHitRatio: 0,
        avgQueryTime: 0,
        slowQueries: 0,
      })),
    ]);

    displayResults(connections, dbSize, performance);

  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('pg_stat_statements')) {
        console.log('\n💡 Tip: Para ver estadísticas de performance, habilita pg_stat_statements:');
        console.log('   1. Conectar a PostgreSQL como superusuario');
        console.log('   2. Ejecutar: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
      }
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
