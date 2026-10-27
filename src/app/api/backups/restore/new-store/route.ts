import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { hash } from 'bcryptjs';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { FeatureFlagKey, PlanCode, SubscriptionStatus } from '@prisma/client';
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

async function getLocalAuditUserId(userId?: string): Promise<string | undefined> {
  if (!userId) return undefined;

  try {
    const localUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    return localUser?.id;
  } catch {
    // La auditoría es auxiliar: una sesión SUPERADMIN de nube puede no tener
    // una fila local y un fallo al resolverla nunca debe cambiar el resultado
    // ya confirmado de la restauración.
    return undefined;
  }
}

type ParsedBackupUpload = {
  fileName: string;
  buffer: Buffer;
  allowLegacy: boolean;
};

function readMultipartBackup(body: Buffer, contentType: string): ParsedBackupUpload {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]?.trim();
  if (!boundary) {
    throw new Error('MULTIPART_BOUNDARY_MISSING');
  }

  const marker = Buffer.from(`--${boundary}`);
  const nextMarker = Buffer.from(`\r\n--${boundary}`);
  let cursor = body.indexOf(marker);
  let fileName = '';
  let fileBuffer: Buffer | null = null;
  let allowLegacy = false;

  while (cursor >= 0) {
    cursor += marker.length;
    if (body.subarray(cursor, cursor + 2).toString('ascii') === '--') break;
    if (body.subarray(cursor, cursor + 2).toString('ascii') === '\r\n') cursor += 2;

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd < 0) throw new Error('MULTIPART_HEADERS_INVALID');

    const headers = body.subarray(cursor, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const dataEnd = body.indexOf(nextMarker, dataStart);
    if (dataEnd < 0) throw new Error('MULTIPART_BODY_INCOMPLETE');

    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const fieldName = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1] || '';
    const encodedFileName = disposition.match(/(?:^|;)\s*filename\*=UTF-8''([^;\r\n]+)/i)?.[1];
    const regularFileName = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1];

    if (fieldName === 'backup' && (encodedFileName || regularFileName)) {
      try {
        fileName = encodedFileName ? decodeURIComponent(encodedFileName) : (regularFileName || '');
      } catch {
        fileName = regularFileName || '';
      }
      fileBuffer = body.subarray(dataStart, dataEnd);
    } else if (fieldName === 'allowLegacy') {
      allowLegacy = body.subarray(dataStart, dataEnd).toString('utf8').trim() === 'true';
    }

    cursor = body.indexOf(marker, dataEnd + 2);
  }

  if (!fileBuffer) throw new Error('MULTIPART_BACKUP_MISSING');
  return { fileName, buffer: fileBuffer, allowLegacy };
}

export async function POST(request: NextRequest) {
  let restorePhase = 'AUTH';
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

    const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
    const contentType = request.headers.get('content-type') || '';
    const normalizedContentType = contentType.toLowerCase();
    let fileName = '';
    let fileSize = 0;
    let allowLegacy = false;
    let buffer: Buffer;

    if (normalizedContentType.includes('application/zip') || normalizedContentType.includes('application/octet-stream')) {
      restorePhase = 'VALIDATE_UPLOAD';
      const encodedFileName = request.headers.get('x-backup-filename') || '';
      try {
        fileName = decodeURIComponent(encodedFileName);
      } catch {
        fileName = '';
      }
      allowLegacy = request.headers.get('x-allow-legacy') === 'true';

      const declaredSize = Number(request.headers.get('content-length') || 0);
      if (!fileName.toLowerCase().endsWith('.zip') || declaredSize > MAX_BACKUP_BYTES) {
        return NextResponse.json(
          { code: 'INVALID_BACKUP_FILE', message: 'Selecciona un respaldo ZIP válido de hasta 512 MB' },
          { status: 400 }
        );
      }

      restorePhase = 'READ_ZIP_BUFFER';
      buffer = Buffer.from(await request.arrayBuffer());
      fileSize = buffer.length;
    } else if (normalizedContentType.includes('multipart/form-data')) {
      // Compatibilidad con pantallas web anteriores que pueden permanecer en
      // la caché de Electron. El parser nativo Request.formData() falla en el
      // standalone; leer los bytes conserva intacto el ZIP.
      restorePhase = 'READ_MULTIPART';
      const declaredSize = Number(request.headers.get('content-length') || 0);
      if (declaredSize > MAX_BACKUP_BYTES + 1024 * 1024) {
        return NextResponse.json(
          { code: 'INVALID_BACKUP_FILE', message: 'Selecciona un respaldo ZIP válido de hasta 512 MB' },
          { status: 400 }
        );
      }

      const multipartBody = Buffer.from(await request.arrayBuffer());
      const parsed = readMultipartBackup(multipartBody, contentType);
      fileName = parsed.fileName;
      buffer = parsed.buffer;
      fileSize = buffer.length;
      allowLegacy = parsed.allowLegacy;
    } else {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Formato de carga no compatible' },
        { status: 415 }
      );
    }

    restorePhase = 'VALIDATE_UPLOAD';
    if (fileSize <= 0 || fileSize > MAX_BACKUP_BYTES || !fileName.toLowerCase().endsWith('.zip')) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Selecciona un respaldo ZIP válido de hasta 512 MB' },
        { status: 400 }
      );
    }

    restorePhase = 'OPEN_ZIP';
    const zip = new AdmZip(buffer);

    // Extraer metadata y data
    restorePhase = 'READ_ZIP_ENTRIES';
    const metadataEntry = zip.getEntry('metadata.json');
    const dataEntry = zip.getEntry('data.json');

    if (!metadataEntry || !dataEntry) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_FILE', message: 'Backup incompleto: falta metadata.json o data.json' },
        { status: 400 }
      );
    }

    restorePhase = 'PARSE_METADATA';
    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));

    restorePhase = 'PARSE_DATA';
    const dataContent = dataEntry.getData().toString('utf8');
    const backupData = JSON.parse(dataContent);

    restorePhase = 'VALIDATE_DATA_STRUCTURE';
    const requiredArrays = ['users', 'productMasters', 'storeProducts', 'shifts', 'sales', 'movements', 'customers', 'receivables'];
    if (!backupData?.store?.name || requiredArrays.some(key => !Array.isArray(backupData[key]))) {
      return NextResponse.json(
        { code: 'INVALID_BACKUP_DATA', message: 'El respaldo no contiene la estructura requerida' },
        { status: 400 }
      );
    }

    restorePhase = 'VALIDATE_CHECKSUM';
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

    // Validar versión. 1.1 agrega los módulos por rubro; 1.0 sigue siendo
    // compatible y sus secciones nuevas se consideran vacías.
    if (!['1.0', '1.1'].includes(metadata.version)) {
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
    } as Record<string, number>;
    // Secciones 1.1: se validan solo si el respaldo las contiene.
    const sectionArrays = [
      'units', 'categories', 'unitConversions', 'sellUnitPrices', 'productBatches', 'services',
      'suppliers', 'purchaseOrders', 'workOrders', 'patients', 'patientMedications',
      'controlledBookEntries', 'drugInteractionLogs', 'promotions', 'coupons',
      'categoryPromotions', 'volumePromotions', 'nthPromotions',
    ];
    for (const key of sectionArrays) {
      if (backupData[key] === undefined) continue;
      if (!Array.isArray(backupData[key])) {
        return NextResponse.json(
          { code: 'INVALID_BACKUP_DATA', message: 'El respaldo no contiene la estructura requerida' },
          { status: 400 }
        );
      }
      actualCounts[key] = backupData[key].length;
    }
    const nestedCount = (key: string) => (Array.isArray(backupData[key])
      ? backupData[key].reduce((sum: number, row: any) => sum + (Array.isArray(row.items) ? row.items.length : 0), 0)
      : undefined);
    const purchaseOrderItemsCount = nestedCount('purchaseOrders');
    const workOrderItemsCount = nestedCount('workOrders');
    if (purchaseOrderItemsCount !== undefined) actualCounts.purchaseOrderItems = purchaseOrderItemsCount;
    if (workOrderItemsCount !== undefined) actualCounts.workOrderItems = workOrderItemsCount;
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

    restorePhase = 'START_TRANSACTION';
    // Transacción para crear todo
    const result = await prisma.$transaction(async (tx) => {
      // Generar nombre con fecha de restauración (formato DD/MM/YYYY)
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const year = now.getFullYear();
      const restoredName = `${backupData.store.name} (Restaurado ${day}/${month}/${year})`;

      // 1. Crear Store como ARCHIVED por defecto
      restorePhase = 'CREATE_STORE';
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
        restorePhase = 'RESTORE_SETTINGS';
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

      // 2.1 Restaurar el plan y los permisos comerciales cuando el respaldo
      // los incluye. Los ZIP anteriores siguen siendo compatibles y quedan
      // sin plan hasta que el SUPERADMIN lo asigne explícitamente.
      if (backupData.subscription) {
        const sourceSubscription = backupData.subscription;
        const validPlans = Object.values(PlanCode);
        const validStatuses = Object.values(SubscriptionStatus);
        if (!validPlans.includes(sourceSubscription.planCode)) {
          throw new Error('El respaldo contiene un plan de suscripción inválido');
        }
        if (!validStatuses.includes(sourceSubscription.status)) {
          throw new Error('El respaldo contiene un estado de suscripción inválido');
        }

        restorePhase = 'RESTORE_SUBSCRIPTION';
        await tx.subscription.create({
          data: {
            storeId: newStore.id,
            planCode: sourceSubscription.planCode,
            status: sourceSubscription.status,
            startAt: new Date(sourceSubscription.startAt),
            trialEndsAt: sourceSubscription.trialEndsAt ? new Date(sourceSubscription.trialEndsAt) : null,
            currentPeriodStart: new Date(sourceSubscription.currentPeriodStart),
            currentPeriodEnd: new Date(sourceSubscription.currentPeriodEnd),
            graceEndsAt: sourceSubscription.graceEndsAt ? new Date(sourceSubscription.graceEndsAt) : null,
            suspendedAt: sourceSubscription.suspendedAt ? new Date(sourceSubscription.suspendedAt) : null,
            cancelledAt: sourceSubscription.cancelledAt ? new Date(sourceSubscription.cancelledAt) : null,
            priceAmount: sourceSubscription.priceAmount,
            priceCurrency: sourceSubscription.priceCurrency || 'PEN',
            billingCycle: sourceSubscription.billingCycle || 'MONTHLY',
          },
        });
      }

      if (Array.isArray(backupData.featureFlags)) {
        const validFlagKeys = Object.values(FeatureFlagKey);
        const restoredFlags = backupData.featureFlags
          .filter((flag: any) => validFlagKeys.includes(flag.key))
          .map((flag: any) => ({
            storeId: newStore.id,
            key: flag.key,
            enabled: flag.enabled === true,
          }));

        if (restoredFlags.length > 0) {
          restorePhase = 'RESTORE_FEATURE_FLAGS';
          await tx.featureFlag.createMany({ data: restoredFlags, skipDuplicates: true });
        }
      }

      // Los respaldos 1.0 no traen las secciones por rubro. Si una sección
      // existe, toda referencia a ella debe resolverse; si no existe, la
      // referencia se omite como hasta ahora.
      const hasSection = (key: string) => Array.isArray(backupData[key]);
      const mapReference = (
        map: Map<string, string>,
        sourceId: string | null | undefined,
        section: string,
        label: string,
      ): string | null => {
        if (!sourceId) return null;
        const mapped = map.get(sourceId);
        if (mapped) return mapped;
        if (hasSection(section)) throw new Error(`El respaldo contiene ${label} con una referencia inexistente`);
        return null;
      };
      const optionalDate = (value: string | null | undefined) => (value ? new Date(value) : null);

      // 2.2 Unidades: son globales y cada instalación tiene sus propios IDs.
      // Se traducen por código y solo se crean las que faltan; una unidad
      // existente nunca se modifica.
      const unitIdMap = new Map<string, string>();
      if (hasSection('units')) {
        restorePhase = 'RESTORE_UNITS';
        for (const unit of backupData.units) {
          if (!unit?.code) throw new Error('El respaldo contiene una unidad sin código');
          const existing = await tx.unit.findUnique({ where: { code: unit.code } });
          if (existing) {
            unitIdMap.set(unit.id, existing.id);
            continue;
          }
          const sunatCodeTaken = unit.sunatCode
            ? await tx.unit.findUnique({ where: { sunatCode: unit.sunatCode } })
            : null;
          const created = await tx.unit.create({
            data: {
              code: unit.code,
              sunatCode: sunatCodeTaken ? null : unit.sunatCode,
              name: unit.name,
              displayName: unit.displayName,
              symbol: unit.symbol,
              kind: unit.kind,
              allowDecimals: unit.allowDecimals,
              precision: unit.precision,
              isBase: unit.isBase,
              active: unit.active,
              sortOrder: unit.sortOrder,
            },
          });
          unitIdMap.set(unit.id, created.id);
        }
      }

      // 2.3 Categorías en dos pasos para conservar la jerarquía.
      const categoryIdMap = new Map<string, string>();
      if (hasSection('categories')) {
        restorePhase = 'RESTORE_CATEGORIES';
        for (const category of backupData.categories) {
          const created = await tx.category.create({
            data: {
              storeId: newStore.id,
              name: category.name,
              slug: category.slug,
              color: category.color,
              icon: category.icon,
              sortOrder: category.sortOrder,
              active: category.active,
            },
          });
          categoryIdMap.set(category.id, created.id);
        }
        for (const category of backupData.categories) {
          if (!category.parentId) continue;
          await tx.category.update({
            where: { id: categoryIdMap.get(category.id)! },
            data: { parentId: mapReference(categoryIdMap, category.parentId, 'categories', 'una categoría') },
          });
        }
      }

      // 2.4 Límites operativos y catálogo público. El catálogo queda
      // deshabilitado y sin slug para no publicar dos tiendas con la misma URL.
      if (backupData.operationalLimit) {
        restorePhase = 'RESTORE_OPERATIONAL_LIMITS';
        const limit = backupData.operationalLimit;
        await tx.operationalLimit.create({
          data: {
            storeId: newStore.id,
            maxDiscountPercent: limit.maxDiscountPercent,
            maxManualDiscountAmount: limit.maxManualDiscountAmount,
            maxSaleTotal: limit.maxSaleTotal,
            maxItemsPerSale: limit.maxItemsPerSale,
            maxReceivableBalance: limit.maxReceivableBalance,
          },
        });
      }
      if (backupData.catalogSettings) {
        restorePhase = 'RESTORE_CATALOG_SETTINGS';
        const catalog = backupData.catalogSettings;
        await tx.catalogSettings.create({
          data: {
            storeId: newStore.id,
            enabled: false,
            storeName: catalog.storeName,
            storeSlug: null,
            storeLogoPath: catalog.storeLogoPath,
            storeBannerPath: catalog.storeBannerPath,
            whatsappNumber: catalog.whatsappNumber,
            facebookUrl: catalog.facebookUrl,
            instagramUrl: catalog.instagramUrl,
            tiktokUrl: catalog.tiktokUrl,
            catalogStatus: 'DISABLED',
            syncMode: catalog.syncMode,
          },
        });
      }

      // 3. Upsert ProductMasters
      const productIdMap = new Map<string, string>();
      restorePhase = 'RESTORE_PRODUCT_MASTERS';
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
              baseUnitId: mapReference(unitIdMap, pm.baseUnitId, 'units', 'un producto con unidad base'),
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
      restorePhase = 'RESTORE_USERS';

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
      restorePhase = 'RESTORE_STORE_PRODUCTS';
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
            // Respaldos anteriores no traen tributos: productos gravados sin ICBPER.
            igvAffectation: sp.igvAffectation ?? 'GRAVADO',
            icbper: sp.icbper === true,
          },
        });
        storeProductIdMap.set(sp.id, newSP.id);
      }

      const requireProductMaster = (sourceId: string, label: string) => {
        const mapped = productIdMap.get(sourceId);
        if (!mapped) throw new Error(`El respaldo contiene ${label} con un producto inexistente`);
        return mapped;
      };
      const requireStoreProduct = (sourceId: string, label: string) => {
        const mapped = storeProductIdMap.get(sourceId);
        if (!mapped) throw new Error(`El respaldo contiene ${label} con un producto de tienda inexistente`);
        return mapped;
      };

      // 5.1 Conversiones y precios por presentación.
      if (hasSection('unitConversions')) {
        restorePhase = 'RESTORE_UNIT_CONVERSIONS';
        for (const conversion of backupData.unitConversions) {
          await tx.unitConversion.create({
            data: {
              storeId: newStore.id,
              productMasterId: requireProductMaster(conversion.productMasterId, 'una conversión de unidades'),
              fromUnitId: mapReference(unitIdMap, conversion.fromUnitId, 'units', 'una conversión de unidades')!,
              toUnitId: mapReference(unitIdMap, conversion.toUnitId, 'units', 'una conversión de unidades')!,
              factorToBase: conversion.factorToBase,
              roundingMode: conversion.roundingMode,
              active: conversion.active,
            },
          });
        }
      }
      if (hasSection('sellUnitPrices')) {
        restorePhase = 'RESTORE_SELL_UNIT_PRICES';
        for (const sellPrice of backupData.sellUnitPrices) {
          await tx.sellUnitPrice.create({
            data: {
              storeId: newStore.id,
              productMasterId: requireProductMaster(sellPrice.productMasterId, 'un precio por presentación'),
              sellUnitId: mapReference(unitIdMap, sellPrice.sellUnitId, 'units', 'un precio por presentación')!,
              price: sellPrice.price,
              active: sellPrice.active,
              notes: sellPrice.notes,
            },
          });
        }
      }

      // 5.2 Lotes antes de movimientos, para conservar su trazabilidad.
      const batchIdMap = new Map<string, string>();
      if (hasSection('productBatches')) {
        restorePhase = 'RESTORE_PRODUCT_BATCHES';
        for (const batch of backupData.productBatches) {
          const created = await tx.productBatch.create({
            data: {
              storeId: newStore.id,
              storeProductId: requireStoreProduct(batch.storeProductId, 'un lote'),
              batchNumber: batch.batchNumber,
              expiryDate: new Date(batch.expiryDate),
              purchaseDate: optionalDate(batch.purchaseDate),
              quantityInitial: batch.quantityInitial,
              quantityAvailable: batch.quantityAvailable,
              unitCost: batch.unitCost,
              active: batch.active,
              notes: batch.notes,
              createdAt: optionalDate(batch.createdAt) ?? undefined,
            },
          });
          batchIdMap.set(batch.id, created.id);
        }
      }

      // 5.3 Servicios antes de las ventas que los referencian.
      const serviceIdMap = new Map<string, string>();
      if (hasSection('services')) {
        restorePhase = 'RESTORE_SERVICES';
        for (const service of backupData.services) {
          const created = await tx.service.create({
            data: {
              storeId: newStore.id,
              name: service.name,
              price: service.price,
              taxable: service.taxable,
              active: service.active,
              baseUnitId: mapReference(unitIdMap, service.baseUnitId, 'units', 'un servicio'),
            },
          });
          serviceIdMap.set(service.id, created.id);
        }
      }

      // 5.4 Proveedores.
      const supplierIdMap = new Map<string, string>();
      if (hasSection('suppliers')) {
        restorePhase = 'RESTORE_SUPPLIERS';
        for (const supplier of backupData.suppliers) {
          const created = await tx.supplier.create({
            data: {
              storeId: newStore.id,
              name: supplier.name,
              ruc: supplier.ruc,
              contactName: supplier.contactName,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address,
              notes: supplier.notes,
              active: supplier.active,
            },
          });
          supplierIdMap.set(supplier.id, created.id);
        }
      }

      // 6. Crear Customers
      const customerIdMap = new Map<string, string>();
      restorePhase = 'RESTORE_CUSTOMERS';
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
      restorePhase = 'RESTORE_SHIFTS';
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
            createdAt: optionalDate(shift.createdAt) ?? undefined,
          },
        });
        shiftIdMap.set(shift.id, newShift.id);
      }

      // 8. Crear Sales + SaleItems
      const saleIdMap = new Map<string, string>();
      let saleItemsRestored = 0;
      restorePhase = 'RESTORE_SALES';
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
            icbperTotal: sale.icbperTotal ?? 0,
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
              serviceId: mapReference(serviceIdMap, item.serviceId, 'services', 'una venta de servicio'),
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
              igvAffectation: item.igvAffectation ?? 'GRAVADO',
              taxableAmount: item.taxableAmount ?? null,
              igvAmount: item.igvAmount ?? null,
              icbperQuantity: item.icbperQuantity ?? null,
              icbperAmount: item.icbperAmount ?? 0,
            },
          });
          saleItemsRestored++;
        }
      }

      // 9. Crear Movements
      let movementsRestored = 0;
      restorePhase = 'RESTORE_MOVEMENTS';
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
            batchId: mapReference(batchIdMap, movement.batchId, 'productBatches', 'un movimiento de lote'),
            isDemo: movement.isDemo ?? false,
            createdAt: new Date(movement.createdAt),
          },
        });
        movementsRestored++;
      }

      // 10. Crear Receivables + Payments
      let receivablesRestored = 0;
      let receivablePaymentsRestored = 0;
      restorePhase = 'RESTORE_RECEIVABLES';
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

      const requireSale = (sourceId: string, label: string) => {
        const mapped = saleIdMap.get(sourceId);
        if (!mapped) throw new Error(`El respaldo contiene ${label} con una venta inexistente`);
        return mapped;
      };

      // 10.1 Órdenes de compra con sus ítems.
      let purchaseOrderItemsRestored = 0;
      if (hasSection('purchaseOrders')) {
        restorePhase = 'RESTORE_PURCHASE_ORDERS';
        for (const order of backupData.purchaseOrders) {
          const supplierId = supplierIdMap.get(order.supplierId);
          if (!supplierId) throw new Error('El respaldo contiene una orden de compra con proveedor inexistente');
          await tx.purchaseOrder.create({
            data: {
              storeId: newStore.id,
              supplierId,
              createdById: userIdMap.get(order.createdById) || newOwner.id,
              orderNumber: order.orderNumber,
              status: order.status,
              notes: order.notes,
              totalAmount: order.totalAmount,
              expectedDate: optionalDate(order.expectedDate),
              receivedAt: optionalDate(order.receivedAt),
              createdAt: new Date(order.createdAt),
              items: {
                create: (order.items || []).map((item: any) => ({
                  storeProductId: requireStoreProduct(item.storeProductId, 'un ítem de compra'),
                  quantityOrdered: item.quantityOrdered,
                  quantityReceived: item.quantityReceived,
                  unitCost: item.unitCost,
                  batchNumber: item.batchNumber,
                  expiryDate: optionalDate(item.expiryDate),
                })),
              },
            },
          });
          purchaseOrderItemsRestored += (order.items || []).length;
        }
      }

      // 10.2 Órdenes de trabajo, enlazadas a la venta en que se cobraron.
      let workOrderItemsRestored = 0;
      if (hasSection('workOrders')) {
        restorePhase = 'RESTORE_WORK_ORDERS';
        for (const order of backupData.workOrders) {
          await tx.workOrder.create({
            data: {
              storeId: newStore.id,
              orderNumber: order.orderNumber,
              customerId: mapReference(customerIdMap, order.customerId, 'customers', 'una orden de trabajo'),
              status: order.status,
              notes: order.notes,
              subtotal: order.subtotal,
              discount: order.discount,
              total: order.total,
              saleId: order.saleId ? requireSale(order.saleId, 'una orden de trabajo') : null,
              createdAt: new Date(order.createdAt),
              items: {
                create: (order.items || []).map((item: any) => ({
                  type: item.type,
                  storeProductId: item.storeProductId ? requireStoreProduct(item.storeProductId, 'un ítem de orden de trabajo') : null,
                  serviceId: mapReference(serviceIdMap, item.serviceId, 'services', 'un ítem de orden de trabajo'),
                  itemName: item.itemName,
                  itemContent: item.itemContent,
                  unitIdUsed: mapReference(unitIdMap, item.unitIdUsed, 'units', 'un ítem de orden de trabajo'),
                  quantityOriginal: item.quantityOriginal,
                  quantityBase: item.quantityBase,
                  conversionFactor: item.conversionFactor,
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                  notes: item.notes,
                })),
              },
            },
          });
          workOrderItemsRestored += (order.items || []).length;
        }
      }

      // 10.3 Farmacia: pacientes, medicación dispensada, libro de controlados
      // e interacciones. Son registros sanitarios: se conservan sus fechas.
      const patientIdMap = new Map<string, string>();
      if (hasSection('patients')) {
        restorePhase = 'RESTORE_PATIENTS';
        for (const patient of backupData.patients) {
          const created = await tx.patient.create({
            data: {
              storeId: newStore.id,
              dni: patient.dni,
              name: patient.name,
              phone: patient.phone,
              birthDate: optionalDate(patient.birthDate),
              gender: patient.gender,
              address: patient.address,
              allergies: patient.allergies,
              conditions: patient.conditions,
              notes: patient.notes,
              active: patient.active,
            },
          });
          patientIdMap.set(patient.id, created.id);
        }
      }
      if (hasSection('patientMedications')) {
        restorePhase = 'RESTORE_PATIENT_MEDICATIONS';
        for (const medication of backupData.patientMedications) {
          const patientId = patientIdMap.get(medication.patientId);
          if (!patientId) throw new Error('El respaldo contiene medicación de un paciente inexistente');
          await tx.patientMedication.create({
            data: {
              patientId,
              saleId: requireSale(medication.saleId, 'una medicación dispensada'),
              productName: medication.productName,
              genericName: medication.genericName,
              concentration: medication.concentration,
              quantity: medication.quantity,
              prescribedBy: medication.prescribedBy,
              dosage: medication.dosage,
              consultReason: medication.consultReason,
              notes: medication.notes,
              dispensedAt: new Date(medication.dispensedAt),
            },
          });
        }
      }
      if (hasSection('controlledBookEntries')) {
        restorePhase = 'RESTORE_CONTROLLED_BOOK';
        for (const entry of backupData.controlledBookEntries) {
          await tx.controlledBookEntry.create({
            data: {
              storeId: newStore.id,
              saleId: requireSale(entry.saleId, 'un registro del libro de controlados'),
              saleNumber: entry.saleNumber,
              saleDate: new Date(entry.saleDate),
              productName: entry.productName,
              genericName: entry.genericName,
              concentration: entry.concentration,
              laboratory: entry.laboratory,
              batchNumber: entry.batchNumber,
              quantity: entry.quantity,
              prescriptionNumber: entry.prescriptionNumber,
              prescribedBy: entry.prescribedBy,
              cmpNumber: entry.cmpNumber,
              patientId: mapReference(patientIdMap, entry.patientId, 'patients', 'un registro del libro de controlados'),
              patientName: entry.patientName,
              patientDni: entry.patientDni,
              dispensedById: userIdMap.get(entry.dispensedById) || newOwner.id,
              dispensedByName: entry.dispensedByName,
              notes: entry.notes,
              createdAt: new Date(entry.createdAt),
            },
          });
        }
      }
      if (hasSection('drugInteractionLogs')) {
        restorePhase = 'RESTORE_DRUG_INTERACTION_LOGS';
        for (const log of backupData.drugInteractionLogs) {
          await tx.drugInteractionLog.create({
            data: {
              storeId: newStore.id,
              saleId: log.saleId ? requireSale(log.saleId, 'un registro de interacción') : null,
              patientId: mapReference(patientIdMap, log.patientId, 'patients', 'un registro de interacción'),
              drugA: log.drugA,
              drugB: log.drugB,
              severity: log.severity,
              description: log.description,
              action: log.action,
              acknowledgedBy: log.acknowledgedBy,
              createdAt: new Date(log.createdAt),
            },
          });
        }
      }

      // 10.4 Promociones y cupones. Los cupones conservan sus usos.
      restorePhase = 'RESTORE_PROMOTIONS';
      for (const promotion of hasSection('promotions') ? backupData.promotions : []) {
        await tx.promotion.create({
          data: {
            storeId: newStore.id,
            type: promotion.type,
            name: promotion.name,
            active: promotion.active,
            productId: promotion.productId ? requireProductMaster(promotion.productId, 'una promoción') : null,
            minQty: promotion.minQty,
            packPrice: promotion.packPrice,
            happyStart: optionalDate(promotion.happyStart),
            happyEnd: optionalDate(promotion.happyEnd),
            happyPrice: promotion.happyPrice,
            startsAt: optionalDate(promotion.startsAt),
            endsAt: optionalDate(promotion.endsAt),
            isDemo: promotion.isDemo ?? false,
          },
        });
      }
      for (const coupon of hasSection('coupons') ? backupData.coupons : []) {
        await tx.coupon.create({
          data: {
            storeId: newStore.id,
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            minTotal: coupon.minTotal,
            startsAt: optionalDate(coupon.startsAt),
            endsAt: optionalDate(coupon.endsAt),
            maxUses: coupon.maxUses,
            usesCount: coupon.usesCount,
            active: coupon.active,
            isDemo: coupon.isDemo ?? false,
          },
        });
      }
      for (const promotion of hasSection('categoryPromotions') ? backupData.categoryPromotions : []) {
        await tx.categoryPromotion.create({
          data: {
            storeId: newStore.id,
            name: promotion.name,
            category: promotion.category,
            type: promotion.type,
            value: promotion.value,
            startsAt: optionalDate(promotion.startsAt),
            endsAt: optionalDate(promotion.endsAt),
            active: promotion.active,
            isDemo: promotion.isDemo ?? false,
            maxDiscountPerItem: promotion.maxDiscountPerItem,
          },
        });
      }
      for (const promotion of hasSection('volumePromotions') ? backupData.volumePromotions : []) {
        await tx.volumePromotion.create({
          data: {
            storeId: newStore.id,
            name: promotion.name,
            productId: requireProductMaster(promotion.productId, 'una promoción por volumen'),
            type: promotion.type,
            requiredQty: promotion.requiredQty,
            packPrice: promotion.packPrice,
            startsAt: optionalDate(promotion.startsAt),
            endsAt: optionalDate(promotion.endsAt),
            active: promotion.active,
            isDemo: promotion.isDemo ?? false,
          },
        });
      }
      for (const promotion of hasSection('nthPromotions') ? backupData.nthPromotions : []) {
        await tx.nthPromotion.create({
          data: {
            storeId: newStore.id,
            name: promotion.name,
            productId: requireProductMaster(promotion.productId, 'una promoción n-ésima'),
            type: promotion.type,
            nthQty: promotion.nthQty,
            percentOff: promotion.percentOff,
            startsAt: optionalDate(promotion.startsAt),
            endsAt: optionalDate(promotion.endsAt),
            active: promotion.active,
            isDemo: promotion.isDemo ?? false,
          },
        });
      }

      // 11. Restaurar archivo fiscal portable después de recrear las ventas.
      // No recupera credenciales SOL, certificado privado ni jobs pendientes.
      // SUNAT queda desactivado hasta que el OWNER vuelva a configurarlo.
      restorePhase = 'VALIDATE_FISCAL_ARCHIVE';
      const fiscalArchive = backupData.fiscalArchive
        ? validateFiscalArchiveEnvelope(backupData.fiscalArchive).data
        : null;
      // En BETA el RUC fiscal de prueba puede ser distinto al RUC comercial de
      // la tienda. Ambos valores provienen del mismo data.json verificado; la
      // restauración queda desactivada y en BETA hasta una revisión manual.
      restorePhase = 'RESTORE_FISCAL_ARCHIVE';
      const fiscalRestore = fiscalArchive
        ? await restoreFiscalArchive(
            tx,
            newStore.id,
            fiscalArchive.source.ruc || newStore.ruc,
            fiscalArchive
          )
        : null;

      restorePhase = 'COMMIT_TRANSACTION';

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
          categories: categoryIdMap.size,
          productBatches: batchIdMap.size,
          services: serviceIdMap.size,
          suppliers: supplierIdMap.size,
          purchaseOrders: hasSection('purchaseOrders') ? backupData.purchaseOrders.length : 0,
          purchaseOrderItems: purchaseOrderItemsRestored,
          workOrders: hasSection('workOrders') ? backupData.workOrders.length : 0,
          workOrderItems: workOrderItemsRestored,
          patients: patientIdMap.size,
          controlledBookEntries: hasSection('controlledBookEntries') ? backupData.controlledBookEntries.length : 0,
          fiscalDocuments: backupData.fiscalArchive?.data?.documents?.length || 0,
        },
      };
    }, {
      // Importar cientos de productos y documentos puede superar los 5 s que
      // Prisma concede por defecto a una transacción interactiva.
      maxWait: 10_000,
      timeout: 120_000,
    });

    restorePhase = 'AUDIT_SUCCESS';
    // Persistir la auditoría antes de responder para no perder el diagnóstico
    // si el proceso local termina inmediatamente después de la petición.
    const { ip, userAgent } = getRequestMetadata(request);
    const localAuditUserId = await getLocalAuditUserId(session.userId);
    await logAudit({
      storeId: result.newStore.id,
      userId: localAuditUserId,
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
    
    // Persistir el fallo antes de responder. La auditoría es tolerante a
    // errores y nunca reemplaza el resultado de la restauración.
    try {
      const { ip, userAgent } = getRequestMetadata(request);
      const sessionData = await getSession();
      
      // El SUPERADMIN puede provenir de la base de nube y no existir en la
      // base local. AuditLog.userId tiene FK local, por lo que solo se asocia
      // cuando el usuario realmente existe en esta base.
      const localAuditUserId = await getLocalAuditUserId(sessionData?.userId);

      await logAudit({
        storeId: undefined,
        userId: localAuditUserId,
        action: 'RESTORE_FAILED',
        entityType: 'STORE',
        severity: 'ERROR',
        meta: {
          error: error.message || 'Unknown error',
          errorCode: typeof error?.code === 'string' ? error.code : null,
          phase: restorePhase,
          restoredBy: sessionData?.email,
        },
        ip,
        userAgent,
      });
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
      {
        code: 'BACKUP_RESTORE_FAILED',
        message: `No se pudo restaurar el respaldo durante ${restorePhase}. No se importó ningún dato; puedes reintentar.`,
      },
      { status: 500 }
    );
  }
}
