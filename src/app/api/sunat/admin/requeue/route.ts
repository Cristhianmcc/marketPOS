/**
 * MÓDULO 18.7 — POST /api/sunat/admin/requeue
 * 
 * Endpoint para re-encolar documentos pendientes o con error.
 * 
 * ⚠️ RESTRICCIONES:
 * - Solo SUPERADMIN puede usar este endpoint
 * - Solo documentos en estado: SIGNED, ERROR, SENT (para re-poll)
 * - Documentos ACCEPTED/REJECTED no se pueden re-encolar
 * 
 * CASOS DE USO:
 * - Documentos SIGNED que nunca se enviaron (worker caído)
 * - Documentos ERROR que se quieren reintentar manualmente
 * - Documentos SENT que quedaron sin polling de ticket
 * 
 * @author Sistema Market
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/auditLog';
import { z } from 'zod';

/**
 * Estados permitidos para requeue
 */
const REQUEUE_ALLOWED_STATUS = ['SIGNED', 'ERROR', 'SENT'] as const;

/**
 * Schema de validación
 */
const RequeueSchema = z.object({
  documentId: z.string().optional(),
  status: z.enum(['SIGNED', 'ERROR', 'SENT']).optional(),
  storeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

/**
 * POST /api/sunat/admin/requeue
 * 
 * Re-encola documentos para envío/reprocesamiento.
 * 
 * Body:
 * - documentId: (opcional) ID específico de documento
 * - status: (opcional) Filtrar por estado
 * - storeId: (opcional) Filtrar por tienda
 * - limit: (opcional) Máximo documentos a procesar (default 50)
 */
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

    // 2. Solo SUPERADMIN puede usar requeue
    const isSuper = await isSuperAdmin(user.email);
    if (!isSuper) {
      return NextResponse.json(
        { 
          error: 'Solo SUPERADMIN puede usar requeue',
          code: 'FORBIDDEN_NOT_SUPERADMIN',
        },
        { status: 403 }
      );
    }

    // 3. Validar body
    const body = await req.json();
    const { documentId, status, storeId, limit } = RequeueSchema.parse(body);

    // 4. Construir filtro
    const where: any = {
      status: {
        in: status ? [status] : REQUEUE_ALLOWED_STATUS,
      },
    };

    if (documentId) {
      where.id = documentId;
    }

    if (storeId) {
      where.storeId = storeId;
    }

    // 5. Buscar documentos candidatos
    const documents = await prisma.electronicDocument.findMany({
      where,
      take: limit,
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        jobs: {
          where: {
            status: {
              in: ['QUEUED', 'PROCESSING'],
            },
          },
        },
      },
    });

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No se encontraron documentos para re-encolar',
        queued: 0,
      });
    }

    // 6. Filtrar documentos que no tienen job activo
    const docsToRequeue = documents.filter(doc => doc.jobs.length === 0);

    if (docsToRequeue.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Todos los documentos ya tienen jobs activos',
        queued: 0,
        alreadyQueued: documents.length,
      });
    }

    // 7. Crear jobs para documentos sin job activo
    const jobsCreated: any[] = [];

    for (const doc of docsToRequeue) {
      // Determinar tipo de job
      let jobType: 'SEND_CPE' | 'SEND_SUMMARY' | 'QUERY_TICKET';
      
      if (doc.status === 'SENT' && doc.sunatTicket) {
        // Si ya fue enviado y tiene ticket, hacer polling
        jobType = 'QUERY_TICKET';
      } else if (doc.docType === 'SUMMARY' || doc.docType === 'VOIDED') {
        jobType = 'SEND_SUMMARY';
      } else {
        jobType = 'SEND_CPE';
      }

      const job = await prisma.sunatJob.create({
        data: {
          storeId: doc.storeId,
          documentId: doc.id,
          type: jobType,
          status: 'QUEUED',
          attempts: 0,
          nextRunAt: new Date(),
        },
      });

      jobsCreated.push({
        jobId: job.id,
        documentId: doc.id,
        fullNumber: doc.fullNumber,
        docStatus: doc.status,
        jobType,
      });
    }

    // 8. Auditar operación
    await logAudit({
      storeId: user.storeId,
      userId: user.email,
      action: 'SUNAT_ADMIN_REQUEUE',
      entityType: 'SUNAT',
      entityId: `requeue_${Date.now()}`,
      severity: 'INFO',
      meta: {
        filter: { status, storeId, documentId, limit },
        documentsFound: documents.length,
        jobsCreated: jobsCreated.length,
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    // 9. Log de operaciones
    console.log(
      `[SUNAT] 🔄 Admin Requeue ejecutado por ${user.email}:`,
      `${jobsCreated.length} jobs creados`
    );

    // 10. Respuesta
    return NextResponse.json({
      success: true,
      message: `Se re-encolaron ${jobsCreated.length} documentos`,
      queued: jobsCreated.length,
      skipped: documents.length - docsToRequeue.length,
      jobs: jobsCreated,
    });

  } catch (error: any) {
    // Error de Zod
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { 
          error: 'Datos de entrada inválidos',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('[SUNAT] Error en POST /api/sunat/admin/requeue:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sunat/admin/requeue
 * 
 * Devuelve el estado de documentos pendientes de requeue.
 */
export async function GET(req: NextRequest) {
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
        { error: 'Solo SUPERADMIN puede ver estado de requeue' },
        { status: 403 }
      );
    }

    // 3. Contar documentos por estado
    const counts = await prisma.electronicDocument.groupBy({
      by: ['status'],
      _count: true,
      where: {
        status: {
          in: [...REQUEUE_ALLOWED_STATUS],
        },
      },
    });

    // 4. Buscar documentos sin job activo
    const orphanedDocs = await prisma.electronicDocument.findMany({
      where: {
        status: {
          in: [...REQUEUE_ALLOWED_STATUS],
        },
        jobs: {
          none: {
            status: {
              in: ['QUEUED', 'PROCESSING'],
            },
          },
        },
      },
      select: {
        id: true,
        fullNumber: true,
        status: true,
        storeId: true,
        createdAt: true,
      },
      take: 20,
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 5. Respuesta
    const getCount = (status: string) => {
      const found = counts.find(c => c.status === status);
      return found?._count || 0;
    };

    return NextResponse.json({
      summary: {
        SIGNED: getCount('SIGNED'),
        ERROR: getCount('ERROR'),
        SENT: getCount('SENT'),
      },
      orphanedCount: orphanedDocs.length,
      orphanedDocs: orphanedDocs.map(d => ({
        id: d.id,
        fullNumber: d.fullNumber,
        status: d.status,
        storeId: d.storeId,
        createdAt: d.createdAt,
      })),
      hint: orphanedDocs.length > 0 
        ? 'Hay documentos sin job activo. Use POST para re-encolarlos.'
        : 'No hay documentos huérfanos.',
    });

  } catch (error: any) {
    console.error('[SUNAT] Error en GET /api/sunat/admin/requeue:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
