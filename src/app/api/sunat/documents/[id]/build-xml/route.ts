// POST /api/sunat/documents/:id/build-xml
// Genera el XML UBL 2.1 desde el payload fiscal (sin firma)
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { buildPayloadFromDocument } from '@/lib/sunat/buildPayloadFromDocument';
import { generateInvoiceXML } from '@/lib/sunat/ubl/invoice';
import { SunatError } from '@/lib/sunat/types';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { auditSunatXmlBuilt } from '@/domain/sunat/audit';

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
        { error: 'No tienes permisos para generar XML. Solo SUPERADMIN y OWNER.' },
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

    // 5. Construir payload desde el documento
    const payload = await buildPayloadFromDocument(prisma, documentId);

    // 6. Generar XML según el tipo de documento
    let xml: string;
    
    if (document.docType === 'FACTURA' || document.docType === 'BOLETA') {
      xml = generateInvoiceXML(payload, documentId);
    } else {
      // TODO: Implementar NOTA_CREDITO y NOTA_DEBITO cuando sea necesario
      return NextResponse.json(
        { 
          error: `Tipo de documento ${document.docType} aún no soportado para generación XML`,
          code: 'UNSUPPORTED_DOC_TYPE'
        },
        { status: 400 }
      );
    }

    // 7. Actualizar el documento (opcional: guardar XML sin firma)
    // Por ahora solo actualizamos el status si estaba en DRAFT
    if (document.status === 'DRAFT') {
      await prisma.electronicDocument.update({
        where: { id: documentId },
        data: {
          status: 'PENDING', // Pendiente de firma
        },
      });
    }

    // 8. Devolver el XML
    // En producción, podrías devolver solo un mensaje de éxito
    const isDev = process.env.NODE_ENV === 'development';

    // Auditar éxito
    await auditSunatXmlBuilt({
      storeId: document.storeId,
      userId: user.userId,
      documentId,
      docType: document.docType,
      fullNumber: document.fullNumber,
      success: true,
      xmlLength: xml.length,
    });
    
    return NextResponse.json({
      success: true,
      documentId,
      fullNumber: document.fullNumber,
      docType: document.docType,
      status: 'PENDING',
      ...(isDev && { xml }), // Solo en desarrollo devolver el XML completo
      xmlLength: xml.length,
    });

  } catch (error) {
    console.error('Error al generar XML:', error);

    // Intentar auditar el error si tenemos los datos necesarios
    if (error instanceof SunatError) {
      // Aquí necesitaríamos tener acceso a document y user para auditar
      // Por simplicidad, solo devolvemos el error
      return NextResponse.json(
        { 
          error: error.message,
          code: error.code
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { 
        error: 'Error interno al generar XML',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
