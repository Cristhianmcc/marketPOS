/**
 * MÓDULO 18.8 — GET /api/onboarding/sunat/status
 * 
 * Devuelve el estado completo del onboarding SUNAT para la tienda.
 * NO incluye secretos (passwords, certificados, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    // 1. Verificar feature flag
    const enabledFlag = process.env.ENABLE_SUNAT === 'true';
    
    // 2. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 3. Solo OWNER puede ver el wizard
    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede configurar SUNAT' },
        { status: 403 }
      );
    }

    // 4. Verificar estado de la tienda
    const store = await prisma.store.findUnique({
      where: { id: user.storeId! },
      select: { status: true },
    });

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    const storeStatus = store.status;

    // 5. Si SUNAT no está habilitado globalmente
    if (!enabledFlag) {
      return NextResponse.json({
        enabledFlag: false,
        storeStatus,
        configured: false,
        env: 'BETA',
        enabled: false,
        message: 'SUNAT no está disponible en tu plan',
        steps: {
          fiscalData: false,
          solCredentials: false,
          certificate: false,
          testSignedXml: false,
          testSunatBeta: false,
        },
        preferences: {
          autoEmitBoleta: true,
          allowFactura: false,
          defaultDocType: 'NONE',
        },
      });
    }

    // 6. Si tienda archivada
    if (storeStatus === 'ARCHIVED') {
      return NextResponse.json({
        enabledFlag: true,
        storeStatus: 'ARCHIVED',
        configured: false,
        env: 'BETA',
        enabled: false,
        message: 'La tienda está archivada. No se puede configurar SUNAT.',
        steps: {
          fiscalData: false,
          solCredentials: false,
          certificate: false,
          testSignedXml: false,
          testSunatBeta: false,
        },
        preferences: {
          autoEmitBoleta: true,
          allowFactura: false,
          defaultDocType: 'NONE',
        },
      });
    }

    // 7. Obtener o crear settings
    let settings = await prisma.sunatSettings.findUnique({
      where: { storeId: user.storeId! },
    });

    if (!settings) {
      // Crear settings por defecto
      settings = await prisma.sunatSettings.create({
        data: {
          storeId: user.storeId!,
          env: 'BETA',
          enabled: false,
        },
      });
    }

    // 8. Calcular steps
    const steps = {
      fiscalData: settings.stepFiscalData,
      solCredentials: settings.stepSolCredentials,
      certificate: settings.stepCertificate,
      testSignedXml: settings.stepTestSign,
      testSunatBeta: settings.stepTestBeta,
    };

    // 9. Verificar si está completamente configurado
    const configured = steps.fiscalData && steps.solCredentials && steps.certificate;

    // 10. Respuesta (SIN secretos)
    return NextResponse.json({
      enabledFlag: true,
      storeStatus: 'ACTIVE',
      configured,
      env: settings.env,
      enabled: settings.enabled,
      steps,
      preferences: {
        autoEmitBoleta: settings.autoEmitBoleta,
        allowFactura: settings.allowFactura,
        defaultDocType: settings.defaultDocType,
      },
      // Datos fiscales (solo lectura, sin secretos)
      fiscalData: {
        ruc: settings.ruc || '',
        razonSocial: settings.razonSocial || '',
        address: settings.address || '',
        ubigeo: settings.ubigeo || '',
      },
      series: {
        factura: settings.defaultFacturaSeries,
        boleta: settings.defaultBoletaSeries,
      },
    });

  } catch (error: any) {
    console.error('Error en GET /api/onboarding/sunat/status:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
