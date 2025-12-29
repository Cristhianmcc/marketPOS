// src/app/api/onboarding/import-csv/route.ts
// ✅ MÓDULO 16.2: Onboarding - Preview de import CSV

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';

interface ProductRow {
  barcode?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  categoria?: string;
  unitType: string;
  price?: string;
  stock?: string;
  minStock?: string;
}

interface ParsedProduct {
  row: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  content: string | null;
  category: string;
  unitType: 'UNIT' | 'KG';
  price: number | null;
  stock: number | null;
  minStock: number | null;
  errors: string[];
}

/**
 * POST /api/onboarding/import-csv
 * Parsea CSV y retorna preview con errores
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    // Solo OWNER
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede importar productos' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se recibió archivo' },
        { status: 400 }
      );
    }

    // Leer archivo como texto
    const text = await file.text();
    
    // Detectar separador (; o ,)
    const separator = text.includes(';') ? ';' : ',';
    
    // Parse CSV
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'El archivo CSV debe contener al menos la cabecera y una fila de datos' },
        { status: 400 }
      );
    }

    // Header
    const header = lines[0].replace('\uFEFF', '').trim().split(separator);
    
    // Verificar columnas requeridas
    const requiredColumns = ['nombre', 'unitType'];
    const missingColumns = requiredColumns.filter(col => 
      !header.some(h => h.toLowerCase().trim() === col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Faltan columnas requeridas: ${missingColumns.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse productos (max 20 para preview)
    const products: ParsedProduct[] = [];
    const maxRows = Math.min(lines.length - 1, 20);

    for (let i = 1; i <= maxRows; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(separator);
      const row: any = {};
      
      header.forEach((col, index) => {
        row[col.toLowerCase().trim()] = values[index]?.trim() || '';
      });

      const errors: string[] = [];
      
      // Validar nombre
      if (!row.nombre || row.nombre.length < 2) {
        errors.push('Nombre requerido (mínimo 2 caracteres)');
      }

      // Validar unitType
      const unitType = row.unittype?.toUpperCase();
      if (!unitType || !['UNIT', 'KG'].includes(unitType)) {
        errors.push('unitType debe ser UNIT o KG');
      }

      // Parse price
      let price: number | null = null;
      if (row.price) {
        const priceNum = parseFloat(row.price);
        if (isNaN(priceNum) || priceNum < 0) {
          errors.push('Precio inválido');
        } else {
          price = priceNum;
        }
      }

      // Parse stock
      let stock: number | null = null;
      if (row.stock) {
        const stockNum = parseFloat(row.stock);
        if (isNaN(stockNum) || stockNum < 0) {
          errors.push('Stock inválido');
        } else {
          stock = stockNum;
        }
      }

      // Parse minStock
      let minStock: number | null = null;
      if (row.minstock) {
        const minStockNum = parseInt(row.minstock);
        if (isNaN(minStockNum) || minStockNum < 0) {
          errors.push('Stock mínimo inválido');
        } else {
          minStock = minStockNum;
        }
      }

      products.push({
        row: i,
        barcode: row.barcode || null,
        name: row.nombre || '',
        brand: row.marca || null,
        content: row.contenido || null,
        category: row.categoria || 'Otros',
        unitType: unitType as 'UNIT' | 'KG',
        price,
        stock,
        minStock,
        errors,
      });
    }

    const validCount = products.filter(p => p.errors.length === 0).length;
    const errorCount = products.filter(p => p.errors.length > 0).length;
    const totalRows = lines.length - 1; // Sin contar header

    return NextResponse.json({
      preview: products,
      summary: {
        totalRows,
        previewRows: products.length,
        validRows: validCount,
        errorRows: errorCount,
        hasMore: totalRows > 20,
      },
    });
  } catch (error: any) {
    console.error('Error parsing CSV:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar CSV' },
      { status: 500 }
    );
  }
}
