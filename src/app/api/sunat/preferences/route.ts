/**
 * MÓDULO 18.8 — API para obtener preferencias SUNAT de la tienda
 * 
 * Usado por el POS para determinar si debe auto-emitir boletas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    // 1. Feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json({
        enabled: false,
        autoEmitBoleta: false,
        allowFactura: false,
        defaultDocType: 'NONE',
      });
    }

    // 2. Autenticación
    const user = await getCurrentUser();
    if (!user || !user.storeId) {
      return NextResponse.json({
        enabled: false,
        autoEmitBoleta: false,
        allowFactura: false,
        defaultDocType: 'NONE',
      });
    }

    // 3. Obtener settings
    const settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId },
      select: {
        enabled: true,
        env: true,
        autoEmitBoleta: true,
        allowFactura: true,
        defaultDocType: true,
      },
    });

    if (!settings || !settings.enabled) {
      return NextResponse.json({
        enabled: false,
        autoEmitBoleta: false,
        allowFactura: false,
        defaultDocType: 'NONE',
      });
    }

    return NextResponse.json({
      enabled: true,
      env: settings.env,
      autoEmitBoleta: settings.autoEmitBoleta,
      allowFactura: settings.allowFactura,
      defaultDocType: settings.defaultDocType,
    });

  } catch (error: any) {
    console.error('Error en GET /api/sunat/preferences:', error);
    return NextResponse.json({
      enabled: false,
      autoEmitBoleta: false,
      allowFactura: false,
      defaultDocType: 'NONE',
    });
  }
}
