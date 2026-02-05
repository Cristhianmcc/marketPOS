// Verificar el certificado actual
const fs = require('fs');
const forge = require('node-forge');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Cargar configuración desde SunatSettings
  const settings = await p.sunatSettings.findFirst({
    select: {
      certPfxBase64: true,
      certPassword: true,
    }
  });
  
  if (!settings?.certPfxBase64) {
    console.log('❌ No hay certificado configurado');
    await p.$disconnect();
    return;
  }
  
  console.log('📄 Analizando certificado...\n');
  
  try {
    // Decodificar el PFX
    const pfxDer = forge.util.decode64(settings.certPfxBase64);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, settings.certPassword || '');
    
    // Extraer certificados
    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];
    
    if (!certBag || certBag.length === 0) {
      console.log('❌ No se encontró certificado en el PFX');
      await p.$disconnect();
      return;
    }
    
    const cert = certBag[0].cert;
    
    console.log('📋 INFORMACIÓN DEL CERTIFICADO:');
    console.log('   Subject:', cert.subject.getField('CN')?.value || '(sin CN)');
    console.log('   Issuer:', cert.issuer.getField('CN')?.value || '(sin CN)');
    console.log('   Serial:', cert.serialNumber);
    console.log('   Valid From:', cert.validity.notBefore);
    console.log('   Valid To:', cert.validity.notAfter);
    
    // Verificar si está expirado
    const now = new Date();
    if (now > cert.validity.notAfter) {
      console.log('\n⚠️  CERTIFICADO EXPIRADO');
    } else if (now < cert.validity.notBefore) {
      console.log('\n⚠️  CERTIFICADO AÚN NO VÁLIDO');
    } else {
      console.log('\n✅ Certificado vigente');
    }
    
    // Verificar key usage
    const keyUsage = cert.getExtension('keyUsage');
    if (keyUsage) {
      console.log('\n🔑 Key Usage:');
      console.log('   Digital Signature:', keyUsage.digitalSignature ? '✅' : '❌');
      console.log('   Non Repudiation:', keyUsage.nonRepudiation ? '✅' : '❌');
      console.log('   Key Encipherment:', keyUsage.keyEncipherment ? '✅' : '❌');
    } else {
      console.log('\n⚠️  Sin extensión Key Usage');
    }
    
    // Verificar si es autofirmado
    const subjectCN = cert.subject.getField('CN')?.value || '';
    const issuerCN = cert.issuer.getField('CN')?.value || '';
    
    if (subjectCN === issuerCN) {
      console.log('\n⚠️  CERTIFICADO AUTOFIRMADO (self-signed)');
      console.log('   SUNAT requiere un certificado emitido por una CA autorizada');
    } else {
      console.log('\n✅ Certificado emitido por CA:', issuerCN);
    }
    
    // Verificar clave privada
    const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    
    if (keyBag && keyBag.length > 0) {
      console.log('\n✅ Clave privada encontrada');
    } else {
      console.log('\n❌ Sin clave privada');
    }
    
  } catch (error) {
    console.log('❌ Error al analizar certificado:', error.message);
  }
  
  await p.$disconnect();
}

main();
