import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { logAudit } from '@/lib/auditLog';
import { z } from 'zod';

const PublishProductSchema = z.object({
  productId: z.string().min(1, 'Product ID requerido'),
});

/**
 * POST /api/catalog/publish
 * Marca un producto como global (compartido al catálogo)
 * Auth: OWNER
 * Body: { productId }  // ProductMaster.id
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede publicar productos' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = PublishProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { productId } = validation.data;

    // Verificar que el producto existe
    const productMaster = await prisma.productMaster.findUnique({
      where: { id: productId },
      include: {
        storeProducts: {
          where: { storeId: user.storeId },
        },
      },
    });

    if (!productMaster) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que la tienda tiene este producto configurado
    if (productMaster.storeProducts.length === 0) {
      return NextResponse.json(
        { error: 'Este producto no está configurado en tu tienda' },
        { status: 400 }
      );
    }

    // Verificar si ya está publicado
    if (productMaster.isGlobal) {
      return NextResponse.json(
        { error: 'Este producto ya está publicado en el catálogo global' },
        { status: 400 }
      );
    }

    // Actualizar ProductMaster
    const updated = await prisma.productMaster.update({
      where: { id: productId },
      data: {
        isGlobal: true,
        createdByStoreId: productMaster.createdByStoreId || user.storeId,
      },
    });

    // Audit log
    await logAudit({
      storeId: user.storeId,
      userId: user.userId,
      action: 'CATALOG_PUBLISH_SUCCESS',
      entityType: 'CATALOG',
      entityId: productId,
      severity: 'INFO',
      meta: {
        productName: updated.name,
        barcode: updated.barcode,
      },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      message: 'Producto publicado exitosamente en el catálogo global',
      product: updated,
    });
  } catch (error) {
    console.error('Error publishing product:', error);

    // Audit log error
    try {
      const user = await getCurrentUser();
      if (user) {
        await logAudit({
          storeId: user.storeId,
          userId: user.userId,
          action: 'CATALOG_PUBLISH_FAILED',
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
      { error: 'Error al publicar producto' },
      { status: 500 }
    );
  }
}
