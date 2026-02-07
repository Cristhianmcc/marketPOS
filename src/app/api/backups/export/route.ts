import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import archiver from 'archiver';
import { Readable } from 'stream';
import crypto from 'crypto';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit';
import { logAudit } from '@/lib/auditLog';

// Verificar si es SUPERADMIN
function isSuperAdmin(email: string): boolean {
  const superadminEmails = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  return superadminEmails.includes(email);
}

export async function GET(request: NextRequest) {
  try {
    // ✅ MÓDULO S8: Rate limit backup export
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit('backup-export', clientIP);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', message: `Demasiadas solicitudes. Intenta en ${waitSeconds}s` },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedStoreId = searchParams.get('storeId');

    // Determinar qué tienda exportar
    let storeIdToExport: string;
    
    if (isSuperAdmin(session.email)) {
      // SUPERADMIN puede exportar cualquier tienda
      storeIdToExport = requestedStoreId || session.storeId;
    } else if (session.role === 'OWNER') {
      // OWNER solo puede exportar su propia tienda
      storeIdToExport = session.storeId;
    } else {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo OWNER o SUPERADMIN pueden exportar backups' },
        { status: 403 }
      );
    }

    // Obtener datos del store
    const store = await prisma.store.findUnique({
      where: { id: storeIdToExport },
      include: {
        settings: true,
      },
    });

    if (!store) {
      return NextResponse.json(
        { code: 'STORE_NOT_FOUND', message: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // Exportar datos (sin passwords)
    const [users, storeProducts, shifts, sales, movements, customers, receivables] = await Promise.all([
      prisma.user.findMany({
        where: { storeId: storeIdToExport },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          createdAt: true,
          // NO exportar password
        },
      }),
      prisma.storeProduct.findMany({
        where: { storeId: storeIdToExport },
        include: {
          product: true,
        },
      }),
      prisma.shift.findMany({
        where: { storeId: storeIdToExport },
        include: {
          openedBy: {
            select: { email: true, name: true },
          },
        },
      }),
      prisma.sale.findMany({
        where: { storeId: storeIdToExport },
        include: {
          items: true,
          customer: {
            select: { id: true, name: true, phone: true, dni: true },
          },
          user: {
            select: { email: true, name: true },
          },
        },
      }),
      prisma.movement.findMany({
        where: { storeId: storeIdToExport },
      }),
      prisma.customer.findMany({
        where: { storeId: storeIdToExport },
      }),
      prisma.receivable.findMany({
        where: { storeId: storeIdToExport },
        include: {
          payments: true,
          customer: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { email: true, name: true },
          },
        },
      }),
    ]);

    // Extraer ProductMasters únicos
    const productMasterIds = new Set(storeProducts.map(sp => sp.productId));
    const productMasters = await prisma.productMaster.findMany({
      where: {
        id: { in: Array.from(productMasterIds) },
      },
    });

    // Data completo
    const backupData = {
      store: {
        name: store.name,
        ruc: store.ruc,
        address: store.address,
        phone: store.phone,
      },
      storeSettings: store.settings,
      users,
      productMasters,
      storeProducts: storeProducts.map(sp => ({
        ...sp,
        product: undefined, // Ya está en productMasters
      })),
      shifts,
      sales,
      movements,
      customers,
      receivables,
    };

    // Calcular checksum SHA-256 del contenido de data.json
    const dataJsonContent = JSON.stringify(backupData, null, 2);
    const checksum = crypto.createHash('sha256').update(dataJsonContent, 'utf8').digest('hex');

    // Metadata
    const metadata = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      store: {
        name: store.name,
        ruc: store.ruc,
        address: store.address,
        phone: store.phone,
      },
      checksum: `sha256:${checksum}`,
      counts: {
        users: users.length,
        productMasters: productMasters.length,
        storeProducts: storeProducts.length,
        shifts: shifts.length,
        sales: sales.length,
        saleItems: sales.reduce((sum, s) => sum + s.items.length, 0),
        movements: movements.length,
        customers: customers.length,
        receivables: receivables.length,
        receivablePayments: receivables.reduce((sum, r) => sum + r.payments.length, 0),
      },
    };

    // Crear ZIP en memoria
    const chunks: Buffer[] = [];
    
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err) => reject(err));

      // Agregar archivos al ZIP
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
      archive.append(JSON.stringify(backupData, null, 2), { name: 'data.json' });
      
      // Finalizar (esto dispara 'end')
      archive.finalize();
    });

    const filename = `backup_store_${store.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error exporting backup:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar backup', details: String(error) },
      { status: 500 }
    );
  }
}
