// src/app/api/category-promotions/route.ts
// Módulo 14.2-B - CRUD de promociones por categoría
// GET: Listar todas las promociones por categoría de la tienda
// POST: Crear nueva promoción por categoría

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede ver promociones por categoría
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede ver promociones por categoría' },
        { status: 403 }
      );
    }

    const categoryPromotions = await prisma.categoryPromotion.findMany({
      where: {
        storeId: session.storeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ categoryPromotions });
  } catch (error) {
    console.error('Error fetching category promotions:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al obtener promociones por categoría' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede crear promociones por categoría
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo el propietario puede crear promociones por categoría' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, category, type, value, startsAt, endsAt, maxDiscountPerItem } = body;

    // Validaciones básicas
    if (!name || !category || !type || value === undefined) {
      return NextResponse.json(
        { code: 'MISSING_FIELDS', message: 'Faltan campos requeridos: name, category, type, value' },
        { status: 400 }
      );
    }

    // Validar tipo
    if (type !== 'PERCENT' && type !== 'AMOUNT') {
      return NextResponse.json(
        { code: 'INVALID_TYPE', message: 'Tipo debe ser PERCENT o AMOUNT' },
        { status: 400 }
      );
    }

    // Validar valor según tipo
    if (type === 'PERCENT') {
      if (value <= 0 || value > 100) {
        return NextResponse.json(
          { code: 'INVALID_VALUE', message: 'El porcentaje debe estar entre 0 y 100' },
          { status: 400 }
        );
      }
    } else {
      if (value <= 0) {
        return NextResponse.json(
          { code: 'INVALID_VALUE', message: 'El valor debe ser mayor a 0' },
          { status: 400 }
        );
      }
    }

    // Validar fechas
    if (startsAt && endsAt) {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (end <= start) {
        return NextResponse.json(
          { code: 'INVALID_DATES', message: 'La fecha de fin debe ser posterior a la fecha de inicio' },
          { status: 400 }
        );
      }
    }

    // Validar maxDiscountPerItem
    if (maxDiscountPerItem !== undefined && maxDiscountPerItem !== null && maxDiscountPerItem <= 0) {
      return NextResponse.json(
        { code: 'INVALID_MAX_DISCOUNT', message: 'El descuento máximo por ítem debe ser mayor a 0' },
        { status: 400 }
      );
    }

    // Crear promoción por categoría
    const categoryPromotion = await prisma.categoryPromotion.create({
      data: {
        storeId: session.storeId,
        name,
        category: category.trim(),
        type,
        value: new Prisma.Decimal(value),
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        maxDiscountPerItem: maxDiscountPerItem ? new Prisma.Decimal(maxDiscountPerItem) : null,
        active: true,
      },
    });

    return NextResponse.json({ categoryPromotion }, { status: 201 });
  } catch (error) {
    console.error('Error creating category promotion:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al crear promoción por categoría' },
      { status: 500 }
    );
  }
}
