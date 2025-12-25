import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hash } from 'bcryptjs';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

function isSuperAdmin(email: string): boolean {
  const superadminEmails = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  return superadminEmails.includes(email);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || !isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede crear tiendas desde backup' },
        { status: 403 }
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
          },
        });
      }

      // 3. Upsert ProductMasters
      const productIdMap = new Map<string, string>();
      for (const pm of backupData.productMasters) {
        const existing = pm.barcode
          ? await tx.productMaster.findFirst({ where: { barcode: pm.barcode } })
          : await tx.productMaster.findFirst({ where: { internalSku: pm.internalSku } });

        if (existing) {
          productIdMap.set(pm.id, existing.id);
        } else {
          const newProduct = await tx.productMaster.create({
            data: {
              barcode: pm.barcode,
              internalSku: pm.internalSku,
              name: pm.name,
              content: pm.content,
              unitType: pm.unitType,
            },
          });
          productIdMap.set(pm.id, newProduct.id);
        }
      }

      // 4. Crear Owner principal
      const ownerEmail = backupData.users.find((u: any) => u.role === 'OWNER')?.email || 'owner@restored.com';
      const ownerName = backupData.users.find((u: any) => u.role === 'OWNER')?.name || 'Owner Restaurado';

      // Verificar si existe usuario con el mismo email
      const existingUser = await tx.user.findUnique({ where: { email: ownerEmail } });
      let finalOwnerEmail = ownerEmail;

      if (existingUser) {
        // Generar email alternativo
        const [localPart, domain] = ownerEmail.split('@');
        if (domain) {
          finalOwnerEmail = `${localPart}+restored_${newStore.id}@${domain}`;
        } else {
          finalOwnerEmail = `owner+restored_${newStore.id}@restored.local`;
        }

        // Verificar que el alternativo tampoco exista (por si acaso)
        const existingAlt = await tx.user.findUnique({ where: { email: finalOwnerEmail } });
        if (existingAlt) {
          finalOwnerEmail = `owner+restored_${newStore.id}_${Date.now()}@restored.local`;
        }
      }

      const newOwner = await tx.user.create({
        data: {
          email: finalOwnerEmail,
          name: ownerName,
          password: passwordHash,
          role: 'OWNER',
          storeId: newStore.id,
          active: true,
        },
      });

      // 5. Crear StoreProducts
      const storeProductIdMap = new Map<string, string>();
      for (const sp of backupData.storeProducts) {
        const newProductId = productIdMap.get(sp.productId);
        if (!newProductId) continue;

        const newSP = await tx.storeProduct.create({
          data: {
            storeId: newStore.id,
            productId: newProductId,
            price: sp.price,
            stock: sp.stock,
            minStock: sp.minStock,
            active: sp.active,
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
          },
        });
        customerIdMap.set(customer.id, newCustomer.id);
      }

      // 7. Crear Shifts
      const shiftIdMap = new Map<string, string>();
      for (const shift of backupData.shifts) {
        const newShift = await tx.shift.create({
          data: {
            storeId: newStore.id,
            openedById: newOwner.id,
            openedAt: new Date(shift.openedAt),
            closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
            openingCash: shift.openingCash,
            closingCash: shift.closingCash,
            expectedCash: shift.expectedCash,
            difference: shift.difference,
            notes: shift.notes,
          },
        });
        shiftIdMap.set(shift.id, newShift.id);
      }

      // 8. Crear Sales + SaleItems
      const saleIdMap = new Map<string, string>();
      for (const sale of backupData.sales) {
        const newShiftId = sale.shiftId ? shiftIdMap.get(sale.shiftId) : null;
        const newCustomerId = sale.customerId ? customerIdMap.get(sale.customerId) : null;

        const newSale = await tx.sale.create({
          data: {
            storeId: newStore.id,
            saleNumber: sale.saleNumber,
            subtotal: sale.subtotal,
            tax: sale.tax,
            total: sale.total,
            paymentMethod: sale.paymentMethod,
            amountPaid: sale.amountPaid,
            changeAmount: sale.changeAmount,
            shiftId: newShiftId,
            customerId: newCustomerId,
            userId: newOwner.id,
            createdAt: new Date(sale.createdAt),
            printedAt: sale.printedAt ? new Date(sale.printedAt) : null,
          },
        });
        saleIdMap.set(sale.id, newSale.id);

        // SaleItems
        for (const item of sale.items) {
          const newStoreProductId = storeProductIdMap.get(item.storeProductId);
          if (!newStoreProductId) continue;

          await tx.saleItem.create({
            data: {
              saleId: newSale.id,
              storeProductId: newStoreProductId,
              productName: item.productName,
              productContent: item.productContent,
              unitType: item.unitType,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            },
          });
        }
      }

      // 9. Crear Movements
      for (const movement of backupData.movements) {
        const newStoreProductId = storeProductIdMap.get(movement.storeProductId);
        const newShiftId = movement.shiftId ? shiftIdMap.get(movement.shiftId) : undefined;
        if (!newStoreProductId) continue;

        await tx.movement.create({
          data: {
            storeId: newStore.id,
            storeProductId: newStoreProductId,
            type: movement.type,
            quantity: movement.quantity,
            notes: movement.notes,
            ...(newShiftId && { shiftId: newShiftId }),
            createdById: newOwner.id,
            createdAt: new Date(movement.createdAt),
          },
        });
      }

      // 10. Crear Receivables + Payments
      for (const receivable of backupData.receivables) {
        const newCustomerId = customerIdMap.get(receivable.customerId);
        const newSaleId = saleIdMap.get(receivable.saleId);
        if (!newCustomerId || !newSaleId) continue;

        const newReceivable = await tx.receivable.create({
          data: {
            storeId: newStore.id,
            customerId: newCustomerId,
            saleId: newSaleId,
            originalAmount: receivable.originalAmount,
            balance: receivable.balance,
            status: receivable.status,
            createdById: newOwner.id,
            createdAt: new Date(receivable.createdAt),
            updatedAt: new Date(receivable.updatedAt),
          },
        });

        // ReceivablePayments
        for (const payment of receivable.payments) {
          const newShiftId = payment.shiftId ? shiftIdMap.get(payment.shiftId) : undefined;

          const paymentData: any = {
            storeId: newStore.id,
            receivableId: newReceivable.id,
            amount: payment.amount,
            method: payment.method,
            notes: payment.notes,
            createdById: newOwner.id,
            createdAt: new Date(payment.createdAt),
          };

          if (newShiftId) {
            paymentData.shiftId = newShiftId;
          }

          await tx.receivablePayment.create({
            data: paymentData,
          });
        }
      }

      return { newStore, newOwner, tempPassword };
    });

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
        temporaryPassword: result.tempPassword,
      },
      warning: 'Cambiar password inmediatamente',
      note: 'La tienda fue creada como ARCHIVED. Un SUPERADMIN debe reactivarla para que sea operativa.',
      ...(isLegacyBackup && { 
        legacyWarning: '⚠️ BACKUP LEGACY: Restaurado sin verificación de integridad (sin checksum). Verifica la integridad de los datos manualmente.' 
      })
    });
  } catch (error: any) {
    console.error('Error restoring backup:', error);
    return NextResponse.json(
      { code: 'SERVER_ERROR', message: 'Error al restaurar backup', details: error.message },
      { status: 500 }
    );
  }
}
