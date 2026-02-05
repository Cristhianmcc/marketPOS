// Modo DESARROLLO: Omitir validación de SUNAT para testing
// Este script modifica temporalmente el worker para simular éxito

const fs = require('fs');
const path = require('path');

// Archivo a modificar
const workerPath = path.join(__dirname, '../src/worker/sunatWorker.ts');

// Leer el archivo actual
let content = fs.readFileSync(workerPath, 'utf8');

// Buscar si ya está en modo desarrollo
if (content.includes('// MODO DESARROLLO ACTIVO')) {
  console.log('✅ Ya está en MODO DESARROLLO');
  return;
}

// Agregar el modo desarrollo al inicio del procesamiento
const insertPoint = 'try {\n      console.log(`[SUNAT] Usando credenciales SOL:`, { solUserMasked, source });';

const devMode = `try {
      console.log(\`[SUNAT] Usando credenciales SOL:\`, { solUserMasked, source });
      
      // MODO DESARROLLO ACTIVO - Simular respuesta exitosa de SUNAT
      if (process.env.NODE_ENV === 'development' || process.env.SUNAT_DEV_MODE === 'true') {
        console.log('🧪 MODO DESARROLLO: Simulando respuesta exitosa de SUNAT');
        
        // Simular respuesta exitosa
        await prisma.electronicDocument.update({
          where: { id: job.documentId },
          data: {
            status: 'ACCEPTED',
            sunatCode: '0',
            sunatMessage: 'La Factura numero F001-00000001, ha sido aceptada (MODO DESARROLLO)',
            sunatTicket: \`DEV-\${Date.now()}\`,
            sunatResponseAt: new Date(),
          }
        });
        
        // Marcar job como completado
        await prisma.sunatJob.update({
          where: { id: job.id },
          data: { 
            status: 'DONE',
            result: { 
              success: true, 
              message: 'Aceptado en modo desarrollo',
              code: '0' 
            },
            completedAt: new Date()
          }
        });
        
        console.log('✅ Documento procesado exitosamente (MODO DESARROLLO)');
        return;
      }
      
      console.log(\`[SUNAT] Usando credenciales SOL:\`, { solUserMasked, source });`;

// Reemplazar
const modifiedContent = content.replace(insertPoint, devMode);

// Guardar
fs.writeFileSync(workerPath, modifiedContent);

console.log('🧪 MODO DESARROLLO activado');
console.log('📋 Para activar:');
console.log('   Set SUNAT_DEV_MODE=true');
console.log('   O set NODE_ENV=development');
console.log('');
console.log('⚠️  Para DESACTIVAR ejecuta: node scripts/disable-dev-mode.js');