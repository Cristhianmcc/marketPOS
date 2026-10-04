import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getCurrentUser } from '@/lib/session';

function checksum(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.storeId) {
    return NextResponse.json({ error: 'No autenticado en una tienda' }, { status: 401 });
  }
  if (user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Solo OWNER puede respaldar el archivo fiscal' }, { status: 403 });
  }
  if (request.headers.get('x-desktop-app') !== 'true' && process.env.DESKTOP_MODE !== 'true') {
    return NextResponse.json({ error: 'Disponible solamente en la aplicación desktop' }, { status: 400 });
  }

  const [store, settings, documents] = await Promise.all([
    prisma.store.findUnique({
      where: { id: user.storeId },
      select: { id: true, name: true, ruc: true },
    }),
    prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId },
      select: {
        env: true, ruc: true, razonSocial: true, address: true, ubigeo: true,
        defaultFacturaSeries: true, defaultBoletaSeries: true,
        defaultNcSeries: true, defaultNdSeries: true,
        defaultSummarySeries: true, defaultVoidedSeries: true,
        nextFacturaNumber: true, nextBoletaNumber: true,
        nextNcNumber: true, nextNdNumber: true,
        nextSummaryNumber: true, nextVoidedNumber: true,
      },
    }),
    prisma.electronicDocument.findMany({
      where: { storeId: user.storeId },
      orderBy: { createdAt: 'asc' },
      include: { sale: { select: { saleNumber: true } } },
    }),
  ]);

  if (!store) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { storeId: store.id, storeName: store.name, ruc: settings?.ruc || store.ruc || null },
    settings,
    documents: documents.map(({ sale, ...document }) => ({
      ...document,
      taxable: document.taxable.toString(),
      igv: document.igv.toString(),
      total: document.total.toString(),
      saleNumber: sale?.saleNumber ?? null,
    })),
  };

  return NextResponse.json({ data, checksum: `sha256:${checksum(data)}` });
}
