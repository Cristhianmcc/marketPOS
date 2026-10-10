import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hash } from 'bcryptjs';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { logAudit, getRequestMetadata } from '@/lib/auditLog'; // ✅ MÓDULO 15: Auditoría
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'; // ✅ MÓDULO S8
import {
  restoreFiscalArchive,
  validateFiscalArchiveEnvelope,
} from '@/lib/sunat/fiscalArchive';

function isSuperAdmin(email: string): boolean {
  const superadminEmails = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  return superadminEmails.includes(email);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || (session.role !== 'SUPERADMIN' && !isSuperAdmin(session.email))) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede crear tiendas desde backup' },
        { status: 403 }
      );
    }

    // Limitar por administrador autenticado. En Electron la IP puede ser
    // "unknown", por lo que usarla sola bloquearía a todas las sesiones locales.
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit('backup-restore', `${session.userId}:${clientIP}`);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      await logAudit({
        action: 'BACKUP_RESTORE_RATE_LIMIT',
        entityType: 'STORE',
        severity: 'WARN',
        ip: clientIP,
        meta: { waitSeconds },
      });
      return NextResponse.json(
        { code: 'TOO_MANY_REQUESTS', message: `Demasiadas solicitudes. Intenta en ${waitSeconds}s` },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    // Leer archivo ZIP
    const formData = await request.formData();
    const file = formData.get('backup') as File;
    const allowLegacy = formData.get('allowLegacy') === 'true';

    if (!file) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Archivo de backup requerido' },
        { status: 400 }
      );
    }

    const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
    if (file.size <= 0 || file.size > MAX_BACKUP_BYTES || !file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Selecciona un respaldo ZIP válido de hasta 512 MB' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);

    // Extraer metadata y data
    const metadataEntry = zip.getEntry('metadata.json');
    const dataEntry = zip.getEntry('data.json');

    if (!metadataEntry || !dataEntry) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Backup incompleto: falta metadata.json o data.json' },
        { status: 400 }
      );
    }

    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));

    const dataContent = dataEntry.getData().toString('utf8');
    const backupData = JSON.parse(dataContent);

    const requiredArrays = ['users', 'productMasters', 'storeProducts', 'shifts', 'sales', 'movements', 'customers', 'receivables'];
    if (!backupData?.store?.name || requiredArrays.some(key => !Array.isArray(backupData[key]))) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_DATA', message: 'El respaldo no contiene la estructura requerida' },
        { status: 400 }
      );
    }

    // Validar checksum de integridad (OBLIGATORIO para backups modernos)
    let isLegacyBackup = false;
    
    if (metadata.checksum) {
      // Backup moderno con checksum - VALIDAR OBLIGATORIO
      const expectedChecksum = metadata.checksum.replace('sha256:', '');
      const actualChecksum = crypto.createHash('sha256').update(dataContent, 'utf8').digest('hex');
      
      if (actualChecksum !== expectedChecksum) {
        console.error('[BACKUP RESTORE] Checksum validation failed', {
          expected: expectedChecksum,
          actual: actualChecksum,
          backupVersion: metadata.version,
          user: session.email
        });
        return NextResponse.json(
          { code: 'INVALID_BACKUP_CHECKSUM', message: 'El archivo de backup está corrupto o incompleto' },
          { status: 400 }
        );
      }
      console.log('[BACKUP RESTORE] Checksum validation passed', { checksum: expectedChecksum });
    } else {
      // Backup legacy sin checksum
      if (!allowLegacy) {
        console.warn('[BACKUP RESTORE] Legacy backup rejected - allowLegacy not set', {
          user: session.email,
          storeName: backupData.store?.name
        });
        return NextResponse.json(
          { 
            code: 'LEGACY_BACKUP_NOT_ALLOWED', 
            message: 'Este backup no tiene validación de integridad. Por seguridad, debe exportar un nuevo backup con checksum o contactar al administrador del sistema.' 
          },
          { status: 400 }
        );
      }
      
      // SUPERADMIN permite restore legacy explícitamente
      isLegacyBackup = true;
      console.warn('[BACKUP RESTORE] ⚠️ LEGACY BACKUP RESTORE ALLOWED', {
        user: session.email,
        storeName: backupData.store?.name,
        warning: 'Restaurado sin verificación de integridad (no checksum)',
        timestamp: new Date().toISOString()
      });
    }

    // Validar versión
    if (metadata.version !== '1.0') {
      return NextResponse.json(
        { code: 'UNSUPPORTED_VERSION', message: `Versión de backup no soportada: ${metadata.version}` },
        { status: 400 }
      );
    }

    const actualCounts = {
      users: backupData.users.length,
      productMasters: backupData.productMasters.length,
      storeProducts: backupData.storeProducts.length,
      shifts: backupData.shifts.length,
      sales: backupData.sales.length,
      saleItems: backupData.sales.reduce(
        (sum: number, sale: any) => sum + (Array.isArray(sale.items) ? sale.items.length : 0),
        0
      ),
      movements: backupData.movements.length,
      customers: backupData.customers.length,
      receivables: backupData.receivables.length,
      receivablePayments: backupData.receivables.reduce(
        (sum: number, receivable: any) => sum + (Array.isArray(receivable.payments) ? receivable.payments.length : 0),
        0
      ),
    };
    const mismatchedCount = Object.entries(actualCounts).find(([key, value]) =>
      typeof metadata.counts?.[key] === 'number' && metadata.counts[key] !== value
    );
    if (mismatchedCount) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_COUNTS', message: 'Los conteos del respaldo no coinciden con su contenido' },
        { status: 400 }
      );
    }

    // Generar password temporal
    const tempPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
    const passwordHash = await hash(tempPassword, 10);

    // Transacción para crear todo
    const result = await prisma.$transaction(async (tx) => {
      // Generar nombre con fecha de restauración (formato DD/MM/YYYY)
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const year = now.getFullYear();
      const restoredName = `${backupData.store.name} (Restaurado ${day}/${month}/${year})`;

      // 1. Crear Store como ARCHIVED por defecto
      const newStore = await tx.store.create({
        data: {
          name: restoredName,
          ruc: backupData.store.ruc,
          address: backupData.store.address,
          phone: backupData.store.phone,
          businessProfile: backupData.store.businessProfile || 'BODEGA',
          status: 'ARCHIVED', // Crear como ARCHIVED por seguridad
          archivedAt: new Date(),
        },
      });

      // 2. Crear StoreSettings
      if (backupData.storeSettings) {
        await tx.storeSettings.create({
          data: {
            storeId: newStore.id,
            ticketFooter: backupData.storeSettings.ticketFooter,
            ticketWebsite: backupData.storeSettings.ticketWebsite,
            ticketLogo: backupData.storeSettings.ticketLogo,
            ticketHeaderLine1: backupData.storeSettings.ticketHeaderLine1,
            ticketHeaderLine2: backupData.storeSettings.ticketHeaderLine2,
            taxRate: backupData.storeSettings.taxRate,
            onboardingCompletedAt: backupData.storeSettings.onboardingCompletedAt
              ? new Date(backupData.storeSettings.onboardingCompletedAt)
              : null,
            onboardingStep: backupData.storeSettings.onboardingStep,
            onboardingDismissedAt: backupData.storeSettings.onboardingDismissedAt
              ? new Date(backupData.storeSettings.onboardingDismissedAt)
              : null,
            defaultPaymentMethod: backupData.storeSettings.defaultPaymentMethod,
            expiredBatchPolicy: backupData.storeSettings.expiredBatchPolicy,
            fefoEnabled: backupData.storeSettings.fefoEnabled,
            expiryAlertDays: backupData.storeSettings.expiryAlertDays,
            showExpiredWarnings: backupData.storeSettings.showExpiredWarnings,
          },
        });
      }

      // 3. Upsert ProductMasters
      const productIdMap = new Map<string, string>();
      for (const pm of backupData.productMasters) {
        // barcode e internalSku son únicos. Hay que comprobar ambos: buscar solo
        // por barcode podía intentar crear un SKU que ya existía en el catálogo.
        const [byBarcode, byInternalSku] = await Promise.all([
          pm.barcode
            ? tx.productMaster.findUnique({ where: { barcode: pm.barcode } })
            : Promise.resolve(null),
          tx.productMaster.findUnique({ where: { internalSku: pm.internalSku } }),
        ]);

        if (byBarcode && byInternalSku && byBarcode.id !== byInternalSku.id) {
          throw Object.assign(new Error('El código de barras y el SKU pertenecen a productos distintos'), {
            code: 'RESTORE_CATALOG_CONFLICT',
          });
        }

        const existing = byBarcode || byInternalSku;

        if (existing) {
          productIdMap.set(pm.id, existing.id);
        } else {
          const newProduct = await tx.productMaster.create({
            data: {
              barcode: pm.barcode,
              internalSku: pm.internalSku,
              name: pm.name,
              brand: pm.brand,
              content: pm.content,
              category: pm.category,
              unitType: pm.unitType,
              imageUrl: pm.imageUrl,
              isQuickSell: pm.isQuickSell,
              quickSellOrder: pm.quickSellOrder,
              isGlobal: pm.isGlobal,
              normalizedName: pm.normalizedName,
              fingerprint: pm.fingerprint,
              commercialName: pm.commercialName,
              genericName: pm.genericName,
              concentration: pm.concentration,
              pharmaceuticalForm: pm.pharmaceuticalForm,
              presentation: pm.presentation,
              laboratory: pm.laboratory,
              sanitaryRegistry: pm.sanitaryRegistry,
              requiresPrescription: pm.requiresPrescription,
              medicineCategory: pm.medicineCategory,
              barcodeSecondary: pm.barcodeSecondary,
            },
          });
          productIdMap.set(pm.id, newProduct.id);
        }
      }

      // 4. Recrear usuarios sin reutilizar contraseñas. Cada cuenta recibe una
      // clave temporal nueva porque el respaldo nunca contiene hashes.
      const sourceOwner = backupData.users.find((u: any) => u.role === 'OWNER');
      const sourceUsers = sourceOwner
        ? backupData.users
        : [{ id: '__generated_owner__', email: 'owner@restored.local', name: 'Owner Restaurado', role: 'OWNER', active: true }, ...backupData.users];
      const userIdMap = new Map<string, string>();
      const temporaryCredentials: Array<{ email: string; temporaryPassword: string; role: string }> = [];
      let newOwner: any = null;
      let ownerTemporaryPassword = '';

      const uniqueRestoredEmail = async (sourceEmail: string, index: number) => {
        const normalized = String(sourceEmail || `usuario${index + 1}@restored.local`).trim().toLowerCase();
        if (!(await tx.user.findUnique({ where: { email: normalized } }))) return normalized;
        const at = normalized.lastIndexOf('@');
        const local = at > 0 ? normalized.slice(0, at) : `usuario${index + 1}`;
        const domain = at > 0 ? normalized.slice(at + 1) : 'restored.local';
        let candidate = `${local}+restored_${newStore.id}@${domain}`;
        let suffix = 1;
        while (await tx.user.findUnique({ where: { email: candidate } })) {
          candidate = `${local}+restored_${newStore.id}_${suffix++}@${domain}`;
        }
        return candidate;
      };

      for (const [index, sourceUser] of sourceUsers.entries()) {
        const isFirstOwner = !newOwner && sourceUser.role === 'OWNER';
        const userPassword = isFirstOwner ? tempPassword : `Temp${crypto.randomBytes(6).toString('base64url')}!`;
        const finalEmail = await uniqueRestoredEmail(sourceUser.email, index);
        const restoredUser = await tx.user.create({
          data: {
            email: finalEmail,
            name: sourceUser.name || 'Usuario Restaurado',
            password: isFirstOwner ? passwordHash : await hash(userPassword, 10),
            role: sourceUser.role,
            storeId: newStore.id,
            active: sourceUser.active !== false,
            createdAt: sourceUser.createdAt ? new Date(sourceUser.createdAt) : undefined,
          },
        });
        userIdMap.set(sourceUser.id, restoredUser.id);
        temporaryCredentials.push({ email: finalEmail, temporaryPassword: userPassword, role: sourceUser.role });
        if (isFirstOwner) {
          newOwner = restoredUser;
          ownerTemporaryPassword = userPassword;
        }
      }
      if (!newOwner) throw new Error('No se pudo recrear el usuario OWNER del respaldo');

      // 5. Crear StoreProducts
      const storeProductIdMap = new Map<string, string>();
      for (const sp of backupData.storeProducts) {
        const newProductId = productIdMap.get(sp.productId);
        if (!newProductId) throw new Error('El respaldo contiene un producto de tienda sin producto maestro');

        const newSP = await tx.storeProduct.create({
          data: {
            storeId: newStore.id,
            productId: newProductId,
            price: sp.price,
            costPrice: sp.costPrice,
            stock: sp.stock,
            minStock: sp.minStock,
            active: sp.active,
            publishInCatalog: sp.publishInCatalog,
            catalogTitle: sp.catalogTitle,
            catalogDescription: sp.catalogDescription,
            catalogImagePath: sp.catalogImagePath,
            catalogCategory: sp.catalogCategory,
            catalogVisible: sp.catalogVisible,
            catalogUpdatedAt: sp.catalogUpdatedAt ? new Date(sp.catalogUpdatedAt) : null,
          },
        });
        storeProductIdMap.set(sp.id, newSP.id);
      }

      // 6. Crear Customers
      const customerIdMap = new Map<string, string>();
      for (const customer of backupData.customers) {
        const newCustomer = await tx.customer.create({
          data: {
            storeId: newStore.id,
            name: customer.name,
            phone: customer.phone,
            dni: customer.dni,
            notes: customer.notes,
            active: customer.active,
            isDemo: customer.isDemo ?? false,
          },
        });
        customerIdMap.set(customer.id, newCustomer.id);
      }

      // 7. Crear Shifts
      const shiftIdMap = new Map<string, string>();
      for (const shift of backupData.shifts) {
        const openedById = userIdMap.get(shift.openedById) || newOwner.id;
        const closedById = shift.closedById ? userIdMap.get(shift.closedById) : null;
        if (shift.closedById && !closedById) throw new Error('El respaldo contiene un cierre de turno con usuario inexistente');
        const newShift = await tx.shift.create({
          data: {
            storeId: newStore.id,
            openedById,
            closedById,
            openedAt: new Date(shift.openedAt),
            closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
            openingCash: shift.openingCash,
            closingCash: shift.closingCash,
            expectedCash: shift.expectedCash,
            difference: shift.difference,
            notes: shift.notes,
            isDemo: shift.isDemo ?? false,
          },
        });
        shiftIdMap.set(shift.id, newShift.id);
      }

      // 8. Crear Sales + SaleItems
      const saleIdMap = new Map<string, string>();
      let saleItemsRestored = 0;
      for (const sale of backupData.sales) {
        const newShiftId = sale.shiftId ? shiftIdMap.get(sale.shiftId) : null;
        const newCustomerId = sale.customerId ? customerIdMap.get(sale.customerId) : null;
        const newUserId = userIdMap.get(sale.userId) || newOwner.id;
        if (sale.shiftId && !newShiftId) throw new Error('El respaldo contiene una venta con turno inexistente');
        if (sale.customerId && !newCustomerId) throw new Error('El respaldo contiene una venta con cliente inexistente');

        const newSale = await tx.sale.create({
          data: {
            storeId: newStore.id,
            saleNumber: sale.saleNumber,
            subtotal: sale.subtotal,
            tax: sale.tax,
            total: sale.total,
            discountTotal: sale.discountTotal,
            totalBeforeDiscount: sale.totalBeforeDiscount,
            couponCode: sale.couponCode,
            couponType: sale.couponType,
            couponValue: sale.couponValue,
            couponDiscount: sale.couponDiscount,
            totalBeforeCoupon: sale.totalBeforeCoupon,
            paymentMethod: sale.paymentMethod,
            amountPaid: sale.amountPaid,
            changeAmount: sale.changeAmount,
            paymentDetails: sale.paymentDetails,
            shiftId: newShiftId,
            customerId: newCustomerId,
            userId: newUserId,
            isDemo: sale.isDemo ?? false,
            createdAt: new Date(sale.createdAt),
            printedAt: sale.printedAt ? new Date(sale.printedAt) : null,
          },
        });
        saleIdMap.set(sale.id, newSale.id);

        // SaleItems
        for (const item of sale.items) {
          const newStoreProductId = item.storeProductId ? storeProductIdMap.get(item.storeProductId) : null;
          if (item.storeProductId && !newStoreProductId) {
            throw new Error('El respaldo contiene un detalle de venta con producto inexistente');
          }

          await tx.saleItem.create({
            data: {
              saleId: newSale.id,
              storeProductId: newStoreProductId,
              productName: item.productName,
              productContent: item.productContent,
              unitType: item.unitType,
              // ✅ SUNAT: Restaurar campos si existen en backup
              unitSunatCode: item.unitSunatCode ?? null,
              unitSymbol: item.unitSymbol ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              subtotal: item.subtotal,
              discountType: item.discountType,
              discountValue: item.discountValue,
              discountAmount: item.discountAmount,
              totalLine: item.totalLine,
              promotionType: item.promotionType,
              promotionName: item.promotionName,
              promotionDiscount: item.promotionDiscount,
              categoryPromoName: item.categoryPromoName,
              categoryPromoType: item.categoryPromoType,
              categoryPromoDiscount: item.categoryPromoDiscount,
              volumePromoName: item.volumePromoName,
              volumePromoQty: item.volumePromoQty,
              volumePromoDiscount: item.volumePromoDiscount,
              nthPromoName: item.nthPromoName,
              nthPromoQty: item.nthPromoQty,
              nthPromoPercent: item.nthPromoPercent,
              nthPromoDiscount: item.nthPromoDiscount,
              isService: item.isService ?? false,
              unitCodeUsed: item.unitCodeUsed,
              quantityOriginal: item.quantityOriginal,
              quantityBase: item.quantityBase,
              conversionFactorUsed: item.conversionFactorUsed,
              pricingMode: item.pricingMode,
              sellUnitPriceApplied: item.sellUnitPriceApplied,
              batchBreakdown: item.batchBreakdown,
              commercialName: item.commercialName,
              genericName: item.genericName,
              concentration: item.concentration,
              pharmaceuticalForm: item.pharmaceuticalForm,
              unitSunatCodeUsed: item.unitSunatCodeUsed,
            },
          });
          saleItemsRestored++;
        }
      }

      // 9. Crear Movements
      let movementsRestored = 0;
      for (const movement of backupData.movements) {
        const newStoreProductId = storeProductIdMap.get(movement.storeProductId);
        if (!newStoreProductId) throw new Error('El respaldo contiene un movimiento con producto inexistente');

        await tx.movement.create({
          data: {
            storeId: newStore.id,
            storeProductId: newStoreProductId,
            type: movement.type,
            quantity: movement.quantity,
            unitPrice: movement.unitPrice,
            total: movement.total,
            notes: movement.notes,
            createdById: movement.createdById ? (userIdMap.get(movement.createdById) || newOwner.id) : null,
            isDemo: movement.isDemo ?? false,
            createdAt: new Date(movement.createdAt),
          },
        });
        movementsRestored++;
      }

      // 10. Crear Receivables + Payments
      let receivablesRestored = 0;
      let receivablePaymentsRestored = 0;
      for (const receivable of backupData.receivables) {
        const newCustomerId = customerIdMap.get(receivable.customerId);
        const newSaleId = saleIdMap.get(receivable.saleId);
        if (!newCustomerId || !newSaleId) throw new Error('El respaldo contiene un fiado con venta o cliente inexistente');

        const newReceivable = await tx.receivable.create({
          data: {
            storeId: newStore.id,
            customerId: newCustomerId,
            saleId: newSaleId,
            originalAmount: receivable.originalAmount,
            balance: receivable.balance,
            status: receivable.status,
            createdById: userIdMap.get(receivable.createdById) || newOwner.id,
            isDemo: receivable.isDemo ?? false,
            createdAt: new Date(receivable.createdAt),
            updatedAt: new Date(receivable.updatedAt),
          },
        });
        receivablesRestored++;

        // ReceivablePayments
        for (const payment of receivable.payments) {
          const newShiftId = shiftIdMap.get(payment.shiftId);
          if (!newShiftId) throw new Error('El respaldo contiene un pago de fiado con turno inexistente');

          const paymentData: any = {
            storeId: newStore.id,
            receivableId: newReceivable.id,
            amount: payment.amount,
            method: payment.method,
            notes: payment.notes,
            createdById: userIdMap.get(payment.createdById) || newOwner.id,
            createdAt: new Date(payment.createdAt),
            shiftId: newShiftId,
          };

          await tx.receivablePayment.create({
            data: paymentData,
          });
          receivablePaymentsRestored++;
        }
      }

      // 11. Restaurar archivo fiscal portable después de recrear las ventas.
      // No recupera credenciales SOL, certificado privado ni jobs pendientes.
      // SUNAT queda desactivado hasta que el OWNER vuelva a configurarlo.
      const fiscalArchive = backupData.fiscalArchive
        ? validateFiscalArchiveEnvelope(backupData.fiscalArchive).data
        : null;
      // En BETA el RUC fiscal de prueba puede ser distinto al RUC comercial de
      // la tienda. Ambos valores provienen del mismo data.json verificado; la
      // restauración queda desactivada y en BETA hasta una revisión manual.
      const fiscalRestore = fiscalArchive
        ? await restoreFiscalArchive(
            tx,
            newStore.id,
            fiscalArchive.source.ruc || newStore.ruc,
            fiscalArchive
          )
        : null;

      return {
        newStore,
        newOwner,
        ownerTemporaryPassword,
        temporaryCredentials,
        fiscalRestore,
        restoredCounts: {
          productMasters: productIdMap.size,
          users: userIdMap.size,
          storeProducts: storeProductIdMap.size,
          shifts: shiftIdMap.size,
          sales: saleIdMap.size,
          saleItems: saleItemsRestored,
          movements: movementsRestored,
          customers: customerIdMap.size,
          receivables: receivablesRestored,
          receivablePayments: receivablePaymentsRestored,
          fiscalDocuments: backupData.fiscalArchive?.data?.documents?.length || 0,
        },
      };
    }, {
      // Importar cientos de productos y documentos puede superar los 5 s que
      // Prisma concede por defecto a una transacción interactiva.
      maxWait: 10_000,
      timeout: 120_000,
    });

    // ✅ MÓDULO 15: Log de auditoría (fire-and-forget)
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId: result.newStore.id,
      userId: session.userId,
      action: 'RESTORE_EXECUTED',
      entityType: 'RESTORE',
      entityId: result.newStore.id,
      severity: 'WARN',
      meta: {
        storeName: result.newStore.name,
        backupDate: metadata.createdAt,
        isLegacy: isLegacyBackup,
        allowedLegacy: allowLegacy,
        productsCount: backupData.storeProducts?.length || 0,
        salesCount: backupData.sales?.length || 0,
        fiscalRestore: result.fiscalRestore,
        restoredBy: session.email,
      },
      ip,
      userAgent,
    }).catch(e => console.error('Audit log failed (non-blocking):', e));

    return NextResponse.json({
      success: true,
      message: 'Tienda restaurada exitosamente como ARCHIVED',
      store: {
        id: result.newStore.id,
        name: result.newStore.name,
        status: result.newStore.status,
      },
      owner: {
        email: result.newOwner.email,
        temporaryPassword: result.ownerTemporaryPassword,
      },
      temporaryCredentials: result.temporaryCredentials,
      warning: 'Cambiar password inmediatamente',
      note: 'La tienda fue creada como ARCHIVED. Un SUPERADMIN debe reactivarla para que sea operativa.',
      fiscalRestore: result.fiscalRestore,
      restoredCounts: result.restoredCounts,
      ...(isLegacyBackup && { 
        legacyWarning: '⚠️ BACKUP LEGACY: Restaurado sin verificación de integridad (sin checksum). Verifica la integridad de los datos manualmente.' 
      })
    });
  } catch (error: any) {
    console.error('Error restoring backup:', error);
    
    // ✅ MÓDULO 15: Log de fallo (fire-and-forget)
    try {
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      logAudit({
        storeId: undefined,
        userId: sessionData?.userId,
        action: 'RESTORE_FAILED',
        entityType: 'STORE',
        severity: 'ERROR',
        meta: {
          error: error.message || 'Unknown error',
          restoredBy: sessionData?.email,
        },
        ip,
        userAgent,
      }).catch(e => console.error('Audit log failed (non-blocking):', e));
    } catch {}
    
    if (error?.code === 'RESTORE_CATALOG_CONFLICT' || error?.code === 'P2002') {
      return NextResponse.json(
        {
          code: 'BACKUP_CATALOG_CONFLICT',
          message: 'El respaldo contiene un producto que entra en conflicto con el catálogo actual. No se importó ningún dato.',
        },
        { status: 409 }
      );
    }

    if (error?.code === 'P2028' || /transaction.*(?:closed|timeout|timed out)/i.test(String(error?.message || ''))) {
      return NextResponse.json(
        {
          code: 'BACKUP_RESTORE_TIMEOUT',
          message: 'La restauración tardó más de lo permitido. No se importó ningún dato; puedes reintentar.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'No se pudo restaurar el respaldo. No se importó ningún dato; puedes reintentar.' },
      { status: 500 }
    );
  }
}
