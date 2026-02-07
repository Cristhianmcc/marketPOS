/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F5 — IMPORT CSV ROBUSTO
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * POST /api/products/import-csv
 * 
 * Formato CSV:
 * name,category,barcode,baseUnitCode,price,stock,conversions
 * 
 * Donde:
 * - name: nombre del producto (requerido)
 * - category: categoría (opcional, default: "Otros")
 * - barcode: código de barras (opcional)
 * - baseUnitCode: código de unidad base (UNIT, KG, M, etc.)
 * - price: precio unitario
 * - stock: stock inicial
 * - conversions: conversiones (opcional), formato "BOX:12,PACK:6"
 *   significa: 1 BOX = 12 (unidades base), 1 PACK = 6 (unidades base)
 * 
 * Ejemplo:
 * "Tornillo 1/4",Tornillos,,UNIT,0.10,1000,"BOX:100,PACK:20"
 * "Cable THW 14",Cables Eléctricos,7891234567890,M,2.50,500,ROLL:100
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrThrow } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma, UnitType } from '@prisma/client';

interface ParsedConversion {
  unitCode: string;
  factor: number;
}

interface ParsedProduct {
  row: number;
  name: string;
  category: string;
  barcode: string | null;
  brand: string | null;
  content: string | null;
  baseUnitCode: string;
  price: number;
  stock: number;
  minStock: number | null;
  conversions: ParsedConversion[];
  errors: string[];
  warnings: string[];
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// Mapeo de códigos de unidad a UnitType del enum
const UNIT_CODE_TO_TYPE: Record<string, UnitType> = {
  'UNIT': UnitType.UNIT,
  'KG': UnitType.KG,
  'G': UnitType.KG,
  'M': UnitType.UNIT, // Metro se trata como unidad contable
  'CM': UnitType.UNIT,
  'MM': UnitType.UNIT,
  'L': UnitType.UNIT,
  'ML': UnitType.UNIT,
  'M2': UnitType.UNIT,
};

/**
 * POST: Importar productos desde CSV
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();

    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede importar productos' },
        { status: 403 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    
    // Si es form-data, es preview/parse
    if (contentType.includes('multipart/form-data')) {
      return handlePreview(request, session);
    }
    
    // Si es JSON, es confirmación de import
    return handleImport(request, session);
  } catch (error: any) {
    console.error('Error in import-csv:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar' },
      { status: 500 }
    );
  }
}

/**
 * Parsear CSV y retornar preview
 */
async function handlePreview(
  request: NextRequest,
  session: { storeId: string; userId: string }
) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
  }

  const text = await file.text();
  const separator = detectSeparator(text);
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'El archivo debe contener al menos cabecera y una fila de datos' },
      { status: 400 }
    );
  }

  // Parse header
  const header = parseCSVLine(lines[0], separator).map((h) =>
    h.toLowerCase().trim().replace(/\uFEFF/g, '')
  );

  // Validar columnas requeridas
  if (!header.includes('name') && !header.includes('nombre')) {
    return NextResponse.json(
      { error: 'Columna "name" o "nombre" es requerida' },
      { status: 400 }
    );
  }

  // Obtener unidades disponibles
  const units = await prisma.unit.findMany({
    select: { id: true, code: true, symbol: true },
  });
  const unitCodes = new Set(units.map((u) => u.code.toUpperCase()));

  // Parse productos (max 50 para preview)
  const products: ParsedProduct[] = [];
  const maxRows = Math.min(lines.length - 1, 50);

  for (let i = 1; i <= maxRows; i++) {
    const values = parseCSVLine(lines[i], separator);
    const row = mapRowToObject(header, values);
    const parsed = parseProductRow(row, i, unitCodes);
    products.push(parsed);
  }

  const validCount = products.filter((p) => p.errors.length === 0).length;
  const errorCount = products.filter((p) => p.errors.length > 0).length;
  const totalRows = lines.length - 1;

  return NextResponse.json({
    preview: products,
    summary: {
      totalRows,
      previewRows: products.length,
      validRows: validCount,
      errorRows: errorCount,
      hasMore: totalRows > 50,
    },
    availableUnits: units.map((u) => ({ code: u.code, symbol: u.symbol })),
  });
}

/**
 * Confirmar e importar productos
 */
async function handleImport(
  request: NextRequest,
  session: { storeId: string; userId: string }
) {
  const body = await request.json();
  const { products, updateExisting = false } = body as {
    products: ParsedProduct[];
    updateExisting?: boolean;
  };

  if (!products || !Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      { error: 'No se recibieron productos para importar' },
      { status: 400 }
    );
  }

  if (products.length > 1000) {
    return NextResponse.json(
      { error: 'Máximo 1000 productos por importación' },
      { status: 400 }
    );
  }

  // Obtener unidades
  const units = await prisma.unit.findMany();
  const unitMap = new Map(units.map((u) => [u.code.toUpperCase(), u]));

  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Procesar en transacción
  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      // Saltar productos con errores
      if (product.errors && product.errors.length > 0) {
        result.skipped++;
        continue;
      }

      try {
        // Determinar UnitType basado en baseUnitCode
        const baseUnitCode = product.baseUnitCode?.toUpperCase() || 'UNIT';
        const unitType = UNIT_CODE_TO_TYPE[baseUnitCode] || UnitType.UNIT;
        
        // Buscar unidad base
        const baseUnit = unitMap.get(baseUnitCode);
        
        // Generar SKU único
        const internalSku = product.barcode || 
          `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // Buscar si ya existe por barcode
        let productMaster;
        if (product.barcode) {
          productMaster = await tx.productMaster.findUnique({
            where: { barcode: product.barcode },
          });
        }

        // Crear o actualizar ProductMaster
        if (!productMaster) {
          productMaster = await tx.productMaster.create({
            data: {
              barcode: product.barcode,
              internalSku,
              name: product.name,
              brand: product.brand,
              content: product.content,
              category: product.category || 'Otros',
              unitType,
              baseUnitId: baseUnit?.id,
            },
          });
        } else if (updateExisting) {
          productMaster = await tx.productMaster.update({
            where: { id: productMaster.id },
            data: {
              name: product.name,
              brand: product.brand,
              content: product.content,
              category: product.category || 'Otros',
              unitType,
              baseUnitId: baseUnit?.id,
            },
          });
        }

        // Verificar StoreProduct
        let storeProduct = await tx.storeProduct.findUnique({
          where: {
            storeId_productId: {
              storeId: session.storeId,
              productId: productMaster.id,
            },
          },
        });

        if (!storeProduct) {
          storeProduct = await tx.storeProduct.create({
            data: {
              storeId: session.storeId,
              productId: productMaster.id,
              price: new Prisma.Decimal(product.price || 0),
              stock: new Prisma.Decimal(product.stock || 0),
              minStock: product.minStock ? new Prisma.Decimal(product.minStock) : null,
              active: product.price > 0,
            },
          });
          result.created++;

          // Crear movimiento inicial si hay stock
          if (product.stock > 0) {
            await tx.movement.create({
              data: {
                storeId: session.storeId,
                storeProductId: storeProduct.id,
                type: 'PURCHASE',
                quantity: new Prisma.Decimal(product.stock),
                unitPrice: new Prisma.Decimal(product.price || 0),
                total: new Prisma.Decimal(product.stock * (product.price || 0)),
                notes: 'Importación CSV - Stock inicial',
                createdById: session.userId,
              },
            });
          }
        } else if (updateExisting) {
          await tx.storeProduct.update({
            where: { id: storeProduct.id },
            data: {
              price: new Prisma.Decimal(product.price || 0),
              stock: new Prisma.Decimal(product.stock || 0),
              minStock: product.minStock ? new Prisma.Decimal(product.minStock) : null,
            },
          });
          result.updated++;
        } else {
          result.skipped++;
          continue;
        }

        // ✅ MÓDULO F2.2: Crear conversiones por (storeId, productMasterId)
        if (product.conversions && product.conversions.length > 0 && baseUnit) {
          for (const conv of product.conversions) {
            const fromUnit = unitMap.get(conv.unitCode.toUpperCase());
            if (!fromUnit) {
              result.errors.push({
                row: product.row,
                message: `Unidad ${conv.unitCode} no encontrada`,
              });
              continue;
            }

            // ✅ F2.2: Usar unique constraint para upsert
            const existingConv = await tx.unitConversion.findUnique({
              where: {
                storeId_productMasterId_fromUnitId_toUnitId: {
                  storeId: session.storeId,
                  productMasterId: productMaster.id,
                  fromUnitId: fromUnit.id,
                  toUnitId: baseUnit.id,
                },
              },
            });

            if (existingConv) {
              // Actualizar factor
              await tx.unitConversion.update({
                where: { id: existingConv.id },
                data: { factorToBase: new Prisma.Decimal(conv.factor) },
              });
            } else {
              // Crear nueva conversión por tienda+producto
              await tx.unitConversion.create({
                data: {
                  storeId: session.storeId,
                  productMasterId: productMaster.id,
                  fromUnitId: fromUnit.id,
                  toUnitId: baseUnit.id,
                  factorToBase: new Prisma.Decimal(conv.factor),
                },
              });
            }
          }
        }
      } catch (error: any) {
        console.error(`Error importing row ${product.row}:`, error);
        result.errors.push({
          row: product.row,
          message: error.message || 'Error al importar',
        });
        result.skipped++;
      }
    }
  });

  return NextResponse.json({
    success: true,
    result,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function detectSeparator(text: string): string {
  const firstLine = text.split('\n')[0];
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function mapRowToObject(
  header: string[],
  values: string[]
): Record<string, string> {
  const obj: Record<string, string> = {};
  header.forEach((col, index) => {
    obj[col] = values[index] || '';
  });
  return obj;
}

function parseProductRow(
  row: Record<string, string>,
  rowNumber: number,
  validUnitCodes: Set<string>
): ParsedProduct {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name (requerido)
  const name = row['name'] || row['nombre'] || '';
  if (!name || name.length < 2) {
    errors.push('Nombre requerido (mínimo 2 caracteres)');
  }

  // Category
  const category = row['category'] || row['categoria'] || 'Otros';

  // Barcode
  const barcode = row['barcode'] || row['codigo'] || null;

  // Brand
  const brand = row['brand'] || row['marca'] || null;

  // Content
  const content = row['content'] || row['contenido'] || null;

  // Base unit code
  let baseUnitCode = (row['baseunitcode'] || row['unittype'] || row['unidad'] || 'UNIT')
    .toUpperCase()
    .trim();
  
  if (!validUnitCodes.has(baseUnitCode)) {
    warnings.push(`Unidad ${baseUnitCode} no reconocida, usando UNIT`);
    baseUnitCode = 'UNIT';
  }

  // Price
  let price = 0;
  const priceStr = row['price'] || row['precio'] || '0';
  const parsedPrice = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    errors.push('Precio inválido');
  } else {
    price = parsedPrice;
  }

  // Stock
  let stock = 0;
  const stockStr = row['stock'] || '0';
  const parsedStock = parseFloat(stockStr.replace(',', '.'));
  if (isNaN(parsedStock) || parsedStock < 0) {
    errors.push('Stock inválido');
  } else {
    stock = parsedStock;
  }

  // Min stock
  let minStock: number | null = null;
  const minStockStr = row['minstock'] || row['stockminimo'] || '';
  if (minStockStr) {
    const parsedMinStock = parseInt(minStockStr);
    if (!isNaN(parsedMinStock) && parsedMinStock >= 0) {
      minStock = parsedMinStock;
    }
  }

  // Conversions (formato: "BOX:12,PACK:6")
  const conversions: ParsedConversion[] = [];
  const conversionsStr = row['conversions'] || row['conversiones'] || '';
  if (conversionsStr) {
    const parts = conversionsStr.split(',').map((p) => p.trim());
    for (const part of parts) {
      const [unitCode, factorStr] = part.split(':').map((s) => s.trim());
      if (unitCode && factorStr) {
        const factor = parseFloat(factorStr);
        if (!isNaN(factor) && factor > 0) {
          if (!validUnitCodes.has(unitCode.toUpperCase())) {
            warnings.push(`Conversión: unidad ${unitCode} no reconocida`);
          } else {
            conversions.push({ unitCode: unitCode.toUpperCase(), factor });
          }
        } else {
          warnings.push(`Conversión: factor inválido para ${unitCode}`);
        }
      }
    }
  }

  return {
    row: rowNumber,
    name,
    category,
    barcode: barcode || null,
    brand: brand || null,
    content: content || null,
    baseUnitCode,
    price,
    stock,
    minStock,
    conversions,
    errors,
    warnings,
  };
}
