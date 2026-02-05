/**
 * MÓDULO 18.5 — GET /api/sunat/settings/status
 * 
 * Devuelve el estado de configuración SUNAT para mostrar en UI.
 * NO devuelve contraseñas, solo indica si están configuradas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    // 1. Verificar feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json({
        enabled: false,
        configured: false,
        message: 'SUNAT está deshabilitado globalmente',
      });
    }

    // 2. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 3. Obtener configuración de la tienda del usuario
    const settings = await prisma.sunatSettings.findUnique({
      where: {
        storeId: user.storeId,
      },
    });

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        configured: false,
        message: 'No hay configuración SUNAT para esta tienda',
      });
    }

    // 4. Verificar si está completamente configurado
    // En BETA: solo necesita RUC y credenciales SOL
    // En PROD: necesita también certificado digital
    const isBeta = settings.env === 'BETA';
    const hasBasicConfig = !!(settings.ruc && settings.solUser && settings.solPass);
    const hasCertificate = !!(settings.certPfxBase64 && settings.certPassword);
    
    const configured = isBeta 
      ? hasBasicConfig  // BETA: sin certificado OK
      : (hasBasicConfig && hasCertificate);  // PROD: todo requerido

    // 5. Parsear series
    const series = {
      factura: settings.defaultFacturaSeries || 'F001',
      boleta: settings.defaultBoletaSeries || 'B001',
      creditNote: settings.defaultNcSeries || 'FC01',
      debitNote: settings.defaultNdSeries || 'FD01',
    };

    // 6. Respuesta (SIN contraseñas)
    return NextResponse.json({
      enabled: settings.enabled,
      env: settings.env || 'BETA',
      configured,
      ruc: settings.ruc || null,
      businessName: settings.razonSocial || null,
      address: settings.address || null,
      ubigeo: settings.ubigeo || null,
      series,
      hasSolCredentials: !!(settings.solUser && settings.solPass),
      hasCertificate: !!settings.certPfxBase64,
      // NUNCA devolver: solPass, certPassword, certPfxBase64
    });

  } catch (error: any) {
    console.error('Error en GET /api/sunat/settings/status:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
