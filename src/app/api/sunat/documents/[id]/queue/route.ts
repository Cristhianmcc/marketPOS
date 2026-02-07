/**
 * MÓDULO 18.4 — ENDPOINT: ENCOLAR JOB DE SUNAT
 * 
 * POST /api/sunat/documents/:id/queue
 * 
 * Encola un documento para envío a SUNAT (no lo envía directamente).
 * El worker procesará el job de forma asíncrona.
 * 
 * IMPORTANTE: Este endpoint NO bloquea el checkout.
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
        { error: 'No tienes permisos para encolar documentos SUNAT' },
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

    // 5. Validar permisos de tienda (OWNER solo puede su tienda)
    if (!isSuper && document.storeId !== user.storeId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      );
    }

    // 6. Validar que SUNAT esté habilitado para la tienda
    if (!document.store.sunatSettings?.enabled) {
      return NextResponse.json(
        { error: 'SUNAT no está habilitado para esta tienda' },
        { status: 400 }
      );
    }

    // 7. Validar estado del documento
    if (document.status !== 'SIGNED') {
      return NextResponse.json(
        { 
          error: `El documento debe estar SIGNED para encolarlo (estado actual: ${document.status})`,
          currentStatus: document.status,
        },
        { status: 400 }
      );
    }

    // 8. Verificar que no exista un job QUEUED o DONE ya
    const existingJob = await prisma.sunatJob.findFirst({
      where: {
        documentId: documentId,
        type: 'SEND_CPE',
        status: {
          in: ['QUEUED', 'DONE'],
        },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        { 
          error: `Ya existe un job ${existingJob.status} para este documento`,
          jobId: existingJob.id,
          status: existingJob.status,
        },
        { status: 409 } // Conflict
      );
    }

    // 9. Crear job QUEUED
    const job = await prisma.sunatJob.create({
      data: {
        documentId: documentId,
        storeId: document.storeId,
        type: 'SEND_CPE', // Factura/Boleta/NC/ND
        status: 'QUEUED',
        attempts: 0,
        nextRunAt: new Date(), // Ejecutar inmediatamente
      },
    });

    // 10. Auditoría
    await auditSunatJobQueued({
      userId: user.userId,
      storeId: document.storeId,
      documentId,
      jobId: job.id,
      docType: document.docType,
      fullNumber: document.fullNumber,
    });

    // 11. Respuesta
    return NextResponse.json({
      success: true,
      message: 'Documento encolado para envío a SUNAT',
      job: {
        id: job.id,
        status: job.status,
        type: job.type,
        nextRunAt: job.nextRunAt,
      },
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/documents/:id/queue:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
