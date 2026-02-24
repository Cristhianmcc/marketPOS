// src/app/api/setup/init-data/route.ts
// Inicializa datos base del sistema (unidades SUNAT, etc.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SUNAT_UNITS_DATA } from '@/lib/sunat-units-data';

export async function POST() {
  try {
    // Verificar si ya existen unidades
    const unitCount = await prisma.unit.count();
    
    if (unitCount > 0) {
      return NextResponse.json({
        success: true,
        message: 'Datos ya inicializados',
        unitsCreated: 0,
      });
    }

    // Crear unidades SUNAT
    const createdUnits = await prisma.unit.createMany({
      data: SUNAT_UNITS_DATA.map(unit => ({
        code: unit.code,
        sunatCode: unit.sunatCode,
        name: unit.name,
        displayName: unit.displayName,
        symbol: unit.symbol,
        kind: unit.kind,
        allowDecimals: unit.allowDecimals,
        precision: unit.precision,
        isBase: unit.isBase,
        sortOrder: unit.sortOrder,
        active: true,
      })),
      skipDuplicates: true,
    });

    console.log(`[setup/init-data] Created ${createdUnits.count} SUNAT units`);

    return NextResponse.json({
      success: true,
      message: 'Datos inicializados correctamente',
      unitsCreated: createdUnits.count,
    });
  } catch (error) {
    console.error('[setup/init-data] Error:', error);
    
    return NextResponse.json(
      { error: 'Error al inicializar datos: ' + (error instanceof Error ? error.message : 'Error desconocido') },
      { status: 500 }
    );
  }
}

// GET para verificar estado de inicialización
export async function GET() {
  try {
    const unitCount = await prisma.unit.count();
    
    return NextResponse.json({
      initialized: unitCount > 0,
      unitCount,
    });
  } catch (error) {
    console.error('[setup/init-data] Error checking status:', error);
    return NextResponse.json({ initialized: false, unitCount: 0 });
  }
}
