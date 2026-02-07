/**
 * ══════════════════════════════════════════════════════════════════════════════
 * API: GET /api/store/profile
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Devuelve el perfil de negocio de la tienda del usuario actual.
 * Incluye las categorías personalizadas de la tienda (si existen) o las sugeridas.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { getCategoriesForBusiness, getFlatCategories, type BusinessType } from '@/lib/hardware-categories';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json(
        { error: 'No autenticado o sin tienda' },
        { status: 401 }
      );
    }

    const store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: {
        id: true,
        name: true,
        businessProfile: true,
        categories: {
          where: { active: true, parentId: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            icon: true,
            children: {
              where: { active: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                icon: true,
              },
            },
          },
        },
      },
    });

    if (!store) {
      return NextResponse.json(
        { error: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // Si la tienda tiene categorías personalizadas, usarlas
    if (store.categories.length > 0) {
      // Convertir a formato de grupos (padre -> hijos)
      const categoryGroups = store.categories.map(cat => ({
        group: cat.name,
        categories: cat.children.length > 0 
          ? cat.children.map(c => c.name)
          : [cat.name], // Si no tiene hijos, el grupo es la categoría
      }));

      // Flat list: todas las categorías (padres + hijos)
      const flatCategories = store.categories.flatMap(cat => 
        cat.children.length > 0 
          ? cat.children.map(c => c.name)
          : [cat.name]
      );

      return NextResponse.json({
        store: {
          id: store.id,
          name: store.name,
          businessProfile: store.businessProfile,
        },
        categoryGroups,
        categories: flatCategories,
        hasCustomCategories: true,
      });
    }

    // Fallback: usar categorías hardcodeadas según el perfil
    const profileToType: Record<string, BusinessType> = {
      'BODEGA': 'BODEGA',
      'FERRETERIA': 'FERRETERIA',
      'MINIMARKET': 'MINIMARKET',
      'FARMACIA': 'FARMACIA',
      'LIBRERIA': 'LIBRERIA',
      'RESTAURANTE': 'RESTAURANTE',
    };

    const businessType = profileToType[store.businessProfile] || 'OTRO';
    const categoryGroups = getCategoriesForBusiness(businessType);
    const flatCategories = getFlatCategories(categoryGroups);

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        businessProfile: store.businessProfile,
      },
      categoryGroups,
      categories: flatCategories,
      hasCustomCategories: false,
    });
  } catch (error) {
    console.error('[StoreProfile] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
