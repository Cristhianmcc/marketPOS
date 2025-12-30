import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { logAudit } from '@/lib/auditLog';
import { isSuperAdmin } from '@/lib/superadmin';
import { z } from 'zod';

const ImportProductSchema = z.object({
  productMasterId: z.string().min(1, 'Product ID requerido'),
  price: z.number().positive('Precio debe ser mayor a 0'),
  stock: z.number().nonnegative('Stock debe ser mayor o igual a 0').optional().nullable(),
  minStock: z.number().nonnegative('Stock mínimo debe ser mayor o igual a 0').optional().nullable(),
  active: z.boolean().default(true),
});

/**
 * POST /api/catalog/import
 * Importa un producto del catálogo global a la tienda actual
 * Auth: OWNER
 * Body: { productMasterId, price, stock?, minStock?, active? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede importar productos' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = ImportProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { productMasterId, price, stock, minStock, active, targetStoreId } = body;

    // Determinar la tienda destino: si es SUPERADMIN y pasa targetStoreId, usar esa; sino, usar su propia tienda
    let destinationStoreId = user.storeId;

    if (targetStoreId) {
      const isSuperAdminCheck = await isSuperAdmin(user.email);
      if (!isSuperAdminCheck) {
        return NextResponse.json(
          { error: 'No tienes permisos para importar a otras tiendas' },
          { status: 403 }
        );
      }
      // Verificar que la tienda existe
      const targetStore = await prisma.store.findUnique({
        where: { id: targetStoreId },
      });
      if (!targetStore) {
        return NextResponse.json(
          { error: 'Tienda destino no encontrada' },
          { status: 404 }
        );
      }
      destinationStoreId = targetStoreId;
    }

    // Verificar que el producto existe y es global
    const productMaster = await prisma.productMaster.findUnique({
      where: { id: productMasterId },
    });

    if (!productMaster) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      );
    }

    if (!productMaster.isGlobal) {
      return NextResponse.json(
        { error: 'Este producto no está disponible en el catálogo global' },
        { status: 400 }
      );
    }

    // Verificar si ya existe en la tienda destino
    const existing = await prisma.storeProduct.findUnique({
      where: {
        storeId_productId: {
          storeId: destinationStoreId,
          productId: productMasterId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Este producto ya está importado en la tienda destino' },
        { status: 409 }
      );
    }

    // Crear StoreProduct en la tienda destino
    const storeProduct = await prisma.storeProduct.create({
      data: {
        storeId: destinationStoreId,
        productId: productMasterId,
        price,
        stock: stock ?? null,
        minStock: minStock ?? null,
        active,
      },
      include: {
        product: true,
      },
    });

    // Audit log
    await logAudit({
      storeId: destinationStoreId,
      userId: user.userId,
      action: 'CATALOG_IMPORT_SUCCESS',
      entityType: 'CATALOG',
      entityId: storeProduct.id,
      severity: 'INFO',
      meta: {
        productMasterId,
        productName: productMaster.name,
        price,
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json(
      {
        message: 'Producto importado exitosamente',
        storeProduct,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error importing product:', error);

    // Audit log error
    try {
      const user = await getCurrentUser();
      if (user) {
        await logAudit({
          storeId: user.storeId,
          userId: user.userId,
          action: 'CATALOG_IMPORT_FAILED',
          entityType: 'CATALOG',
          severity: 'ERROR',
          meta: { error: String(error) },
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
          userAgent: req.headers.get('user-agent') || undefined,
        });
      }
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return NextResponse.json(
      { error: 'Error al importar producto' },
      { status: 500 }
    );
  }
}
