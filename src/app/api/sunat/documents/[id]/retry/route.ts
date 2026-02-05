/**
 * MÓDULO 18.4 — ENDPOINT: REINTENTAR ENVÍO A SUNAT
 * 
 * POST /api/sunat/documents/:id/retry
 * 
 * Crea un nuevo job para reintentar el envío de un documento con ERROR o REJECTED.
 * Útil para recuperar documentos fallidos manualmente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { auditSunatJobQueued } from '@/domain/sunat/audit';
import { isSuperAdmin } from '@/lib/superadmin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2. Permisos: OWNER o SUPERADMIN
    const isSuper = isSuperAdmin(user.email);
    if (user.role !== 'OWNER' && !isSuper) {
      return NextResponse.json(
        { error: 'No tienes permisos para reintentar envíos a SUNAT' },
        { status: 403 }
      );
    }

    // 3. Verificar feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json(
        { error: 'SUNAT está deshabilitado globalmente' },
        { status: 403 }
      );
    }

    // 4. Cargar documento
    const document = await prisma.electronicDocument.findUnique({
      where: { id: documentId },
      include: {
        store: {
          include: {
            sunatSettings: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    // 5. Validar permisos de tienda
    if (!isSuper && document.storeId !== user.storeId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      );
    }

    // 6. Validar que SUNAT esté habilitado
    if (!document.store.sunatSettings?.enabled) {
      return NextResponse.json(
        { error: 'SUNAT no está habilitado para esta tienda' },
        { status: 400 }
      );
    }

    // 7. Validar estado del documento (solo ERROR o REJECTED pueden reintentarse)
    if (document.status !== 'ERROR' && document.status !== 'REJECTED') {
      return NextResponse.json(
        { 
          error: `Solo documentos con ERROR o REJECTED pueden reintentarse (estado actual: ${document.status})`,
          currentStatus: document.status,
        },
        { status: 400 }
      );
    }

    // 8. Validar que esté firmado
    if (!document.xmlSigned) {
      return NextResponse.json(
        { error: 'El documento no tiene XML firmado' },
        { status: 400 }
      );
    }

    // 9. Verificar que no exista un job QUEUED ya
    const existingQueuedJob = await prisma.sunatJob.findFirst({
      where: {
        documentId,
        type: 'SEND_CPE',
        status: 'QUEUED',
      },
    });

    if (existingQueuedJob) {
      return NextResponse.json(
        { 
          error: 'Ya existe un job QUEUED para este documento',
          jobId: existingQueuedJob.id,
        },
        { status: 409 }
      );
    }

    // 10. Obtener último job fallido (para referencia)
    const lastJob = await prisma.sunatJob.findFirst({
      where: {
        documentId,
        type: 'SEND_CPE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 11. Crear nuevo job de reintento
    const retryJob = await prisma.sunatJob.create({
      data: {
        documentId,
        storeId: document.storeId,
        type: 'SEND_CPE',
        status: 'QUEUED',
        attempts: 0, // Reiniciar contador de intentos
        nextRunAt: new Date(), // Ejecutar inmediatamente
      },
    });

    // 12. Actualizar documento a PENDING (salir de ERROR/REJECTED)
    await prisma.electronicDocument.update({
      where: { id: documentId },
      data: {
        status: 'PENDING',
      },
    });

    // 13. Auditoría
    await auditSunatJobQueued({
      userId: user.userId,
      storeId: document.storeId,
      documentId,
      jobId: retryJob.id,
      docType: document.docType,
      fullNumber: document.fullNumber,
      isRetry: true,
      previousJobId: lastJob?.id,
      previousError: lastJob?.lastError ?? undefined,
    });

    // 14. Respuesta
    return NextResponse.json({
      success: true,
      message: 'Reintento encolado exitosamente',
      job: {
        id: retryJob.id,
        status: retryJob.status,
        type: retryJob.type,
        nextRunAt: retryJob.nextRunAt,
      },
      previousJob: lastJob ? {
        id: lastJob.id,
        attempts: lastJob.attempts,
        lastError: lastJob.lastError,
      } : null,
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/documents/:id/retry:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
