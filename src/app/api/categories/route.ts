import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ MÓDULO F2.2: CRUD de Categorías personalizadas por tienda

const DEFAULT_CATEGORIES = [
  { name: 'Abarrotes',             slug: 'abarrotes',            color: '#F59E0B', icon: '🛒', sortOrder: 1 },
  { name: 'Bebidas',               slug: 'bebidas',              color: '#3B82F6', icon: '🥤', sortOrder: 2 },
  { name: 'Lácteos y Derivados',   slug: 'lacteos-derivados',    color: '#BFDBFE', icon: '🥛', sortOrder: 3 },
  { name: 'Panadería y Pastelería',slug: 'panaderia-pasteleria', color: '#D97706', icon: '🍞', sortOrder: 4 },
  { name: 'Carnes y Embutidos',    slug: 'carnes-embutidos',     color: '#EF4444', icon: '🥩', sortOrder: 5 },
  { name: 'Frutas y Verduras',     slug: 'frutas-verduras',      color: '#10B981', icon: '🥦', sortOrder: 6 },
  { name: 'Limpieza del Hogar',    slug: 'limpieza-hogar',       color: '#6366F1', icon: '🧹', sortOrder: 7 },
  { name: 'Cuidado Personal',      slug: 'cuidado-personal',     color: '#EC4899', icon: '🧴', sortOrder: 8 },
  { name: 'Golosinas y Snacks',    slug: 'golosinas-snacks',     color: '#F97316', icon: '🍬', sortOrder: 9 },
  { name: 'Congelados',            slug: 'congelados',           color: '#60A5FA', icon: '🧊', sortOrder: 10 },
  { name: 'Farmacia',              slug: 'farmacia',             color: '#34D399', icon: '💊', sortOrder: 11 },
  { name: 'Otros',                 slug: 'otros',                color: '#9CA3AF', icon: '📦', sortOrder: 12 },
];

// GET - Listar categorías de la tienda
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const flat = searchParams.get('flat') === 'true'; // Sin jerarquía

    const whereClause: { storeId: string; active?: boolean; parentId?: null } = {
      storeId: session.storeId,
    };

    if (!includeInactive) {
      whereClause.active = true;
    }

    // Si flat=false, solo traer categorías raíz (parentId null)
    if (!flat) {
      whereClause.parentId = null;
    }

    const categories = await prisma.category.findMany({
      where: whereClause,
      include: flat ? undefined : {
        children: {
          where: includeInactive ? {} : { active: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Auto-seed categorías por defecto si la tienda no tiene ninguna
    if (categories.length === 0 && !flat) {
      try {
        await prisma.category.createMany({
          data: DEFAULT_CATEGORIES.map((cat) => ({
            storeId: session.storeId,
            name: cat.name,
            slug: cat.slug,
            color: cat.color,
            icon: cat.icon,
            sortOrder: cat.sortOrder,
            active: true,
          })),
          skipDuplicates: true,
        });
        const seeded = await prisma.category.findMany({
          where: { storeId: session.storeId, active: true, parentId: null },
          include: { children: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        });
        return NextResponse.json({ categories: seeded });
      } catch (seedError) {
        console.error('Error al sembrar categorías por defecto:', seedError);
      }
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return NextResponse.json(
      { error: 'Error al obtener categorías' },
      { status: 500 }
    );
  }
}

// POST - Crear categoría
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo ADMIN/OWNER pueden crear categorías
    if (!['ADMIN', 'OWNER'].includes(session.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await request.json();
    const { name, parentId, color, icon, sortOrder } = body;

    // Validaciones
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    // Generar slug único
    const baseSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Verificar unicidad del slug
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.category.findUnique({ where: { storeId_slug: { storeId: session.storeId, slug } } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Si hay parentId, verificar que existe y pertenece a la tienda
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, storeId: session.storeId },
      });
      if (!parent) {
        return NextResponse.json({ error: 'Categoría padre no encontrada' }, { status: 404 });
      }
    }

    // Calcular sortOrder si no se proporciona
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxOrder = await prisma.category.aggregate({
        where: { storeId: session.storeId, parentId: parentId || null },
        _max: { sortOrder: true },
      });
      finalSortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
    }

    const category = await prisma.category.create({
      data: {
        storeId: session.storeId,
        name: name.trim(),
        slug,
        parentId: parentId || null,
        color: color || null,
        icon: icon || null,
        sortOrder: finalSortOrder,
        active: true,
      },
      include: {
        children: true,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('Error al crear categoría:', error);
    return NextResponse.json(
      { error: 'Error al crear categoría' },
      { status: 500 }
    );
  }
}
