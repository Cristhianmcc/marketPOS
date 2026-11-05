// ✅ MÓDULO MÓVIL — CONFIRMAR SUBIDA DE RESPALDO
// POST /api/mobile/backups/confirm-upload  { backupId }

import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { requireMobileOwner } from '@/lib/mobileOwner';
import { objectExists } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const owner = await requireMobileOwner();
    if (owner instanceof NextResponse) return owner;

    const body = (await request.json()) as { backupId?: unknown };
    const backupId = typeof body.backupId === 'string' ? body.backupId : '';
    if (!backupId) {
      return NextResponse.json({ code: 'INVALID_REQUEST', message: 'backupId es obligatorio' }, { status: 400 });
    }

    // Solo respaldos de la propia tienda.
    const backup = await prisma.cloudBackup.findFirst({
      where: { id: backupId, storeId: owner.storeId },
      select: { id: true, objectKey: true, status: true, sizeBytes: true },
    });
    if (!backup) {
      return NextResponse.json({ code: 'BACKUP_NOT_FOUND', message: 'Respaldo no encontrado' }, { status: 404 });
    }
    if (backup.status === 'AVAILABLE') {
      return NextResponse.json({ success: true, backupId, message: 'Respaldo ya confirmado' });
    }
    if (backup.status !== 'UPLOADING') {
      return NextResponse.json(
        { code: 'INVALID_STATUS', message: `El respaldo tiene estado ${backup.status}` },
        { status: 400 },
      );
    }

    if (!(await objectExists(backup.objectKey))) {
      await prisma.cloudBackup.update({ where: { id: backupId }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'El archivo no llegó al almacenamiento. Se reintentará.' },
        { status: 400 },
      );
    }

    await prisma.cloudBackup.update({ where: { id: backupId }, data: { status: 'AVAILABLE' } });

    await logAudit({
      storeId: owner.storeId,
      userId: owner.userId,
      action: 'MOBILE_BACKUP_UPLOAD_CONFIRMED',
      entityType: 'SYSTEM',
      entityId: backupId,
      meta: { sizeBytes: backup.sizeBytes },
    });

    return NextResponse.json({ success: true, backupId, message: 'Respaldo guardado en la nube' });
  } catch (error) {
    console.error('[mobile/backups/confirm-upload] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al confirmar la subida' }, { status: 500 });
  }
}
