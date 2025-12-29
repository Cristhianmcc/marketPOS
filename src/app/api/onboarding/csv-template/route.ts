// src/app/api/onboarding/csv-template/route.ts
// ✅ MÓDULO 16.2: Onboarding - Descargar plantilla CSV

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/onboarding/csv-template
 * Descarga una plantilla CSV de ejemplo para importar productos
 */
export async function GET(request: NextRequest) {
  try {
    // Plantilla CSV con BOM para UTF-8 y ejemplos
    const csvContent = `\uFEFFbarcode;nombre;marca;contenido;categoria;unitType;price;stock;minStock
7501234567890;Coca Cola;Coca Cola;500ml;Bebidas;UNIT;3.50;24;12
7501234567891;Inca Kola;Inca Kola;500ml;Bebidas;UNIT;3.50;18;12
7501234567892;Galletas Soda;Field;6 unidades;Abarrotes;UNIT;2.50;30;15
7501234567893;Azúcar Blanca;Estrella;1kg;Abarrotes;KG;4.20;50;20
7501234567894;Arroz Extra;Costeño;1kg;Abarrotes;KG;3.80;40;20
;Leche Evaporada;Gloria;410g;Lácteos;UNIT;4.00;25;10
;Pan Integral;Bimbo;500g;Panadería;UNIT;5.50;15;8
;Yogurt Natural;Gloria;1L;Lácteos;UNIT;6.50;12;6
;Aceite Vegetal;Primor;1L;Abarrotes;UNIT;9.50;20;10
;Atún en Lata;A1;170g;Conservas;UNIT;5.00;30;15`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="plantilla_productos.csv"',
      },
    });
  } catch (error: any) {
    console.error('Error generating CSV template:', error);
    return NextResponse.json(
      { error: 'Error al generar plantilla CSV' },
      { status: 500 }
    );
  }
}
