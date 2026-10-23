import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStoreUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentStoreUser();
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const pharmaEnabled = await isFeatureEnabled(session.storeId!, FeatureFlagKey.ENABLE_PHARMA_FIELDS);

    const products = await prisma.storeProduct.findMany({
      where: { storeId: session.storeId },
      include: {
        product: true,
        ...(pharmaEnabled ? {
          batches: {
            where: { active: true, quantityAvailable: { gt: 0 } },
            orderBy: { expiryDate: 'asc' },
            take: 1,
          },
        } : {}),
      },
      orderBy: { product: { name: 'asc' } },
    });

    // Generate CSV
    const baseHeaders = [
      'Nombre', 'Marca', 'Contenido', 'Categoria', 'Codigo', 'Tipo',
      'Precio', 'Stock', 'Stock Minimo', 'Estado', 'Imagen URL',
    ];
    const pharmaHeaders = pharmaEnabled ? [
      'Nombre Comercial', 'Principio Activo', 'Concentracion', 'Forma Farmaceutica',
      'Presentacion', 'Laboratorio', 'Registro Sanitario', 'Requiere Receta',
      'Categoria Terapeutica', 'Lote Proximo', 'Fecha Vencimiento',
    ] : [];
    const headers = [...baseHeaders, ...pharmaHeaders];

    const rows = products.map((sp: any) => {
      const base = [
        escapeCSV(sp.product.name),
        escapeCSV(sp.product.brand || ''),
        escapeCSV(sp.product.content || ''),
        escapeCSV(sp.product.category),
        escapeCSV(sp.product.barcode || sp.product.internalSku),
        escapeCSV(sp.product.unitType === 'UNIT' ? 'Unidad' : 'KG'),
        escapeCSV(Number(sp.price).toFixed(2)),
        escapeCSV(sp.stock !== null ? Number(sp.stock).toFixed(3) : ''),
        escapeCSV(sp.minStock !== null ? Number(sp.minStock).toFixed(3) : ''),
        escapeCSV(sp.active ? 'Activo' : 'Inactivo'),
        escapeCSV(sp.product.imageUrl || ''),
      ];
      if (!pharmaEnabled) return base;
      const batch = sp.batches?.[0];
      return [
        ...base,
        escapeCSV(sp.product.commercialName || ''),
        escapeCSV(sp.product.genericName || ''),
        escapeCSV(sp.product.concentration || ''),
        escapeCSV(sp.product.pharmaceuticalForm || ''),
        escapeCSV(sp.product.presentation || ''),
        escapeCSV(sp.product.laboratory || ''),
        escapeCSV(sp.product.sanitaryRegistry || ''),
        escapeCSV(sp.product.requiresPrescription ? 'Si' : 'No'),
        escapeCSV(sp.product.medicineCategory || ''),
        escapeCSV(batch?.batchNumber || ''),
        escapeCSV(batch ? new Date(batch.expiryDate).toLocaleDateString('es-PE') : ''),
      ];
    });

    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';')),
    ].join('\n');

    // Add BOM for UTF-8 recognition in Excel
    const csvWithBOM = '\uFEFF' + csv;

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inventario_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting inventory:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al exportar inventario' },
      { status: 500 }
    );
  }
}
