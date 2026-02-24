/**
 * Genera el SQL del schema de Prisma para el instalador desktop
 * Ejecutar después de prisma generate
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'prisma', 'schema.sql');

console.log('📋 Generando SQL del schema de Prisma...');

try {
  // Usar prisma migrate diff para generar SQL desde cero
  // Esto genera el SQL necesario para crear todas las tablas
  const sql = execSync(
    'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
    { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
  );
  
  fs.writeFileSync(outputPath, sql);
  console.log('✅ SQL generado en:', outputPath);
  console.log(`   Tamaño: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  
} catch (error) {
  console.error('❌ Error generando SQL:', error.message);
  
  // Alternativa: intentar con db push --force-reset en una BD temporal
  console.log('   Intentando método alternativo...');
  
  // Crear un SQL básico de fallback
  const fallbackSql = `-- Schema generado para MarketPOS
-- Ejecutar migraciones manualmente si este archivo está vacío
-- npx prisma db push
`;
  fs.writeFileSync(outputPath, fallbackSql);
  console.log('⚠️ SQL de fallback creado');
}
