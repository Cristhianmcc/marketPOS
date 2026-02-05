// Verificar si el RUC cumple requisitos para CDT gratuito de SUNAT
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('🏛️  CDT GRATUITO DE SUNAT - Verificación de Requisitos\n');
  
  // Obtener configuración
  const settings = await p.sunatSettings.findFirst();
  const ruc = settings?.ruc;
  
  if (!ruc) {
    console.log('❌ No hay RUC configurado');
    await p.$disconnect();
    return;
  }
  
  console.log('📋 RUC a verificar:', ruc);
  console.log('');
  
  console.log('✅ REQUISITOS PARA CDT GRATUITO:');
  console.log('');
  console.log('1. 🏢 RUC activo y habido');
  console.log('   Tu RUC:', ruc);
  console.log('   Status: Verifica en sunat.gob.pe');
  console.log('');
  
  console.log('2. 📊 Afecto a renta tercera categoría');
  console.log('   Verifica en tu ficha RUC');
  console.log('');
  
  console.log('3. 💰 Ingresos ≤ S/1.26M anuales (o empresa nueva)');
  console.log('   Para empresas nuevas: automáticamente califica');
  console.log('');
  
  console.log('4. 🚫 NO inscrito como OSE o PSE');
  console.log('   Si emites tus propios comprobantes: ✅');
  console.log('');
  
  console.log('5. 📄 Sin CDT vigente ni más de 2 CDT anteriores');
  console.log('   Si es tu primera vez: ✅');
  console.log('');
  
  console.log('🔗 PASOS PARA OBTENER CDT GRATUITO:');
  console.log('');
  console.log('1. Ve a: https://www.sunat.gob.pe/');
  console.log('2. Empresas → Comprobantes de Pago');
  console.log('3. Certificado Digital Tributario');
  console.log('4. Click en "Solicitar CDT"');
  console.log('5. Inicia sesión con tu Clave SOL:', settings?.solUser || '(configurar)');
  console.log('6. Llena el formulario');
  console.log('7. Si cumples requisitos: aprobación inmediata');
  console.log('8. Descárgalo del buzón electrónico');
  console.log('');
  
  console.log('📦 DESPUÉS DE OBTENER EL CDT:');
  console.log('');
  console.log('1. Copia el archivo .pfx a la raíz del proyecto');
  console.log('2. Ejecuta: node scripts/setup-certificate.js');
  console.log('3. ¡Todo funcionará!');
  console.log('');
  
  console.log('⚡ VENTAJAS DEL CDT GRATUITO:');
  console.log('   • Reconocido oficialmente por SUNAT');
  console.log('   • Renovación gratuita');
  console.log('   • Soporte oficial');
  console.log('   • Integración directa');
  
  await p.$disconnect();
}

main();