// ✅ MÓDULO MÓVIL — LISTA DE RESPALDOS DE LA TIENDA
// GET /api/mobile/backups
// Respaldos disponibles en la nube de la tienda del dueño (más nuevos primero).

import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { requireMobileOwner } from '@/lib/mobileOwner';
import { isS3Enabled } from '@/lib/s3Client';

export async function GET() {
  try {
    const owner = await requireMobileOwner();
    if (owner instanceof NextResponse) return owner;

    const backups = await prisma.cloudBackup.findMany({
      where: { storeId: owner.storeId, status: 'AVAILABLE' },
      orderBy: { exportedAt: 'desc' },
      take: 20,
      select: { id: true, exportedAt: true, sizeBytes: true, appVersion: true, createdAt: true },
    });

    return NextResponse.json({
      storageEnabled: isS3Enabled(),
      backups: backups.map((b) => ({
        id: b.id,
        exportedAt: b.exportedAt.toISOString(),
        uploadedAt: b.createdAt.toISOString(),
        sizeBytes: b.sizeBytes,
        appVersion: b.appVersion,
      })),
      count: backups.length,
    });
  } catch (error) {
    console.error('[mobile/backups] Error:', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al listar respaldos' }, { status: 500 });
  }
}
