/**
 * Script para configurar el certificado PFX real en SUNAT settings
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const p = new PrismaClient();

async function main() {
  const pfxPath = path.join(__dirname, '..', 'certificado.pfx');
  const pfxPassword = 'a';
  
  // Verificar que existe el archivo
  if (!fs.existsSync(pfxPath)) {
    console.error('❌ No se encontró certificado.pfx');
    process.exit(1);
  }
  
  console.log('📄 Leyendo certificado.pfx...');
  const pfxBuffer = fs.readFileSync(pfxPath);
  const pfxBase64 = pfxBuffer.toString('base64');
  
  console.log(`   Tamaño: ${pfxBuffer.length} bytes`);
  console.log(`   Base64: ${pfxBase64.length} caracteres`);
  
  // Actualizar en la base de datos
  console.log('\n🔧 Actualizando configuración SUNAT...');
  
  const result = await p.sunatSettings.updateMany({
    data: {
      certPfxBase64: pfxBase64,
      certPassword: pfxPassword,
    }
  });
  
  console.log(`✅ Certificado configurado en ${result.count} tienda(s)`);
  
  // Verificar
  const settings = await p.sunatSettings.findFirst({
    include: { store: { select: { name: true, ruc: true } } }
  });
  
  console.log('\n📋 Configuración final:');
  console.log(`   Tienda: ${settings?.store?.name}`);
  console.log(`   RUC: ${settings?.store?.ruc}`);
  console.log(`   Certificado: ${settings?.certPfxBase64 ? '✅ Configurado (' + settings.certPfxBase64.length + ' chars)' : '❌'}`);
  console.log(`   Contraseña cert: ${settings?.certPassword ? '✅' : '❌'}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
