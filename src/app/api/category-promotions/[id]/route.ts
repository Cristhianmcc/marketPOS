// src/app/api/category-promotions/[id]/route.ts
// Módulo 14.2-B - CRUD de promociones por categoría individual
// PATCH: Actualizar promoción (toggle active o campos)
// DELETE: Eliminar promoción por categoría

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede actualizar promociones por categoría
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede actualizar promociones por categoría' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Verificar que la promoción existe y pertenece a la tienda
    const existing = await prisma.categoryPromotion.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Promoción por categoría no encontrada' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category.trim();
    if (body.type !== undefined) {
      if (body.type !== 'PERCENT' && body.type !== 'AMOUNT') {
        return NextResponse.json(
          { code: 'INVALID_TYPE', message: 'Tipo debe ser PERCENT o AMOUNT' },
          { status: 400 }
        );
      }
      updateData.type = body.type;
    }
    
    if (body.value !== undefined) {
      const type = body.type || existing.type;
      if (type === 'PERCENT') {
        if (body.value <= 0 || body.value > 100) {
          return NextResponse.json(
            { code: 'INVALID_VALUE', message: 'El porcentaje debe estar entre 0 y 100' },
            { status: 400 }
          );
        }
      } else {
        if (body.value <= 0) {
          return NextResponse.json(
            { code: 'INVALID_VALUE', message: 'El valor debe ser mayor a 0' },
            { status: 400 }
          );
        }
      }
      updateData.value = new Prisma.Decimal(body.value);
    }

    if (body.startsAt !== undefined) updateData.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) updateData.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.maxDiscountPerItem !== undefined) {
      updateData.maxDiscountPerItem = body.maxDiscountPerItem ? new Prisma.Decimal(body.maxDiscountPerItem) : null;
    }

    // Validar fechas si se proporcionan ambas
    if (updateData.startsAt && updateData.endsAt) {
      if (updateData.endsAt <= updateData.startsAt) {
        return NextResponse.json(
          { code: 'INVALID_DATES', message: 'La fecha de fin debe ser posterior a la fecha de inicio' },
          { status: 400 }
        );
      }
    }

    const categoryPromotion = await prisma.categoryPromotion.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ categoryPromotion });
  } catch (error) {
    console.error('Error updating category promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al actualizar promoción por categoría' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede eliminar promociones por categoría
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede eliminar promociones por categoría' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verificar que la promoción existe y pertenece a la tienda
    const existing = await prisma.categoryPromotion.findFirst({
      where: {
        id,
        storeId: session.storeId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Promoción por categoría no encontrada' },
        { status: 404 }
      );
    }

    await prisma.categoryPromotion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting category promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al eliminar promoción por categoría' },
      { status: 500 }
    );
  }
}
