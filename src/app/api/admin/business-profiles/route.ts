/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V1 — GET /api/admin/business-profiles
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Lista todos los perfiles de negocio disponibles con sus presets de flags.
 * Usado para el dropdown al crear/editar tiendas.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { getAllProfilePresets, getProfileMultiRubroFlags } from '@/lib/businessProfiles';

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo SUPERADMIN o usuarios autenticados pueden ver perfiles
    // (para que el owner vea su perfil actual)
    if (!session.isLoggedIn) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    const presets = getAllProfilePresets();

    // Formatear para UI
    const profiles = presets.map(preset => ({
      profile: preset.profile,
      name: preset.name,
      description: preset.description,
      icon: preset.icon,
      // Solo mostrar flags multi-rubro (los core son implícitos)
      specialFlags: getProfileMultiRubroFlags(preset.profile).map(flag => ({
        key: flag,
        description: getMultiRubroFlagDescription(flag),
      })),
      suggestedCategories: preset.suggestedCategories || [],
    }));

    return NextResponse.json({ 
      profiles,
      total: profiles.length,
    });

  } catch (error) {
    console.error('[BusinessProfiles] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener perfiles' },
      { status: 500 }
    );
  }
}

/**
 * Descripciones amigables para flags multi-rubro
 */
function getMultiRubroFlagDescription(flag: string): string {
  const descriptions: Record<string, string> = {
    ENABLE_ADVANCED_UNITS: 'Unidades avanzadas (m², ml, kg fraccionados)',
    ENABLE_SERVICES: 'Servicios sin inventario (mano de obra, tiempo)',
    ENABLE_WORK_ORDERS: 'Órdenes de trabajo con seguimiento',
    ENABLE_RESERVATIONS: 'Reservaciones y disponibilidad',
    ENABLE_BATCH_EXPIRY: 'Lotes y control de vencimientos',
  };
  return descriptions[flag] || flag;
}
