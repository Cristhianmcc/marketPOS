// src/app/api/sunat/test-draft/route.ts
// ✅ MÓDULO 18.1: Endpoint de prueba para crear documentos electrónicos (SOLO SUPERADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { 
  createElectronicDocumentDraft, 
  auditSunatDocDraftCreated 
} from '@/domain/sunat';
import { z } from 'zod';

/**
 * POST /api/sunat/test-draft
 * 
 * Endpoint de prueba interno para crear documentos electrónicos en DRAFT
 * 
 * Auth: SUPERADMIN only
 * Feature Flag: No requiere ENABLE_SUNAT (es para testing)
 */

const TestDraftSchema = z.object({
  storeId: z.string().cuid(),
  docType: z.enum(['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO']),
  customer: z.object({
    docType: z.enum(['DNI', 'RUC', 'CE', 'PASSPORT', 'OTHER']),
    docNumber: z.string().min(1),
    name: z.string().min(1),
    address: z.string().optional(),
  }),
  totals: z.object({
    taxable: z.number().positive(),
    igv: z.number().nonnegative(),
    total: z.number().positive(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2. Solo SUPERADMIN
    const isSuper = await isSuperAdmin(user.email);
    if (!isSuper) {
      return NextResponse.json(
        { error: 'Solo SUPERADMIN puede usar este endpoint de prueba' },
        { status: 403 }
      );
    }

    // 3. Validar body
    const body = await req.json();
    const input = TestDraftSchema.parse(body);

    // 4. Verificar que existe la tienda
    const store = await prisma.store.findUnique({
      where: { id: input.storeId },
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // 5. Verificar que existe SunatSettings
    const sunatSettings = await prisma.sunatSettings.findUnique({
      where: { storeId: input.storeId },
    });

    if (!sunatSettings) {
      return NextResponse.json(
        { 
          error: 'No existe configuración SUNAT para esta tienda',
          hint: 'Ejecuta seed o crea SunatSettings manualmente',
        },
        { status: 400 }
      );
    }

    // 6. Crear documento en DRAFT
    const document = await createElectronicDocumentDraft(prisma, {
      storeId: input.storeId,
      docType: input.docType,
      customer: input.customer,
      totals: input.totals,
    });

    // 7. Auditoría
    await auditSunatDocDraftCreated({
      storeId: input.storeId,
      userId: user.email, // En este caso, el email del SUPERADMIN
      documentId: document.id,
      docType: document.docType,
      fullNumber: document.fullNumber,
      total: document.total,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    // 8. Retornar resultado
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        docType: document.docType,
        fullNumber: document.fullNumber,
        series: document.series,
        number: document.number,
        status: document.status,
        customer: {
          docType: document.customerDocType,
          docNumber: document.customerDocNumber,
          name: document.customerName,
        },
        totals: {
          taxable: document.taxable,
          igv: document.igv,
          total: document.total,
        },
        createdAt: document.createdAt,
      },
    });

  } catch (error) {
    console.error('[SUNAT Test Draft] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Error al crear documento de prueba',
      },
      { status: 500 }
    );
  }
}
