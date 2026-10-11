import type { Prisma, StoreStatus } from '@prisma/client';

const RESTORED_NAME_SUFFIX = /\s*\(Restaurado\s+\d{1,2}\/\d{1,2}\/\d{4}\)\s*$/i;

export type SubscriptionRecoveryStore = {
  id: string;
  name: string;
  ruc: string | null;
  status: StoreStatus;
  subscription: {
    id: string;
    planCode: string;
    status: string;
  } | null;
};

export type SubscriptionRecoveryResult =
  | {
      transferred: true;
      subscriptionId: string;
      planCode: string;
      sourceStoreId: string;
      sourceStoreName: string;
    }
  | {
      transferred: false;
      reason: 'STORE_NOT_FOUND' | 'ALREADY_ASSIGNED' | 'NO_UNIQUE_SOURCE';
    };

export function getOriginalStoreName(storeName: string): string {
  let normalized = storeName.trim();
  let previous = '';

  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(RESTORED_NAME_SUFFIX, '').trim();
  }

  return normalized.toLocaleLowerCase('es-PE');
}

export function isRestoredStoreName(storeName: string): boolean {
  return RESTORED_NAME_SUFFIX.test(storeName);
}

function normalizeRuc(ruc: string | null): string | null {
  const digits = ruc?.replace(/\D/g, '') || '';
  return digits.length === 11 ? digits : null;
}

/**
 * Busca la tienda archivada que originó una restauración antigua sin plan.
 * Exige nombre base y RUC coincidentes, suscripción existente y un único
 * resultado para evitar mover la licencia de otra tienda por accidente.
 */
export function findRecoverableSubscriptionSource(
  target: SubscriptionRecoveryStore,
  candidates: SubscriptionRecoveryStore[]
): SubscriptionRecoveryStore | null {
  if (target.subscription || !isRestoredStoreName(target.name)) return null;

  const targetRuc = normalizeRuc(target.ruc);
  if (!targetRuc) return null;

  const targetName = getOriginalStoreName(target.name);
  const matches = candidates.filter(candidate =>
    candidate.id !== target.id &&
    candidate.status === 'ARCHIVED' &&
    candidate.subscription !== null &&
    normalizeRuc(candidate.ruc) === targetRuc &&
    getOriginalStoreName(candidate.name) === targetName
  );

  return matches.length === 1 ? matches[0] : null;
}

export async function transferRecoverableSubscription(
  tx: Prisma.TransactionClient,
  targetStoreId: string
): Promise<SubscriptionRecoveryResult> {
  const target = await tx.store.findUnique({
    where: { id: targetStoreId },
    select: {
      id: true,
      name: true,
      ruc: true,
      status: true,
      subscription: {
        select: { id: true, planCode: true, status: true },
      },
    },
  });

  if (!target) return { transferred: false, reason: 'STORE_NOT_FOUND' };
  if (target.subscription) return { transferred: false, reason: 'ALREADY_ASSIGNED' };

  const candidates = await tx.store.findMany({
    where: {
      id: { not: targetStoreId },
      status: 'ARCHIVED',
      subscription: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      ruc: true,
      status: true,
      subscription: {
        select: { id: true, planCode: true, status: true },
      },
    },
  });

  const source = findRecoverableSubscriptionSource(target, candidates);
  if (!source?.subscription) {
    return { transferred: false, reason: 'NO_UNIQUE_SOURCE' };
  }

  await tx.subscription.update({
    where: { id: source.subscription.id },
    data: { storeId: targetStoreId },
  });

  // Los pagos guardan también el storeId. Mantener ambos vínculos alineados
  // permite que reportes y auditoría sigan a la licencia transferida.
  await tx.payment.updateMany({
    where: { subscriptionId: source.subscription.id },
    data: { storeId: targetStoreId },
  });

  return {
    transferred: true,
    subscriptionId: source.subscription.id,
    planCode: source.subscription.planCode,
    sourceStoreId: source.id,
    sourceStoreName: source.name,
  };
}
