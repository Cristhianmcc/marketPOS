/**
 * API: Cloud Backups - Confirm Upload
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * POST /api/cloud-backups/confirm-upload
 * 
 * Confirma que el archivo se subió correctamente.
 * Solo SUPERADMIN puede usar este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { objectExists } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

interface ConfirmUploadBody {
  backupId: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const body: ConfirmUploadBody = await request.json();
    const { backupId } = body;

    if (!backupId) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'backupId es obligatorio' },
        { status: 400 }
      );
    }

    // Buscar el backup
    const backup = await prisma.cloudBackup.findUnique({
      where: { id: backupId },
      select: {
        id: true,
        storeId: true,
        objectKey: true,
        status: true,
        sizeBytes: true,
        sha256: true,
      },
    });

    if (!backup) {
      return NextResponse.json(
        { code: 'BACKUP_NOT_FOUND', message: 'Backup no encontrado' },
        { status: 404 }
      );
    }

    if (backup.status !== 'UPLOADING') {
      return NextResponse.json(
        { code: 'INVALID_STATUS', message: `Backup tiene estado ${backup.status}, no se puede confirmar` },
        { status: 400 }
      );
    }

    // Verificar que el objeto existe en S3 (opcional, pero recomendado)
    const exists = await objectExists(backup.objectKey);
    if (!exists) {
      // Marcar como FAILED
      await prisma.cloudBackup.update({
        where: { id: backupId },
        data: { status: 'FAILED' },
      });

      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'El archivo no se encontró en el almacenamiento' },
        { status: 400 }
      );
    }

    // Obtener user ID para auditoría
    const user = await prisma.user.findFirst({
      where: { email: session.email },
      select: { id: true },
    });

    // Actualizar a AVAILABLE
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: { 
        status: 'AVAILABLE',
        uploadedByUserId: user?.id,
      },
    });

    // Auditoría
    await logAudit({
      storeId: backup.storeId,
      userId: user?.id,
      action: 'CLOUD_BACKUP_UPLOAD_CONFIRMED',
      entityType: 'SYSTEM',
      entityId: backupId,
      meta: {
        objectKey: backup.objectKey,
        sizeBytes: backup.sizeBytes,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Backup confirmado y disponible',
      backupId,
    });
  } catch (error) {
    console.error('[CloudBackup] Error confirming upload:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al confirmar subida' },
      { status: 500 }
    );
  }
}
