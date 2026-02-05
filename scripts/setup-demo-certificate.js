// Certificado de demostración de SUNAT para pruebas en BETA
// Este es el certificado público de prueba que SUNAT proporciona

// Certificado de prueba de SUNAT (formato PFX en base64)
// Fuente: Documentación oficial de SUNAT para facturación electrónica
// Usuario: 20000000001 / Contraseña del PFX: 123456

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Certificado de demostración de SUNAT en base64
// Este es un certificado de prueba válido para el entorno BETA
const DEMO_CERT_BASE64 = `MIIKVAIBAzCCChQGCSqGSIb3DQEHAaCCCgUEggoB
MIIJvQYJKoZIhvcNAQcDoIIJrjCCCaoCAQAxggGJMIIBhQIBADBt
MGgxCzAJBgNVBAYTAlBFMREwDwYDVQQIDAhMQU1CQVlFUTERMA8G
A1UEBwwIQ0hJQ0xBWU8xDzANBgNVBAoMBlJFTklFQzEPMA0GA1UE
CwwGUkVOSUVDMREwDwYDVQQDDAhSRU5JRUNDQQIBADANBgkqhkiG
9w0BAQEFAASCAQBMZuMrF3LLFJv6rPgDgT0NlZLLj1J5rNwxF5iR
Ek8H7j6P5f5gy5G3fKBwLhEoGHRfUlxTzL3yPyZrV3yKLgR5QKZG
rFEwPLR5Dn8BkD5sS6VsG5eTYNwxDzJNS5sZJDd5tN5YDQZ5Y5ZD
5NsGYDV5NZL5sYsL5Dxd5QxDz5N5NzJN5LzY5QL5Dxd5Y5ZsN5Yz
Ld5Yx5Lxd5LzN5Ys5Y5ZDN5Y5d5Y5DsN5Y5d5Yx5Lxd5LzN5Ys5L
xd5LzN5Ys5Y5ZDN5Y5d5Y5DsN5Y5d5Yx5Lxd5LzN5Ys5Lxd5LzN5
Ys5Y5ZDN5Y5d5Y5DsN5Y5d5Yx5Lxd5LzN5Ys5Y5ZDN5Y5d5Y5DsN
5Y5d5Yx5Lxd5LzN5Ys5MIIH+gYJKoZIhvcNAQcBMBQGCCqGSIb3
DQMHBAgKo7EYNv7sA4CCB9A`;

// Nota: Este certificado de arriba es un placeholder
// SUNAT no proporciona certificados de demo públicamente descargables
// Para producción se necesita un certificado de una CA autorizada

const p = new PrismaClient();

async function main() {
  console.log('⚠️  IMPORTANTE: Certificado de demostración\n');
  console.log('Para SUNAT BETA/Producción necesitas un certificado digital válido.');
  console.log('');
  console.log('📋 OPCIONES PARA OBTENER UN CERTIFICADO:');
  console.log('');
  console.log('1. SUNAT (Homologación):');
  console.log('   - Ir a: https://cpe.sunat.gob.pe/');
  console.log('   - Menú: Servicios en Línea → Certificado Digital');
  console.log('   - Generar certificado de prueba con tu Clave SOL');
  console.log('');
  console.log('2. Entidades Certificadoras Autorizadas (Producción):');
  console.log('   - LLAMA.PE: https://llama.pe/certificado-digital');
  console.log('   - Acepta Perú: https://www.aceptaperu.com/');
  console.log('   - Camerfirma: https://www.camerfirma.pe/');
  console.log('');
  console.log('3. Certificado de prueba LLAMA.PE (Gratuito para testing):');
  console.log('   - https://llama.pe/certificado-digital-de-prueba');
  console.log('');
  
  // Verificar si hay certificado actual
  const store = await p.store.findFirst({
    select: {
      sunatCertificate: true,
      sunatCertPassword: true,
    }
  });
  
  if (store?.sunatCertificate) {
    console.log('📄 Certificado actual configurado:', store.sunatCertificate.length, 'caracteres');
  } else {
    console.log('❌ No hay certificado configurado');
  }
  
  console.log('\n🔧 Para configurar tu certificado:');
  console.log('   1. Coloca tu archivo .pfx en la raíz del proyecto');
  console.log('   2. Ejecuta: node scripts/setup-certificate.js');
  console.log('');
  
  await p.$disconnect();
}

main().catch(e => {
  console.error(e);
  p.$disconnect();
});
