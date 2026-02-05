// src/app/api/sunat/documents/[id]/payload/route.ts
// ✅ MÓDULO 18.2: Endpoint para obtener el payload fiscal de un documento
// GET /api/sunat/documents/:id/payload

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { buildPayloadFromDocument } from '@/lib/sunat/buildPayloadFromDocument';
import { SunatError } from '@/lib/sunat/types';
import { auditSunatPayloadBuilt } from '@/domain/sunat/audit';
import { getRequestMetadata } from '@/lib/auditLog';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verificar autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const isSuper = isSuperAdmin(user.email);

    // 2. Solo SUPERADMIN o OWNER pueden ver payloads
    if (!isSuper && user.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo OWNER o SUPERADMIN pueden ver payloads' },
        { status: 403 }
      );
    }

    const { id: documentId } = await params;

    // 3. Verificar que el documento existe y pertenece a la tienda del usuario
    const doc = await prisma.electronicDocument.findUnique({
      where: { id: documentId },
      select: { id: true, storeId: true, fullNumber: true, docType: true, saleId: true }
    });

    if (!doc) {
      return NextResponse.json(
        { code: 'DOCUMENT_NOT_FOUND', message: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    // OWNER solo puede ver documentos de su tienda
    if (!isSuper && doc.storeId !== user.storeId) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No autorizado' },
        { status: 403 }
      );
    }

    // 4. Construir payload
    const payload = await buildPayloadFromDocument(prisma, documentId);

    // 5. Auditar
    const { ip, userAgent } = getRequestMetadata(request);
    await auditSunatPayloadBuilt({
      storeId: doc.storeId,
      userId: user.userId,
      saleId: doc.saleId || documentId,
      docType: doc.docType,
      fullNumber: doc.fullNumber,
      success: true,
      itemCount: payload.items.length,
      total: payload.totals.total,
      ip: ip || undefined,
      userAgent: userAgent || undefined,
    });

    return NextResponse.json({
      payload,
    });

  } catch (error) {
    console.error('[SUNAT Payload] Error:', error);

    if (error instanceof SunatError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al construir payload' },
      { status: 500 }
    );
  }
}
