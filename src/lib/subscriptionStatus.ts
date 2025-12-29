// src/lib/subscriptionStatus.ts
// MÓDULO 16: Engine de evaluación de estado de suscripción
// Calcula estado efectivo sin depender de cron jobs

import { prisma } from "@/infra/db/prisma";
import { SubscriptionStatus, PlanCode } from "@prisma/client";

export type EffectiveStatus = SubscriptionStatus;

export interface SubscriptionInfo {
  id: string;
  storeId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  startAt: Date;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  priceAmount: number;
  priceCurrency: string;
  billingCycle: string;
  notes: string | null;
}

/**
 * Obtiene la suscripción de una tienda
 */
export async function getSubscription(storeId: string): Promise<SubscriptionInfo | null> {
  const sub = await prisma.subscription.findUnique({
    where: { storeId },
  });

  if (!sub) return null;

  return {
    ...sub,
    priceAmount: sub.priceAmount.toNumber(),
  };
}

/**
 * Calcula el estado efectivo de una suscripción basado en las fechas
 * SIN modificar la DB (solo lectura)
 */
export function computeEffectiveStatus(sub: SubscriptionInfo): EffectiveStatus {
  const now = new Date();

  // Si está cancelada, siempre es CANCELLED
  if (sub.status === "CANCELLED" || sub.cancelledAt) {
    return "CANCELLED";
  }

  // Si fue suspendida manualmente (tiene suspendedAt)
  if (sub.suspendedAt) {
    return "SUSPENDED";
  }

  // Si está en trial y no ha terminado
  if (sub.trialEndsAt && now <= sub.trialEndsAt) {
    return "TRIAL";
  }

  // Si está dentro del periodo actual
  if (now <= sub.currentPeriodEnd) {
    return "ACTIVE";
  }

  // Si ya pasó el periodo pero tiene gracia
  if (sub.graceEndsAt && now <= sub.graceEndsAt) {
    return "PAST_DUE";
  }

  // Si no tiene gracia o ya pasó la gracia
  return "SUSPENDED";
}

/**
 * Determina si la tienda puede operar (POS, ventas, etc.)
 */
export function isStoreAllowedToOperate(effectiveStatus: EffectiveStatus): boolean {
  return effectiveStatus === "TRIAL" || effectiveStatus === "ACTIVE" || effectiveStatus === "PAST_DUE";
}

/**
 * Obtiene el estado efectivo de una tienda y si puede operar
 */
export async function getStoreOperationalStatus(storeId: string) {
  const sub = await getSubscription(storeId);

  if (!sub) {
    // Sin suscripción = no puede operar (o dar trial automático)
    return {
      hasSubscription: false,
      effectiveStatus: null,
      canOperate: false,
      blockingReason: "NO_SUBSCRIPTION",
    };
  }

  const effectiveStatus = computeEffectiveStatus(sub);
  const canOperate = isStoreAllowedToOperate(effectiveStatus);

  return {
    hasSubscription: true,
    subscription: sub,
    effectiveStatus,
    canOperate,
    blockingReason: canOperate ? null : getBlockingReasonCode(effectiveStatus),
  };
}

/**
 * Retorna código de bloqueo para UX
 */
export function getBlockingReasonCode(status: EffectiveStatus): string {
  switch (status) {
    case "SUSPENDED":
      return "SUBSCRIPTION_SUSPENDED";
    case "CANCELLED":
      return "SUBSCRIPTION_CANCELLED";
    default:
      return "SUBSCRIPTION_INVALID";
  }
}

/**
 * Retorna mensaje UX para mostrar al usuario
 */
export function getBlockingReasonMessage(status: EffectiveStatus): string {
  switch (status) {
    case "SUSPENDED":
      return "Tu licencia ha sido suspendida por falta de pago. Contacta a soporte para reactivarla.";
    case "CANCELLED":
      return "Tu licencia ha sido cancelada. Contacta a soporte para obtener una nueva.";
    default:
      return "No tienes una licencia válida para acceder a esta función.";
  }
}

/**
 * Calcula días restantes hasta vencimiento
 */
export function getDaysUntilExpiration(sub: SubscriptionInfo): number {
  const now = new Date();
  const targetDate = sub.trialEndsAt && now <= sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;
  const diff = targetDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calcula días restantes de gracia
 */
export function getGraceDaysRemaining(sub: SubscriptionInfo): number | null {
  if (!sub.graceEndsAt) return null;
  const now = new Date();
  if (now > sub.graceEndsAt) return 0;
  const diff = sub.graceEndsAt.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
