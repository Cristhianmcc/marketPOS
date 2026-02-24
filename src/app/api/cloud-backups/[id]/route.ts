/**
 * API: Cloud Backups - Delete
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * DELETE /api/cloud-backups/[id]
 * 
 * Elimina un backup de la nube (marca como DELETED, no borra el registro).
 * Solo SUPERADMIN puede usar este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { deleteObject } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { id: backupId } = await params;

    if (!backupId) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'ID de backup es obligatorio' },
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
      },
    });

    if (!backup) {
      return NextResponse.json(
        { code: 'BACKUP_NOT_FOUND', message: 'Backup no encontrado' },
        { status: 404 }
      );
    }

    if (backup.status === 'DELETED') {
      return NextResponse.json(
        { code: 'ALREADY_DELETED', message: 'Backup ya fue eliminado' },
        { status: 400 }
      );
    }

    // Intentar eliminar de S3 (best-effort)
    const deleteResult = await deleteObject(backup.objectKey);
    if (!deleteResult.success) {
      console.warn(`[CloudBackup] No se pudo eliminar de S3: ${deleteResult.error}`);
      // Continuamos de todas formas para marcar como DELETED
    }

    // Marcar como DELETED en DB (no borrar registro para auditoría)
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: { 
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    // Obtener user ID para auditoría
    const user = await prisma.user.findFirst({
      where: { email: session.email },
      select: { id: true },
    });

    // Auditoría
    await logAudit({
      storeId: backup.storeId,
      userId: user?.id,
      action: 'CLOUD_BACKUP_DELETED',
      entityType: 'SYSTEM',
      entityId: backupId,
      meta: {
        objectKey: backup.objectKey,
        sizeBytes: backup.sizeBytes,
        s3DeleteSuccess: deleteResult.success,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Backup eliminado',
      backupId,
    });
  } catch (error) {
    console.error('[CloudBackup] Error deleting backup:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al eliminar backup' },
      { status: 500 }
    );
  }
}
