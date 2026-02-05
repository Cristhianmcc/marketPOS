/**
 * MÓDULO 18.7 — CONFIGURACIÓN CENTRALIZADA DE ENDPOINTS SUNAT
 * 
 * Todos los endpoints de SUNAT en un solo lugar para evitar hardcode duplicado.
 * 
 * ENTORNOS:
 * - BETA: Ambiente de homologación/pruebas de SUNAT
 * - PROD: Ambiente de producción real
 * 
 * SERVICIOS:
 * - billService: Envío de CPE (Facturas, Boletas, NC, ND)
 * - billConsult: Consulta de estado de tickets (para Summary/Voided)
 */

import type { SunatEnv } from '@prisma/client';

/**
 * Endpoints oficiales de SUNAT
 */
export const SUNAT_ENDPOINTS = {
  BETA: {
    /** Servicio de envío de comprobantes */
    billService: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    /** Servicio de consulta de tickets */
    billConsult: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billConsultService',
    /** WSDL para billService */
    billServiceWsdl: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl',
    /** WSDL para billConsult */
    billConsultWsdl: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billConsultService?wsdl',
  },
  PROD: {
    /** Servicio de envío de comprobantes */
    billService: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    /** Servicio de consulta de tickets */
    billConsult: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billConsultService',
    /** WSDL para billService */
    billServiceWsdl: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl',
    /** WSDL para billConsult */
    billConsultWsdl: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billConsultService?wsdl',
  },
} as const;

/**
 * Tipo para el entorno SUNAT
 */
export type SunatEnvironment = 'BETA' | 'PROD';

/**
 * Obtiene la URL del servicio de envío de comprobantes
 */
export function getBillServiceUrl(env: SunatEnvironment): string {
  return SUNAT_ENDPOINTS[env].billService;
}

/**
 * Obtiene la URL del servicio de consulta de tickets
 */
export function getBillConsultUrl(env: SunatEnvironment): string {
  return SUNAT_ENDPOINTS[env].billConsult;
}

/**
 * Obtiene el WSDL del servicio de envío
 */
export function getBillServiceWsdl(env: SunatEnvironment): string {
  return SUNAT_ENDPOINTS[env].billServiceWsdl;
}

/**
 * Obtiene el WSDL del servicio de consulta
 */
export function getBillConsultWsdl(env: SunatEnvironment): string {
  return SUNAT_ENDPOINTS[env].billConsultWsdl;
}

/**
 * Verifica si el entorno es de producción
 */
export function isProductionEnv(env: SunatEnvironment | SunatEnv): boolean {
  return env === 'PROD';
}

/**
 * Obtiene todos los endpoints para un entorno
 */
export function getEndpointsForEnv(env: SunatEnvironment) {
  return SUNAT_ENDPOINTS[env];
}

/**
 * Timeouts de conexión (ms)
 */
export const SUNAT_TIMEOUTS = {
  /** Timeout para conexión SOAP */
  connection: 30000,
  /** Timeout para respuesta */
  response: 60000,
  /** Timeout para operaciones de consulta */
  query: 30000,
} as const;

/**
 * Configuración de reintentos
 */
export const SUNAT_RETRY_CONFIG = {
  /** Número máximo de reintentos */
  maxAttempts: 5,
  /** Delays de backoff exponencial (ms) */
  backoffDelays: [
    1 * 60 * 1000,      // 1 minuto
    5 * 60 * 1000,      // 5 minutos
    15 * 60 * 1000,     // 15 minutos
    60 * 60 * 1000,     // 60 minutos
    120 * 60 * 1000,    // 2 horas
  ],
  /** Intervalo de polling para tickets */
  ticketPollingInterval: 60 * 1000, // 1 minuto
} as const;

/**
 * Códigos de respuesta SUNAT para tickets
 */
export const SUNAT_TICKET_STATUS = {
  /** Documento aceptado */
  ACCEPTED: '0',
  /** En proceso */
  PENDING: '98',
  /** Rechazado */
  REJECTED: '99',
} as const;

/**
 * Valida que un entorno sea válido
 */
export function isValidSunatEnv(env: string): env is SunatEnvironment {
  return env === 'BETA' || env === 'PROD';
}
