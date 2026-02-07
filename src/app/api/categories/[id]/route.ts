import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

// ✅ MÓDULO F2.2: CRUD de Categoría individual

// GET - Obtener categoría por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: { id, storeId: session.storeId },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
        parent: true,
      },
    });

    if (!category) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error al obtener categoría:', error);
    return NextResponse.json(
      { error: 'Error al obtener categoría' },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar categoría
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo ADMIN/OWNER pueden editar categorías
    if (!['ADMIN', 'OWNER'].includes(session.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, parentId, color, icon, sortOrder, active } = body;

    // Verificar que la categoría existe y pertenece a la tienda
    const existing = await prisma.category.findFirst({
      where: { id, storeId: session.storeId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    // Preparar datos de actualización
    const updateData: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      color?: string | null;
      icon?: string | null;
      sortOrder?: number;
      active?: boolean;
    } = {};

    // Actualizar nombre y slug si cambia el nombre
    if (name !== undefined && name.trim() !== existing.name) {
      updateData.name = name.trim();
      
      // Generar nuevo slug
      const baseSlug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const found = await prisma.category.findFirst({
          where: { storeId: session.storeId, slug, id: { not: id } },
        });
        if (!found) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      updateData.slug = slug;
    }

    // Actualizar parentId (evitar ciclos)
    if (parentId !== undefined) {
      if (parentId === id) {
        return NextResponse.json(
          { error: 'Una categoría no puede ser su propio padre' },
          { status: 400 }
        );
      }
      if (parentId) {
        // Verificar que el padre existe y no es hijo de esta categoría
        const parent = await prisma.category.findFirst({
          where: { id: parentId, storeId: session.storeId },
        });
        if (!parent) {
          return NextResponse.json({ error: 'Categoría padre no encontrada' }, { status: 404 });
        }
        // Verificar que no generamos ciclo (parent no debe ser hijo de id)
        let current = parent;
        while (current.parentId) {
          if (current.parentId === id) {
            return NextResponse.json(
              { error: 'No se puede crear una referencia circular' },
              { status: 400 }
            );
          }
          const nextParent = await prisma.category.findFirst({
            where: { id: current.parentId },
          });
          if (!nextParent) break;
          current = nextParent;
        }
      }
      updateData.parentId = parentId || null;
    }

    if (color !== undefined) updateData.color = color || null;
    if (icon !== undefined) updateData.icon = icon || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (active !== undefined) updateData.active = active;

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        children: true,
        parent: true,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    return NextResponse.json(
      { error: 'Error al actualizar categoría' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar categoría (soft delete: desactivar)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo ADMIN/OWNER pueden eliminar categorías
    if (!['ADMIN', 'OWNER'].includes(session.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const { id } = await params;

    // Verificar que la categoría existe y pertenece a la tienda
    const existing = await prisma.category.findFirst({
      where: { id, storeId: session.storeId },
      include: { children: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    // Si tiene hijos activos, no se puede eliminar
    const activeChildren = existing.children.filter(c => c.active);
    if (activeChildren.length > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar una categoría con subcategorías activas' },
        { status: 400 }
      );
    }

    // Soft delete: desactivar
    await prisma.category.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true, message: 'Categoría desactivada' });
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    return NextResponse.json(
      { error: 'Error al eliminar categoría' },
      { status: 500 }
    );
  }
}
