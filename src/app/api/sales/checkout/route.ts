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
}

interface CheckoutBody {
  items: CheckoutItem[];
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD';
  amountPaid?: number;
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
  shiftId: string,
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD',
  amountPaid?: number
): Promise<{ sale: any; saleItems: any[] }> {
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

    // 2. Calcular total
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    // 3. Calcular changeAmount si es efectivo
    let changeAmount: number | null = null;
    if (paymentMethod === 'CASH' && amountPaid !== undefined) {
      changeAmount = amountPaid - total;
    }

    // 4. Obtener el siguiente número de venta
    const lastSale = await tx.sale.findFirst({
      where: { storeId: session.storeId },
      orderBy: { saleNumber: 'desc' },
      select: { saleNumber: true },
    });

    const nextSaleNumber = (lastSale?.saleNumber ?? 0) + 1;

    // 5. Crear Sale con paymentMethod y amountPaid
    const sale = await tx.sale.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        shiftId: shiftId,
        saleNumber: nextSaleNumber,
        total: new Prisma.Decimal(total),
        subtotal: new Prisma.Decimal(total),
        tax: new Prisma.Decimal(0),
        paymentMethod: paymentMethod,
        amountPaid: amountPaid !== undefined ? new Prisma.Decimal(amountPaid) : null,
        changeAmount: changeAmount !== null ? new Prisma.Decimal(changeAmount) : null,
      },
    });

    // 5. Crear SaleItems con snapshot de datos
    const saleItems = await Promise.all(
      items.map((item) => {
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
            subtotal: new Prisma.Decimal(item.quantity * item.unitPrice),
          },
        });
      })
    );

    // 6. Crear Movements
    await Promise.all(
      items.map((item) => {
        return tx.movement.create({
          data: {
            storeId: session.storeId,
            storeProductId: item.storeProductId,
            type: 'SALE',
            quantity: new Prisma.Decimal(-item.quantity), // Negativo = salida
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.quantity * item.unitPrice),
            notes: `Venta #${nextSaleNumber}`,
            createdById: session.userId,
          },
        });
      })
    );

    // 7. Actualizar stock
    await Promise.all(
      items.map((item) => {
        const sp = storeProducts.find((p) => p.id === item.storeProductId)!;
        const currentStock = sp.stock ? sp.stock.toNumber() : 0;
        const newStock = currentStock - item.quantity;

        return tx.storeProduct.update({
          where: { id: item.storeProductId },
          data: { stock: new Prisma.Decimal(newStock) },
        });
      })
    );

    return { sale, saleItems };
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
    const { items, paymentMethod, amountPaid } = body;

    // Validaciones básicas
    if (!items || items.length === 0) {
      const error: ErrorResponse = {
        code: 'EMPTY_CART',
        message: 'El carrito está vacío',
      };
      return NextResponse.json(error, { status: 400 });
    }

    // Validar paymentMethod
    if (!paymentMethod || !['CASH', 'YAPE', 'PLIN', 'CARD'].includes(paymentMethod)) {
      const error: ErrorResponse = {
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Método de pago inválido',
        details: { allowedMethods: ['CASH', 'YAPE', 'PLIN', 'CARD'] },
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

      // Calcular total
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

      if (amountPaid < total) {
        const error: ErrorResponse = {
          code: 'AMOUNT_INSUFFICIENT',
          message: 'El monto pagado es menor al total',
          details: { total, amountPaid, missing: total - amountPaid },
        };
        return NextResponse.json(error, { status: 409 });
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

    // VALIDACIÓN CRÍTICA: Verificar que hay turno abierto
    const currentShift = await shiftRepo.getCurrentShift(session.storeId, session.userId);

    if (!currentShift) {
      const error: ErrorResponse = {
        code: 'SHIFT_REQUIRED',
        message: 'Debes abrir un turno antes de realizar ventas',
      };
      return NextResponse.json(error, { status: 409 });
    }

    // Ejecutar checkout con reintentos en caso de colisión de saleNumber
    const MAX_RETRIES = 3;
    let result;
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        result = await executeCheckout(session, items, currentShift.id, paymentMethod, amountPaid);
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
