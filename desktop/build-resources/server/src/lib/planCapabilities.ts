// src/lib/planCapabilities.ts
// MÓDULO 16: Mapeo de Plan → Feature Flags (Capabilities)
// Define qué features tiene cada plan

import { PlanCode } from "@prisma/client";

export type FeatureFlagKey =
  | "ALLOW_FIADO"
  | "ALLOW_COUPONS"
  | "ENABLE_PROMOTIONS"
  | "ENABLE_CATEGORY_PROMOS"
  | "ENABLE_VOLUME_PROMOS"
  | "ENABLE_NTH_PROMOS"
  | "ENABLE_ADVANCED_REPORTS"
  | "ENABLE_MULTI_BRANCH"; // Futuro

export interface PlanCapabilities {
  [key: string]: boolean;
}

/**
 * Define las capabilities (feature flags) de cada plan
 */
export const PLAN_CAPABILITIES: Record<PlanCode, PlanCapabilities> = {
  DEMO: {
    // DEMO tiene TODAS las features para que prueben el sistema completo
    ALLOW_FIADO: true,
    ALLOW_COUPONS: true,
    ENABLE_PROMOTIONS: true,
    ENABLE_CATEGORY_PROMOS: true,
    ENABLE_VOLUME_PROMOS: true,
    ENABLE_NTH_PROMOS: true,
    ENABLE_ADVANCED_REPORTS: true,
    ENABLE_MULTI_BRANCH: false, // Solo BUSINESS tiene multi-sucursal
  },
  STARTER: {
    ALLOW_FIADO: false,
    ALLOW_COUPONS: false,
    ENABLE_PROMOTIONS: false,
    ENABLE_CATEGORY_PROMOS: false,
    ENABLE_VOLUME_PROMOS: false,
    ENABLE_NTH_PROMOS: false,
    ENABLE_ADVANCED_REPORTS: false,
    ENABLE_MULTI_BRANCH: false,
  },
  PRO: {
    ALLOW_FIADO: true,
    ALLOW_COUPONS: true,
    ENABLE_PROMOTIONS: true,
    ENABLE_CATEGORY_PROMOS: true,
    ENABLE_VOLUME_PROMOS: true,
    ENABLE_NTH_PROMOS: true,
    ENABLE_ADVANCED_REPORTS: false,
    ENABLE_MULTI_BRANCH: false,
  },
  BUSINESS: {
    ALLOW_FIADO: true,
    ALLOW_COUPONS: true,
    ENABLE_PROMOTIONS: true,
    ENABLE_CATEGORY_PROMOS: true,
    ENABLE_VOLUME_PROMOS: true,
    ENABLE_NTH_PROMOS: true,
    ENABLE_ADVANCED_REPORTS: true,
    ENABLE_MULTI_BRANCH: true, // Futuro
  },
};

/**
 * Obtiene el valor de una capability para un plan dado
 */
export function getPlanCapability(planCode: PlanCode, flagKey: string): boolean {
  const capabilities = PLAN_CAPABILITIES[planCode];
  return capabilities[flagKey] ?? false;
}

/**
 * Retorna todas las capabilities de un plan
 */
export function getAllPlanCapabilities(planCode: PlanCode): PlanCapabilities {
  return PLAN_CAPABILITIES[planCode];
}

/**
 * Información de planes para UI
 */
export interface PlanInfo {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}

export const PLANS_INFO: Record<PlanCode, PlanInfo> = {
  DEMO: {
    code: "DEMO",
    name: "Demo / Trial",
    description: "Prueba gratuita con acceso completo al sistema",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "🎉 Acceso completo por 30 días",
      "✅ Todas las funcionalidades PRO",
      "✅ Promociones y cupones",
      "✅ Ventas al fiado (crédito)",
      "✅ Reportes avanzados",
      "📞 Soporte por email",
      "⏰ Al terminar, elige tu plan",
    ],
  },
  STARTER: {
    code: "STARTER",
    name: "Starter (Bodega)",
    description: "Ideal para bodegas y negocios pequeños",
    monthlyPrice: 49,
    yearlyPrice: 490, // 2 meses gratis
    features: [
      "1 tienda",
      "Usuarios ilimitados",
      "Inventario completo",
      "Ventas y caja",
      "Turnos y reportes básicos",
      "Soporte por email",
    ],
  },
  PRO: {
    code: "PRO",
    name: "Pro (Tienda + Promos)",
    description: "Para tiendas que necesitan promociones y crédito",
    monthlyPrice: 99,
    yearlyPrice: 990,
    features: [
      "Todo lo de Starter",
      "Promociones y cupones",
      "Ventas al fiado (crédito)",
      "Promociones por categoría",
      "Promociones por volumen (2x1, 3x2)",
      "Descuentos N-ésimo item",
      "Soporte prioritario",
    ],
  },
  BUSINESS: {
    code: "BUSINESS",
    name: "Business (Multi-sucursal)",
    description: "Para negocios con múltiples sucursales",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    features: [
      "Todo lo de Pro",
      "Reportes avanzados",
      "Multi-sucursal (próximamente)",
      "API access",
      "Soporte telefónico 24/7",
      "Personalización avanzada",
    ],
  },
};
