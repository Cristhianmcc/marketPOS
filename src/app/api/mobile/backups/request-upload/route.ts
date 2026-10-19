// ✅ MÓDULO MÓVIL — PEDIR SUBIDA DE RESPALDO
// POST /api/mobile/backups/request-upload
// Igual que /api/cloud-backups/request-upload pero para el dueño de la tienda:
// el storeId sale de la sesión y un intento fallido se puede repetir.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/infra/db/prisma';
import { requireMobileOwner, allowRequest } from '@/lib/mobileOwner';
import {
  generatePresignedUploadUrl,
  generateBackupObjectKey,
  isS3Enabled,
  validateBackupSize,
} from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

const BodySchema = z.object({
  filename: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'SHA256 inválido'),
  exportedAt: z.string().datetime({ offset: true }),
  version: z.string().max(10),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const owner = await requireMobileOwner();
    if (owner instanceof NextResponse) return owner;

    const limit = allowRequest(`mobile-backup:${owner.storeId}`, 20, 60 * 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', message: 'Demasiados respaldos en poco tiempo. Intenta más tarde.' },
        { status: 429 },
      );
    }

    if (!isS3Enabled()) {
      return NextResponse.json(
        { code: 'S3_NOT_CONFIGURED', message: 'La nube aún no tiene almacenamiento de respaldos configurado' },
        { status: 503 },
      );
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      );
    }
    const { sizeBytes, sha256, exportedAt, version, appVersion } = parsed.data;
    // Solo letras, números, punto, guion y guion bajo en el nombre guardado.
    const filename = parsed.data.filename.replace(/[^A-Za-z0-9._-]/g, '_');

    const size = validateBackupSize(sizeBytes);
    if (!size.valid) {
      return NextResponse.json({ code: 'FILE_TOO_LARGE', message: size.error }, { status: 413 });
    }

    const exportDate = new Date(exportedAt);
    const objectKey = generateBackupObjectKey(owner.storeId, filename, exportDate);

    // (storeId, sha256) es único: se reutiliza un intento previo que no terminó.
    const previous = await prisma.cloudBackup.findFirst({
      where: { storeId: owner.storeId, sha256: sha256.toLowerCase() },
      select: { id: true, status: true },
    });
    if (previous?.status === 'AVAILABLE') {
      return NextResponse.json(
        { code: 'BACKUP_ALREADY_EXISTS', message: 'Este respaldo ya está en la nube', backupId: previous.id },
        { status: 409 },
      );
    }

    const backup = previous
      ? await prisma.cloudBackup.update({
          where: { id: previous.id },
          data: {
            status: 'UPLOADING',
            objectKey,
            exportedAt: exportDate,
            sizeBytes,
            version,
            appVersion: appVersion || 'mobile',
            uploadedByUserId: owner.userId,
            deletedAt: null,
          },
        })
      : await prisma.cloudBackup.create({
          data: {
            storeId: owner.storeId,
            exportedAt: exportDate,
            version,
            appVersion: appVersion || 'mobile',
            sizeBytes,
            sha256: sha256.toLowerCase(),
            objectKey,
            status: 'UPLOADING',
            uploadedByUserId: owner.userId,
          },
        });

    const uploadUrl = await generatePresignedUploadUrl(objectKey, 'application/zip', 600);

    await logAudit({
      storeId: owner.storeId,
      userId: owner.userId,
      action: 'MOBILE_BACKUP_UPLOAD_REQUESTED',
      entityType: 'SYSTEM',
      entityId: backup.id,
      meta: { filename, sizeBytes },
    });

    return NextResponse.json({ success: true, backupId: backup.id, uploadUrl, objectKey });
  } catch (error) {
    console.error('[mobile/backups/request-upload] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al solicitar la subida' }, { status: 500 });
  }
}
