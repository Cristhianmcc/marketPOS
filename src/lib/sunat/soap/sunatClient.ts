/**
 * MÓDULO 18.4 + 18.7 — CLIENTE SOAP SUNAT
 * 
 * Cliente para interactuar con los servicios web de SUNAT usando SOAP.
 * Soporta BETA (homologación) y PROD (producción).
 * 
 * SERVICIOS:
 * - sendBill: Envío de Facturas, Boletas, NC, ND
 * - sendSummary: Envío de Resúmenes Diarios y Comunicaciones de Baja
 * - getStatus: Consulta de estado de ticket (para summaries)
 * 
 * MÓDULO 18.7: Endpoints centralizados en config/endpoints.ts
 * 
 * NOTA: Usa WSDL local porque SUNAT requiere autenticación para 
 * los imports del WSDL (ns1.wsdl) que la librería soap no maneja bien.
 */

// IMPORTANTE: Usar "import * as" porque soap es CommonJS y el default export
// no funciona correctamente con ESM/tsx
import * as soap from 'soap';
import * as path from 'path';
import {
  SUNAT_ENDPOINTS,
  SUNAT_TIMEOUTS,
  type SunatEnvironment,
} from '../config/endpoints';

// Ruta al WSDL local (evita problemas de auth con imports del WSDL)
const LOCAL_WSDL_PATH = path.join(__dirname, '..', 'wsdl', 'billService-local.wsdl');

/**
 * Configuración del cliente SOAP.
 */
interface SunatClientConfig {
  solUser: string;      // Usuario SOL (RUC + usuario)
  solPass: string;      // Contraseña SOL
  environment: SunatEnvironment;
}

/**
 * Resultado del envío de un documento (sendBill).
 */
export interface SendBillResult {
  success: boolean;
  cdrZipBase64?: string;    // CDR comprimido en Base64
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Resultado del envío de un resumen (sendSummary).
 */
export interface SendSummaryResult {
  success: boolean;
  ticket?: string;          // Ticket para consultar estado
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Resultado de la consulta de ticket (getStatus).
 */
export interface GetStatusResult {
  success: boolean;
  statusCode?: string;      // 0=Aceptado, 98=En proceso, 99=Rechazado
  cdrZipBase64?: string;    // CDR si fue aceptado
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Envía un comprobante electrónico a SUNAT (Factura, Boleta, NC, ND).
 * 
 * @param config - Configuración del cliente SOAP
 * @param filename - Nombre del archivo ZIP (ej: 20123456789-01-F001-00000001.zip)
 * @param zipBase64 - Contenido del ZIP en Base64
 * @returns Resultado del envío con CDR o error
 */
export async function sendBill(
  config: SunatClientConfig,
  filename: string,
  zipBase64: string
): Promise<SendBillResult> {
  try {
    const endpoints = SUNAT_ENDPOINTS[config.environment];
    
    // Usar WSDL local para evitar problemas de autenticación con imports
    // El endpoint se configura según el ambiente (BETA o PROD)
    const client = await soap.createClientAsync(LOCAL_WSDL_PATH, {
      endpoint: endpoints.billService,
    });

    // Configurar autenticación WS-Security para las llamadas SOAP
    const wsSecurity = new soap.WSSecurity(config.solUser, config.solPass);
    client.setSecurity(wsSecurity);

    // Preparar parámetros
    const params = {
      fileName: filename.replace('.xml', '.zip'), // Asegurar extensión .zip
      contentFile: zipBase64,
    };

    // Enviar documento
    const [result] = await client.sendBillAsync(params);

    // SUNAT responde con applicationResponse (CDR en Base64)
    if (result && result.applicationResponse) {
      return {
        success: true,
        cdrZipBase64: result.applicationResponse,
      };
    }

    return {
      success: false,
      errorCode: 'NO_CDR',
      errorMessage: 'SUNAT no devolvió CDR en la respuesta',
    };

  } catch (error: any) {
    console.error('Error en sendBill:', error.message);
    
    // Parsear errores SOAP de SUNAT
    const soapFault = error.root?.Envelope?.Body?.Fault;
    if (soapFault) {
      return {
        success: false,
        errorCode: soapFault.faultcode || 'SOAP_FAULT',
        errorMessage: soapFault.faultstring || 'Error SOAP desconocido',
      };
    }

    return {
      success: false,
      errorCode: error.code || 'NETWORK_ERROR',
      errorMessage: error.message || 'Error de red al contactar SUNAT',
    };
  }
}

/**
 * Envía un Resumen Diario o Comunicación de Baja a SUNAT.
 * Estos documentos se procesan de forma asíncrona (devuelven ticket).
 * 
 * @param config - Configuración del cliente SOAP
 * @param filename - Nombre del archivo ZIP del resumen
 * @param zipBase64 - Contenido del ZIP en Base64
 * @returns Ticket para consultar estado posteriormente
 */
export async function sendSummary(
  config: SunatClientConfig,
  filename: string,
  zipBase64: string
): Promise<SendSummaryResult> {
  try {
    const endpoints = SUNAT_ENDPOINTS[config.environment];
    
    // Usar WSDL local para evitar problemas de autenticación con imports
    const client = await soap.createClientAsync(LOCAL_WSDL_PATH, {
      endpoint: endpoints.billService,
    });

    const wsSecurity = new soap.WSSecurity(config.solUser, config.solPass);
    client.setSecurity(wsSecurity);

    const params = {
      fileName: filename.replace('.xml', '.zip'),
      contentFile: zipBase64,
    };

    const [result] = await client.sendSummaryAsync(params);

    // SUNAT responde con ticket para consultar luego
    if (result && result.ticket) {
      return {
        success: true,
        ticket: result.ticket,
      };
    }

    return {
      success: false,
      errorCode: 'NO_TICKET',
      errorMessage: 'SUNAT no devolvió ticket en la respuesta',
    };

  } catch (error: any) {
    console.error('Error en sendSummary:', error.message);
    
    const soapFault = error.root?.Envelope?.Body?.Fault;
    if (soapFault) {
      return {
        success: false,
        errorCode: soapFault.faultcode || 'SOAP_FAULT',
        errorMessage: soapFault.faultstring || 'Error SOAP desconocido',
      };
    }

    return {
      success: false,
      errorCode: error.code || 'NETWORK_ERROR',
      errorMessage: error.message || 'Error de red al contactar SUNAT',
    };
  }
}

/**
 * Consulta el estado de un ticket (resumen enviado con sendSummary).
 * 
 * @param config - Configuración del cliente SOAP
 * @param ticket - Ticket devuelto por sendSummary
 * @returns Estado del documento y CDR si fue aceptado
 */
export async function getStatus(
  config: SunatClientConfig,
  ticket: string
): Promise<GetStatusResult> {
  try {
    const endpoints = SUNAT_ENDPOINTS[config.environment];
    
    // Usar WSDL local para evitar problemas de autenticación con imports
    // El mismo WSDL local tiene getStatus
    const client = await soap.createClientAsync(LOCAL_WSDL_PATH, {
      endpoint: endpoints.billService,
    });

    const wsSecurity = new soap.WSSecurity(config.solUser, config.solPass);
    client.setSecurity(wsSecurity);

    const params = {
      ticket,
    };

    const [result] = await client.getStatusAsync(params);

    if (!result) {
      return {
        success: false,
        errorCode: 'NO_RESPONSE',
        errorMessage: 'SUNAT no devolvió respuesta',
      };
    }

    // Códigos de estado:
    // 0 = Aceptado
    // 98 = En proceso
    // 99 = Rechazado
    const statusCode = result.statusCode || result.status?.statusCode;
    const cdrZipBase64 = result.content;

    return {
      success: true,
      statusCode: String(statusCode),
      cdrZipBase64,
    };

  } catch (error: any) {
    console.error('Error en getStatus:', error.message);
    
    const soapFault = error.root?.Envelope?.Body?.Fault;
    if (soapFault) {
      return {
        success: false,
        errorCode: soapFault.faultcode || 'SOAP_FAULT',
        errorMessage: soapFault.faultstring || 'Error SOAP desconocido',
      };
    }

    return {
      success: false,
      errorCode: error.code || 'NETWORK_ERROR',
      errorMessage: error.message || 'Error de red al contactar SUNAT',
    };
  }
}

/**
 * Valida las credenciales SOL antes de enviar documentos.
 * 
 * @param config - Configuración del cliente SOAP
 * @returns true si las credenciales son válidas
 */
export async function validateSolCredentials(config: SunatClientConfig): Promise<boolean> {
  try {
    // Intentar crear cliente y verificar que las credenciales sean válidas
    // En un caso real, esto requeriría un documento de prueba
    // Por ahora solo validamos formato
    
    if (!config.solUser || !config.solPass) {
      return false;
    }

    // Validar formato de usuario SOL: debe ser RUC + usuario
    // Ejemplo: 20123456789MODDATOS
    const rucPattern = /^\d{11}[A-Z0-9]+$/;
    if (!rucPattern.test(config.solUser)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
