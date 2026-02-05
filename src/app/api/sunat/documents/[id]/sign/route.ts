// POST /api/sunat/documents/:id/sign
// Firma el XML UBL con certificado digital
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { buildPayloadFromDocument } from '@/lib/sunat/buildPayloadFromDocument';
import { generateInvoiceXML } from '@/lib/sunat/ubl/invoice';
import { loadCertificate, CertificateError } from '@/lib/sunat/cert/loadCertificate';
import { signXml, calculateXmlHash, SignatureError } from '@/lib/sunat/sign/signXmlCrypto';
import { SunatError } from '@/lib/sunat/types';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { auditSunatXmlSigned } from '@/domain/sunat/audit';
import { isSuperAdmin } from '@/lib/superadmin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id: documentId } = await params;

    // Leer parámetros opcionales
    const body = await request.json().catch(() => ({}));
    const { force = false } = body; // force: permitir re-firmar (solo SUPERADMIN)

    // 2. Verificar que el documento existe
    const document = await prisma.electronicDocument.findUnique({
      where: { id: documentId },
      include: {
        store: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento electrónico no encontrado' },
        { status: 404 }
      );
    }

    // 3. Verificar permisos
    if (user.role === 'CASHIER') {
      return NextResponse.json(
        { error: 'No tienes permisos para firmar XML. Solo SUPERADMIN y OWNER.' },
        { status: 403 }
      );
    }

    if (user.role === 'OWNER' && document.storeId !== user.storeId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      );
    }

    // 4. Verificar feature flag
    const sunatEnabled = await isFeatureEnabled(document.storeId, 'ENABLE_SUNAT');
    if (!sunatEnabled) {
      return NextResponse.json(
        { 
          error: 'La facturación electrónica SUNAT está deshabilitada',
          code: 'FEATURE_DISABLED'
        },
        { status: 403 }
      );
    }

    // 5. Verificar si ya está firmado
    if (document.status === 'SIGNED' && !force) {
      return NextResponse.json(
        { 
          error: 'El documento ya está firmado. Use force=true para re-firmar (solo SUPERADMIN).',
          code: 'ALREADY_SIGNED'
        },
        { status: 409 }
      );
    }

    // 6. Si force=true, verificar que sea SUPERADMIN
    if (force && !isSuperAdmin(user.email)) {
      return NextResponse.json(
        { error: 'Solo SUPERADMIN puede re-firmar documentos' },
        { status: 403 }
      );
    }

    // 7. Generar o recuperar el XML sin firma
    let unsignedXml: string;
    
    // Primero intentar recuperar del documento (si ya fue generado)
    // Por ahora siempre generamos nuevo
    const payload = await buildPayloadFromDocument(prisma, documentId);

    if (document.docType === 'FACTURA' || document.docType === 'BOLETA') {
      unsignedXml = generateInvoiceXML(payload, documentId);
    } else {
      return NextResponse.json(
        { 
          error: `Tipo de documento ${document.docType} aún no soportado para firma`,
          code: 'UNSUPPORTED_DOC_TYPE'
        },
        { status: 400 }
      );
    }

    // 8. Cargar el certificado digital
    let cert;
    try {
      cert = await loadCertificate(prisma, document.storeId);
    } catch (error) {
      if (error instanceof CertificateError) {
        return NextResponse.json(
          { 
            error: error.message,
            code: error.code
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // 9. Firmar el XML
    let signedResult;
    try {
      signedResult = signXml(unsignedXml, cert, documentId);
    } catch (error) {
      if (error instanceof SignatureError) {
        return NextResponse.json(
          { 
            error: error.message,
            code: error.code
          },
          { status: 500 }
        );
      }
      throw error;
    }

    // 10. Calcular el hash del XML firmado
    const hash = calculateXmlHash(signedResult.signedXml);

    // 11. Actualizar el documento en la DB
    const updatedDocument = await prisma.electronicDocument.update({
      where: { id: documentId },
      data: {
        status: 'SIGNED',
        xmlSigned: signedResult.signedXml,
        hash,
      },
    });

    // 12. Auditar éxito
    await auditSunatXmlSigned({
      storeId: document.storeId,
      userId: user.userId,
      documentId,
      docType: document.docType,
      fullNumber: document.fullNumber,
      success: true,
      hash,
      digestValue: signedResult.digestValue,
      force,
    });

    // 13. Devolver respuesta
    const isDev = process.env.NODE_ENV === 'development';
    
    return NextResponse.json({
      success: true,
      documentId: updatedDocument.id,
      fullNumber: updatedDocument.fullNumber,
      docType: updatedDocument.docType,
      status: updatedDocument.status,
      hash,
      digestValue: signedResult.digestValue,
      ...(isDev && { 
        xmlPreview: signedResult.signedXml.substring(0, 500) + '...',
        xmlLength: signedResult.signedXml.length
      }),
    });

  } catch (error) {
    console.error('Error al firmar XML:', error);

    if (error instanceof SunatError || error instanceof CertificateError || error instanceof SignatureError) {
      return NextResponse.json(
        { 
          error: error.message,
          code: (error as any).code
        },
        { status: (error as any).statusCode || 500 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Error interno al firmar XML',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
