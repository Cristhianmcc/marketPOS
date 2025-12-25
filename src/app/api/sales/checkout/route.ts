import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';
import { PrismaShiftRepository } from '@/infra/db/repositories/PrismaShiftRepository';

const shiftRepo = new PrismaShiftRepository();

interface CheckoutItem {
  storeProductId: string;
  quantity: number;
  unitPrice: number;
  // Descuentos (Módulo 14)
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
}

interface CheckoutBody {
  items: CheckoutItem[];
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
  amountPaid?: number;
  customerId?: string; // ✅ Para ventas FIADO
  discountTotal?: number; // Descuento global (Módulo 14)
}

interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
}

class CheckoutError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

async function executeCheckout(
  session: { storeId: string; userId: string },
  items: CheckoutItem[],
  shiftId: string | null, // ✅ Puede ser null para FIADO
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO',
  amountPaid?: number,
  customerId?: string, // ✅ Para FIADO
  discountTotal?: number // Módulo 14: descuento global
): Promise<{ sale: any; saleItems: any[]; receivable?: any }> {
  return await prisma.$transaction(async (tx) => {
    // 1. Validar stock disponible y tipos
    const storeProducts = await tx.storeProduct.findMany({
      where: {
        id: { in: items.map((i) => i.storeProductId) },
        storeId: session.storeId,
        active: true,
      },
      include: { product: true },
    });

    if (storeProducts.length !== items.length) {
      throw new CheckoutError(
        'PRODUCT_NOT_FOUND',
        400,
        'Algunos productos no existen o están inactivos'
      );
    }

    // Validar stock y cantidades
    for (const item of items) {
      const sp = storeProducts.find((p) => p.id === item.storeProductId);
      if (!sp) {
        throw new CheckoutError(
          'PRODUCT_NOT_FOUND',
          400,
          `Producto ${item.storeProductId} no encontrado`
        );
      }

      // Validar cantidad según tipo
      if (sp.product.unitType === 'UNIT' && !Number.isInteger(item.quantity)) {
        throw new CheckoutError(
          'INVALID_QUANTITY',
          400,
          `${sp.product.name}: cantidad debe ser entera para productos tipo UNIT`,
          { productId: sp.id, productName: sp.product.name, quantity: item.quantity }
        );
      }

      if (item.quantity <= 0) {
        throw new CheckoutError(
          'INVALID_QUANTITY',
          400,
          `${sp.product.name}: cantidad debe ser mayor a 0`,
          { productId: sp.id, productName: sp.product.name, quantity: item.quantity }
        );
      }

      // Validar stock disponible
      if (sp.stock !== null) {
        const currentStock = sp.stock.toNumber();
        
        // No permitir ventas si el stock es negativo o cero
        if (currentStock <= 0) {
          throw new CheckoutError(
            'INSUFFICIENT_STOCK',
            409,
            `${sp.product.name}: sin stock disponible`,
            {
              productId: sp.id,
              productName: sp.product.name,
              requested: item.quantity,
              available: currentStock,
            }
          );
        }
        
        // Validar que hay suficiente stock para la cantidad solicitada
        if (currentStock < item.quantity) {
          throw new CheckoutError(
            'INSUFFICIENT_STOCK',
            409,
            `${sp.product.name}: stock insuficiente`,
            {
              productId: sp.id,
              productName: sp.product.name,
              requested: item.quantity,
              available: currentStock,
            }
          );
        }
      }
    }

    // 2. Validar y calcular descuentos por ítem
    const itemsWithDiscounts = items.map((item) => {
      const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
      const subtotalItem = item.quantity * item.unitPrice;
      
      let discountAmount = 0;
      
      if (item.discountType && item.discountValue !== undefined) {
        // Validar discountValue presente
        if (item.discountValue === null || item.discountValue === undefined) {
          throw new CheckoutError(
            'DISCOUNT_VALUE_REQUIRED',
            400,
            `${sp.product.name}: discountValue es requerido cuando se especifica discountType`
          );
        }

        if (item.discountType === 'PERCENT') {
          // Validar porcentaje válido
          if (item.discountValue <= 0 || item.discountValue > 100) {
            throw new CheckoutError(
              'INVALID_DISCOUNT',
              400,
              `${sp.product.name}: el descuento porcentual debe estar entre 0 y 100`
            );
          }
          discountAmount = Math.round((subtotalItem * item.discountValue) / 100 * 100) / 100;
        } else if (item.discountType === 'AMOUNT') {
          // Validar monto válido
          if (item.discountValue <= 0 || item.discountValue > subtotalItem) {
            throw new CheckoutError(
              'DISCOUNT_EXCEEDS_SUBTOTAL',
              409,
              `${sp.product.name}: el descuento no puede ser mayor al subtotal del ítem (S/ ${subtotalItem.toFixed(2)})`
            );
          }
          discountAmount = item.discountValue;
        }
      }

      const totalLine = subtotalItem - discountAmount;

      return {
        ...item,
        subtotalItem,
        discountAmount,
        totalLine,
      };
    });

    // 3. Calcular totales
    const subtotalBeforeDiscounts = itemsWithDiscounts.reduce((sum, item) => sum + item.subtotalItem, 0);
    const itemDiscountsTotal = itemsWithDiscounts.reduce((sum, item) => sum + item.discountAmount, 0);
    const subtotalAfterItemDiscounts = subtotalBeforeDiscounts - itemDiscountsTotal;
    
    // Tax (usando lógica actual, puede ser 0)
    const tax = 0;
    
    const totalBeforeGlobalDiscount = subtotalAfterItemDiscounts + tax;
    
    // Validar descuento global
    const globalDiscount = discountTotal ?? 0;
    if (globalDiscount < 0) {
      throw new CheckoutError(
        'INVALID_DISCOUNT',
        400,
        'El descuento global no puede ser negativo'
      );
    }
    if (globalDiscount > totalBeforeGlobalDiscount) {
      throw new CheckoutError(
        'DISCOUNT_EXCEEDS_TOTAL',
        409,
        `El descuento global no puede ser mayor al total (S/ ${totalBeforeGlobalDiscount.toFixed(2)})`
      );
    }
    
    const total = totalBeforeGlobalDiscount - globalDiscount;
    
    // Total de descuentos (ítems + global) para guardar en discountTotal
    const totalDiscounts = itemDiscountsTotal + globalDiscount;

    // 4. Calcular changeAmount si es efectivo
    let changeAmount: number | null = null;
    if (paymentMethod === 'CASH' && amountPaid !== undefined) {
      changeAmount = amountPaid - total;
    }

    // 3b. Para FIADO: amountPaid y changeAmount deben ser null
    if (paymentMethod === 'FIADO') {
      if (!customerId) {
        throw new CheckoutError('CUSTOMER_REQUIRED', 400, 'Debes seleccionar un cliente para ventas FIADO');
      }
      // Verificar que el cliente existe y pertenece a la tienda
      const customer = await tx.customer.findFirst({
        where: { id: customerId, storeId: session.storeId, active: true },
      });
      if (!customer) {
        throw new CheckoutError('CUSTOMER_NOT_FOUND', 404, 'Cliente no encontrado o inactivo');
      }
    }

    // 4. Obtener el siguiente número de venta
    const lastSale = await tx.sale.findFirst({
      where: { storeId: session.storeId },
      orderBy: { saleNumber: 'desc' },
      select: { saleNumber: true },
    });

    const nextSaleNumber = (lastSale?.saleNumber ?? 0) + 1;

    // 5. Crear Sale con descuentos
    const saleData: any = {
      storeId: session.storeId,
      userId: session.userId,
      saleNumber: nextSaleNumber,
      subtotal: new Prisma.Decimal(subtotalBeforeDiscounts),
      tax: new Prisma.Decimal(tax),
      discountTotal: new Prisma.Decimal(totalDiscounts),
      totalBeforeDiscount: new Prisma.Decimal(totalBeforeGlobalDiscount),
      total: new Prisma.Decimal(total),
      paymentMethod: paymentMethod,
    };

    // Para FIADO: shiftId es null, amountPaid y changeAmount null, agregar customerId
    if (paymentMethod === 'FIADO') {
      saleData.shiftId = null;
      saleData.amountPaid = null;
      saleData.changeAmount = null;
      saleData.customerId = customerId;
    } else {
      // Para otros métodos: shiftId requerido
      saleData.shiftId = shiftId;
      saleData.amountPaid = amountPaid !== undefined ? new Prisma.Decimal(amountPaid) : null;
      saleData.changeAmount = changeAmount !== null ? new Prisma.Decimal(changeAmount) : null;
    }

    const sale = await tx.sale.create({ data: saleData });

    // 6. Crear SaleItems con snapshot y descuentos
    const saleItems = await Promise.all(
      itemsWithDiscounts.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        return tx.saleItem.create({
          data: {
            saleId: sale.id,
            storeProductId: item.storeProductId,
            productName: sp.product.name,
            productContent: sp.product.content,
            unitType: sp.product.unitType,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(item.subtotalItem),
            discountType: item.discountType ?? null,
            discountValue: item.discountValue !== undefined ? new Prisma.Decimal(item.discountValue) : null,
            discountAmount: new Prisma.Decimal(item.discountAmount),
            totalLine: new Prisma.Decimal(item.totalLine),
          },
        });
      })
    );

    // 7. Crear Movements (sin cambios - usa subtotal original)
    await Promise.all(
      itemsWithDiscounts.map((item) => {
        return tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: item.storeProductId,
            type: 'SALE',
            quantity: new Prisma.Decimal(-item.quantity), // Negativo = salida
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.subtotalItem), // Usa subtotal sin descuento para movements
            notes: `Venta #${nextSaleNumber}`,
            createdById: session.userId,
          },
        });
      })
    );

    // 8. Actualizar stock
    await Promise.all(
      itemsWithDiscounts.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        const currentStock = sp.stock ? sp.stock.toNumber() : 0;
        const newStock = currentStock - item.quantity;

        return tx.storeProduct.update({
          where: { id: item.storeProductId },
          data: { stock: new Prisma.Decimal(newStock) },
        });
      })
    );

    // 9. Si es FIADO, crear Receivable
    let receivable = null;
    if (paymentMethod === 'FIADO') {
      receivable = await tx.receivable.create({
        data: {
          storeId: session.storeId,
          customerId: customerId!,
          saleId: sale.id,
          originalAmount: new Prisma.Decimal(total),
          balance: new Prisma.Decimal(total),
          status: 'OPEN',
          createdById: session.userId,
        },
      });
    }

    return { sale, saleItems, receivable };
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      const error: ErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
      };
      return NextResponse.json(error, { status: 401 });
    }

    // Verificar que el usuario puede vender (OWNER o CASHIER)
    if (session.role !== 'OWNER' && session.role !== 'CASHIER') {
      const error: ErrorResponse = {
        code: 'FORBIDDEN',
        message: 'No tienes permisos para realizar ventas',
        details: { requiredRoles: ['OWNER', 'CASHIER'] },
      };
      return NextResponse.json(error, { status: 403 });
    }

    const body: CheckoutBody = await req.json();
    const { items, paymentMethod, amountPaid, customerId, discountTotal } = body;

    // Validaciones básicas
    if (!items || items.length === 0) {
      const error: ErrorResponse = {
        code: 'EMPTY_CART',
        message: 'El carrito está vacío',
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar paymentMethod
    if (!paymentMethod || !['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO'].includes(paymentMethod)) {
      const error: ErrorResponse = {
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Método de pago inválido',
        details: { allowedMethods: ['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO'] },
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar amountPaid según método de pago
    if (paymentMethod === 'CASH') {
      if (amountPaid === undefined || amountPaid === null || typeof amountPaid !== 'number') {
        const error: ErrorResponse = {
          code: 'AMOUNT_REQUIRED',
          message: 'Para pagos en efectivo debes especificar el monto pagado',
        };
        return NextResponse.json(error, { status: 400 });
      }

      // Calcular total incluyendo descuentos
      const itemsSubtotal = items.reduce((sum, item) => {
        const subtotalItem = item.quantity * item.unitPrice;
        let discountAmount = 0;
        
        if (item.discountType && item.discountValue) {
          if (item.discountType === 'PERCENT') {
            discountAmount = Math.round((subtotalItem * item.discountValue) / 100 * 100) / 100;
          } else if (item.discountType === 'AMOUNT') {
            discountAmount = item.discountValue;
          }
        }
        
        return sum + (subtotalItem - discountAmount);
      }, 0);
      
      const globalDiscount = discountTotal ?? 0;
      const total = itemsSubtotal - globalDiscount;

      if (amountPaid < total) {
        const error: ErrorResponse = {
          code: 'AMOUNT_INSUFFICIENT',
          message: 'El monto pagado es menor al total',
          details: { total, amountPaid, missing: total - amountPaid },
        };
        return NextResponse.json(error, { status: 409 });
      }
    } else if (paymentMethod === 'FIADO') {
      // Para FIADO, validar customerId
      if (!customerId || typeof customerId !== 'string') {
        const error: ErrorResponse = {
          code: 'CUSTOMER_REQUIRED',
          message: 'Debes seleccionar un cliente para ventas FIADO',
        };
        return NextResponse.json(error, { status: 400 });
      }
      // amountPaid debe ser undefined o null
      if (amountPaid !== undefined && amountPaid !== null) {
        const error: ErrorResponse = {
          code: 'PAYMENT_NOT_ALLOWED',
          message: 'No se puede especificar monto pagado para ventas FIADO',
        };
        return NextResponse.json(error, { status: 400 });
      }
    } else {
      // Para otros métodos, amountPaid debe ser undefined o null
      if (amountPaid !== undefined && amountPaid !== null) {
        const error: ErrorResponse = {
          code: 'PAYMENT_NOT_ALLOWED',
          message: 'No se puede especificar monto pagado para este método de pago',
          details: { paymentMethod },
        };
        return NextResponse.json(error, { status: 403 });
      }
    }

    // Validar formato de items
    for (const item of items) {
      if (!item.storeProductId || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
        const error: ErrorResponse = {
          code: 'INVALID_ITEM_FORMAT',
          message: 'Formato de item inválido',
          details: { requiredFields: ['storeProductId', 'quantity', 'unitPrice'] },
        };
        return NextResponse.json(error, { status: 400 });
      }
    }

    // VALIDACIÓN CRÍTICA: Verificar que hay turno abierto (excepto para FIADO)
    let currentShift = null;
    if (paymentMethod !== 'FIADO') {
      currentShift = await shiftRepo.getCurrentShift(session.storeId, session.userId);

      if (!currentShift) {
        const error: ErrorResponse = {
          code: 'SHIFT_REQUIRED',
          message: 'Debes abrir un turno antes de realizar ventas',
        };
        return NextResponse.json(error, { status: 409 });
      }
    }

    // Ejecutar checkout con reintentos en caso de colisión de saleNumber
    const MAX_RETRIES = 3;
    let result;
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        result = await executeCheckout(
          session,
          items,
          currentShift?.id || null,
          paymentMethod,
          amountPaid,
          customerId,
          discountTotal
        );
        break; // Éxito, salir del bucle
      } catch (error: any) {
        lastError = error;
        
        // Detectar colisión de saleNumber (unique constraint)
        // El target viene como array: ['store_id', 'sale_number']
        const isSaleNumberCollision =
          error.code === 'P2002' &&
          error.meta?.target?.includes('sale_number');

        if (isSaleNumberCollision && attempt < MAX_RETRIES - 1) {
          // Esperar un tiempo aleatorio antes de reintentar (entre 50-150ms)
          // Esto permite que la transacción concurrente termine
          const delay = 50 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Reintentar
        }
        
        // Cualquier otro error o se agotaron los reintentos
        throw lastError;
      }
    }

    // Verificar que result no sea undefined
    if (!result) {
      throw new Error('Checkout failed after retries');
    }

    return NextResponse.json(
      {
        success: true,
        saleId: result.sale.id,
        saleNumber: result.sale.saleNumber,
        total: result.sale.total.toNumber(),
        itemCount: result.saleItems.length,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Checkout error:', error);

    // Errores personalizados
    if (error instanceof CheckoutError) {
      const errorResponse: ErrorResponse = {
        code: error.code,
        message: error.message,
        details: error.details,
      };
      return NextResponse.json(errorResponse, { status: error.statusCode });
    }

    // Errores de Prisma P2002 - Si llegó aquí, el retry interno falló
    if (error.code === 'P2002') {
      const errorResponse: ErrorResponse = {
        code: 'CONSTRAINT_VIOLATION',
        message: 'Violación de restricción única',
        details: error.meta,
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    // Error genérico
    const errorResponse: ErrorResponse = {
      code: 'INTERNAL_ERROR',
      message: 'Error interno al procesar la venta',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
