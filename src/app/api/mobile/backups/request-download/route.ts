// ✅ MÓDULO MÓVIL — DESCARGAR UN RESPALDO (para recuperar la tienda en otro celular)
// POST /api/mobile/backups/request-download  { backupId? }
// Sin backupId devuelve el más reciente de la tienda.

import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { requireMobileOwner } from '@/lib/mobileOwner';
import { generatePresignedDownloadUrl, isS3Enabled } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const owner = await requireMobileOwner();
    if (owner instanceof NextResponse) return owner;

    if (!isS3Enabled()) {
      return NextResponse.json(
        { code: 'S3_NOT_CONFIGURED', message: 'La nube aún no tiene almacenamiento de respaldos configurado' },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { backupId?: unknown };
    const backupId = typeof body.backupId === 'string' && body.backupId ? body.backupId : null;

    const backup = await prisma.cloudBackup.findFirst({
      where: { storeId: owner.storeId, status: 'AVAILABLE', ...(backupId ? { id: backupId } : {}) },
      orderBy: { exportedAt: 'desc' },
      select: { id: true, objectKey: true, sizeBytes: true, sha256: true, exportedAt: true },
    });
    if (!backup) {
      return NextResponse.json(
        { code: 'BACKUP_NOT_FOUND', message: 'Tu tienda aún no tiene respaldos en la nube' },
        { status: 404 },
      );
    }

    const downloadUrl = await generatePresignedDownloadUrl(backup.objectKey, 600);

    await logAudit({
      storeId: owner.storeId,
      userId: owner.userId,
      action: 'MOBILE_BACKUP_DOWNLOAD_REQUESTED',
      entityType: 'SYSTEM',
      entityId: backup.id,
      meta: { sizeBytes: backup.sizeBytes },
    });

    return NextResponse.json({
      success: true,
      downloadUrl,
      backup: {
        id: backup.id,
        sizeBytes: backup.sizeBytes,
        sha256: backup.sha256,
        exportedAt: backup.exportedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[mobile/backups/request-download] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al pedir la descarga' }, { status: 500 });
  }
}
