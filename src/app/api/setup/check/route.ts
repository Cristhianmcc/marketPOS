// src/app/api/setup/check/route.ts
// Verifica si la aplicación desktop ya fue provisionada (tiene usuarios locales)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Verificar si hay usuarios en la base de datos local
    const userCount = await prisma.user.count();
    const storeCount = await prisma.store.count();

    const isProvisioned = userCount > 0 && storeCount > 0;

    return NextResponse.json({
      isProvisioned,
      userCount,
      storeCount,
    });
  } catch (error) {
    // Si hay error de conexión a DB, probablemente no está lista
    console.error('[setup/check] Error:', error);
    return NextResponse.json({
      isProvisioned: false,
      userCount: 0,
      storeCount: 0,
      error: 'Database not ready',
    });
  }
}
