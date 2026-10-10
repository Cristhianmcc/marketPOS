import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getCurrentUser } from '@/lib/session';
import { logAudit } from '@/lib/auditLog';
import {
  restoreFiscalArchive,
  validateFiscalArchiveEnvelope,
} from '@/lib/sunat/fiscalArchive';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.storeId) return NextResponse.json({ error: 'No autenticado en una tienda' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Solo OWNER puede restaurar el archivo fiscal' }, { status: 403 });
  if (request.headers.get('x-desktop-app') !== 'true' && process.env.DESKTOP_MODE !== 'true') {
    return NextResponse.json({ error: 'Disponible solamente en la aplicación desktop' }, { status: 400 });
  }

  try {
    const envelope = validateFiscalArchiveEnvelope(await request.json());
    const currentStore = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: { id: true, ruc: true },
    });
    if (!currentStore) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });

    const result = await prisma.$transaction(
      tx => restoreFiscalArchive(tx, currentStore.id, currentStore.ruc, envelope.data),
      { timeout: 60_000 }
    );

    await logAudit({
      storeId: currentStore.id,
      userId: user.userId,
      action: 'SUNAT_ARCHIVE_RESTORED',
      entityType: 'SUNAT',
      entityId: currentStore.id,
      severity: 'WARN',
      meta: {
        exportedAt: envelope.data.exportedAt,
        ...result,
        credentialsRestored: false,
        jobsRestored: false,
      },
    });
    return NextResponse.json({ success: true, ...result, enabled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo restaurar el archivo fiscal';
    const status = message.includes('otra tienda') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
