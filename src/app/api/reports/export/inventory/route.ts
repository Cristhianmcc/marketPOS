import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

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
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const products = await prisma.storeProduct.findMany({
      where: {
        storeId: session.storeId,
      },
      include: {
        product: true,
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    });

    // Generate CSV
    const headers = [
      'Nombre',
      'Marca',
      'Contenido',
      'Categoria',
      'Codigo',
      'Tipo',
      'Precio',
      'Stock',
      'Stock Minimo',
      'Estado',
      'Imagen URL', // ✅ MÓDULO S5: URL de imagen del producto
    ];

    const rows = products.map(sp => [
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
      escapeCSV(sp.product.imageUrl || ''), // ✅ MÓDULO S5: URL de imagen
    ]);

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
