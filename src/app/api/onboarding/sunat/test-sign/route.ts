/**
 * MÓDULO 18.8 — POST /api/onboarding/sunat/test-sign
 * 
 * Prueba la firma XML con el certificado configurado.
 * Genera un XML dummy y lo firma para verificar que el certificado funciona.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    // 1. Feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json(
        { error: 'SUNAT no está habilitado' },
        { status: 403 }
      );
    }

    // 2. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede probar la firma' },
        { status: 403 }
      );
    }

    // 3. Obtener settings
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'Primero configura los datos de SUNAT', code: 'NO_SETTINGS' },
        { status: 409 }
      );
    }

    if (!settings.certPfxBase64 || !settings.certPassword) {
      return NextResponse.json(
        { error: 'Certificado no configurado', code: 'CERT_NOT_CONFIGURED' },
        { status: 409 }
      );
    }

    // 4. Intentar firmar un XML dummy
    try {
      // Importar los módulos de firma y certificado
      const { signXml } = await import('@/lib/sunat/sign/signXml');
      const { parsePfxCertificate } = await import('@/lib/sunat/cert/loadCertificate');
      
      // Parsear certificado
      const cert = parsePfxCertificate(settings.certPfxBase64!, settings.certPassword!);
      
      // XML dummy para prueba (incluye ext:ExtensionContent para la firma)
      const dummyXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent><!-- Signature placeholder --></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>TEST-00000001</cbc:ID>
</Invoice>`;

      const result = signXml(dummyXml, cert, 'TEST-00000001');

      // Verificar que se firmó (debe contener la firma)
      if (!result.signedXml || !result.signedXml.includes('<ds:Signature')) {
        throw new Error('La firma no se generó correctamente');
      }

      // 5. Marcar step como completado
      await prisma.sunatSettings.update({
        where: { id: settings.id },
        data: { stepTestSign: true },
      });

      // 6. Audit log
      await prisma.auditLog.create({
        data: {
          storeId: user.storeId!,
          userId: user.userId,
          action: 'SUNAT_ONBOARD_TEST_SIGN_SUCCESS',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'INFO',
          meta: {},
        },
      });

      return NextResponse.json({
        ok: true,
        message: 'Firma verificada correctamente',
        signatureFound: true,
      });

    } catch (signError: any) {
      // 7. Log de error (sin secretos)
      await prisma.auditLog.create({
        data: {
          storeId: user.storeId!,
          userId: user.userId,
          action: 'SUNAT_ONBOARD_TEST_SIGN_FAILED',
          entityType: 'SUNAT',
          entityId: settings.id,
          severity: 'WARN',
          meta: {
            error: signError.message,
          },
        },
      });

      return NextResponse.json(
        { 
          error: 'Error al firmar: ' + signError.message,
          code: 'CERT_INVALID',
          hint: 'Verifica que el certificado PFX y la contraseña sean correctos',
        },
        { status: 409 }
      );
    }

  } catch (error: any) {
    console.error('Error en POST /api/onboarding/sunat/test-sign:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
