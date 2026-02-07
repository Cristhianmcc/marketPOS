/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F3 — /api/services
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * CRUD de servicios (Corte, Instalación, Delivery, Soldadura, etc.)
 * Requiere flag ENABLE_SERVICES habilitado.
 * 
 * GET   /api/services → Lista servicios de la tienda
 * POST  /api/services → Crea servicio (solo OWNER)
 * PATCH /api/services → Actualiza servicio (solo OWNER)
 * 
 * Regla: Los servicios NO descuentan stock
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagKey } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getSessionOrThrow } from '@/lib/session';
import { 
  requireStoreActive, 
  requireFlag, 
  requireRole,
  guardErrorToResponse 
} from '@/lib/guards/requireFlag';

// ══════════════════════════════════════════════════════════════════════════════
// GET - Listar servicios
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_SERVICES);

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';
    const search = searchParams.get('q') || '';

    const services = await prisma.service.findMany({
      where: {
        storeId: session.storeId,
        ...(activeOnly && { active: true }),
        ...(search && {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        }),
      },
      include: {
        baseUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            sunatCode: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ 
      services,
      count: services.length,
    });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST - Crear servicio
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_SERVICES);
    requireRole(session.role, ['OWNER']);

    const body = await request.json();
    const { name, price, taxable = true, baseUnitId } = body;

    // Validaciones
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'El nombre del servicio es requerido' },
        { status: 400 }
      );
    }

    if (typeof price !== 'number' || price < 0) {
      return NextResponse.json(
        { error: 'El precio debe ser un número mayor o igual a 0' },
        { status: 400 }
      );
    }

    // Verificar duplicados
    const existing = await prisma.service.findFirst({
      where: {
        storeId: session.storeId,
        name: {
          equals: name.trim(),
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un servicio con ese nombre' },
        { status: 409 }
      );
    }

    // Validar baseUnitId si se proporciona
    if (baseUnitId) {
      const unit = await prisma.unit.findUnique({ where: { id: baseUnitId } });
      if (!unit) {
        return NextResponse.json(
          { error: 'Unidad base no encontrada' },
          { status: 400 }
        );
      }
    }

    const service = await prisma.service.create({
      data: {
        storeId: session.storeId,
        name: name.trim(),
        price,
        taxable: Boolean(taxable),
        active: true,
        ...(baseUnitId && { baseUnitId }),
      },
      include: {
        baseUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            sunatCode: true,
          },
        },
      },
    });

    return NextResponse.json(service, { status: 201 });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH - Actualizar servicio
// ══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_SERVICES);
    requireRole(session.role, ['OWNER']);

    const body = await request.json();
    const { id, name, price, taxable, active, baseUnitId } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID del servicio es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el servicio existe y pertenece a la tienda
    const existing = await prisma.service.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Servicio no encontrado' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'El nombre del servicio no puede estar vacío' },
          { status: 400 }
        );
      }
      
      // Verificar duplicados (excluyendo el actual)
      const duplicate = await prisma.service.findFirst({
        where: {
          storeId: session.storeId,
          name: {
            equals: name.trim(),
            mode: 'insensitive',
          },
          id: { not: id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'Ya existe otro servicio con ese nombre' },
          { status: 409 }
        );
      }

      updateData.name = name.trim();
    }

    if (price !== undefined) {
      if (typeof price !== 'number' || price < 0) {
        return NextResponse.json(
          { error: 'El precio debe ser un número mayor o igual a 0' },
          { status: 400 }
        );
      }
      updateData.price = price;
    }

    if (taxable !== undefined) {
      updateData.taxable = Boolean(taxable);
    }

    if (active !== undefined) {
      updateData.active = Boolean(active);
    }

    // Validar y agregar baseUnitId
    if (baseUnitId !== undefined) {
      if (baseUnitId === null) {
        updateData.baseUnitId = null;
      } else {
        const unit = await prisma.unit.findUnique({ where: { id: baseUnitId } });
        if (!unit) {
          return NextResponse.json(
            { error: 'Unidad base no encontrada' },
            { status: 400 }
          );
        }
        updateData.baseUnitId = baseUnitId;
      }
    }

    const updated = await prisma.service.update({
      where: { id },
      data: updateData,
      include: {
        baseUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            sunatCode: true,
          },
        },
      },
    });

    return NextResponse.json(updated);

  } catch (error) {
    return guardErrorToResponse(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE - Eliminar servicio (soft delete via active=false, o hard delete si sin uso)
// ══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    await requireStoreActive(session.storeId);
    await requireFlag(session.storeId, FeatureFlagKey.ENABLE_SERVICES);
    requireRole(session.role, ['OWNER']);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID del servicio es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el servicio existe y pertenece a la tienda
    const existing = await prisma.service.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
      include: {
        _count: { select: { saleItems: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Servicio no encontrado' },
        { status: 404 }
      );
    }

    // Si tiene ventas asociadas, solo desactivar (soft delete)
    if (existing._count.saleItems > 0) {
      await prisma.service.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ 
        success: true, 
        softDeleted: true,
        message: 'Servicio desactivado (tiene ventas asociadas)',
      });
    }

    // Sin ventas asociadas, eliminar completamente
    await prisma.service.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deleted: true });

  } catch (error) {
    return guardErrorToResponse(error);
  }
}
