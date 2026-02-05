/**
 * MÓDULO 18.4 — CDR PARSER
 * 
 * Parsea la Constancia de Recepción (CDR) que devuelve SUNAT.
 * El CDR es un archivo XML comprimido en ZIP que contiene:
 * - Código de respuesta (0000 = aceptado, 0xxx = aceptado con observaciones, otros = rechazado)
 * - Descripción del resultado
 * - Notas y observaciones (si las hay)
 */

import { extractFromZip } from '../zip/buildZip';

/**
 * Resultado del parsing del CDR.
 */
export interface CdrData {
  responseCode: string;      // Código de respuesta SUNAT (ej: "0000")
  description: string;        // Descripción del resultado
  notes: string[];            // Notas adicionales (observaciones)
  isAccepted: boolean;        // true si código empieza con "0"
  isRejected: boolean;        // true si código NO empieza con "0"
}

/**
 * Parsea el CDR devuelto por SUNAT.
 * 
 * @param cdrZipBase64 - CDR comprimido en Base64
 * @returns Datos extraídos del CDR
 */
export async function parseCdr(cdrZipBase64: string): Promise<CdrData | null> {
  try {
    // Extraer XML del ZIP
    const cdrXml = extractFromZip(cdrZipBase64);
    
    if (!cdrXml) {
      console.error('No se pudo extraer CDR del ZIP');
      return null;
    }

    // Parsear XML del CDR
    // El CDR es un XML con namespace cac/cbc de UBL
    // Estructura simplificada:
    // <ApplicationResponse>
    //   <cbc:ResponseCode>0000</cbc:ResponseCode>
    //   <cac:DocumentResponse>
    //     <cac:Response>
    //       <cbc:ResponseCode>0000</cbc:ResponseCode>
    //       <cbc:Description>La Factura numero F001-00000123, ha sido aceptada</cbc:Description>
    //     </cac:Response>
    //   </cac:DocumentResponse>
    // </ApplicationResponse>

    const responseCode = extractXmlValue(cdrXml, 'cbc:ResponseCode');
    const description = extractXmlValue(cdrXml, 'cbc:Description');
    
    // Extraer notas (pueden ser múltiples)
    const notes: string[] = [];
    const noteMatches = cdrXml.matchAll(/<cbc:Note[^>]*>([^<]+)<\/cbc:Note>/g);
    for (const match of noteMatches) {
      notes.push(match[1].trim());
    }

    if (!responseCode) {
      console.error('No se encontró ResponseCode en el CDR');
      return null;
    }

    return {
      responseCode,
      description: description || 'Sin descripción',
      notes,
      isAccepted: responseCode.startsWith('0'),
      isRejected: !responseCode.startsWith('0'),
    };

  } catch (error) {
    console.error('Error parseando CDR:', error);
    return null;
  }
}

/**
 * Extrae el valor de un elemento XML simple.
 * Busca la primera ocurrencia del tag y devuelve su contenido.
 * 
 * @param xml - Contenido XML como string
 * @param tagName - Nombre del tag a buscar (ej: "cbc:ResponseCode")
 * @returns Valor del tag o null si no se encuentra
 */
function extractXmlValue(xml: string, tagName: string): string | null {
  // Escapar caracteres especiales del tagName para regex
  const escapedTag = tagName.replace(/:/g, '\\:');
  
  // Buscar tag con o sin atributos
  const regex = new RegExp(`<${escapedTag}[^>]*>([^<]+)<\/${escapedTag}>`, 'i');
  const match = xml.match(regex);
  
  return match ? match[1].trim() : null;
}

/**
 * Determina si un código de respuesta SUNAT indica aceptación.
 * 
 * Códigos que empiezan con "0" = aceptado (con o sin observaciones)
 * Otros códigos = rechazado
 * 
 * @param responseCode - Código de respuesta SUNAT
 * @returns true si el documento fue aceptado
 */
export function isAcceptedBysunat(responseCode: string): boolean {
  return responseCode.startsWith('0');
}

/**
 * Obtiene el mensaje de estado según el código de respuesta.
 * 
 * @param responseCode - Código de respuesta SUNAT
 * @returns Mensaje descriptivo del estado
 */
export function getStatusMessage(responseCode: string): string {
  const code = responseCode.trim();
  
  // Códigos comunes de SUNAT
  const messages: Record<string, string> = {
    '0000': 'Aceptado',
    '0001': 'Aceptado con observaciones',
    '0002': 'Aceptado con observaciones',
    '0100': 'La Factura numero F001-00000001, ha sido aceptada',
    '0200': 'La Boleta numero B001-00000001, ha sido aceptada',
    '2000': 'Rechazo - Error en el RUC del emisor',
    '2001': 'Rechazo - Error en el tipo de documento del emisor',
    '2002': 'Rechazo - Error en el número de documento del receptor',
    '2003': 'Rechazo - Error en los datos del archivo',
    '2010': 'Rechazo - Número de RUC del emisor no existe',
    '2011': 'Rechazo - Número de RUC del emisor no está activo',
    '2012': 'Rechazo - Número de RUC del emisor no está habilitado para emitir electrónicamente',
    '2100': 'Rechazo - El archivo ZIP está dañado',
    '2101': 'Rechazo - El archivo XML está dañado',
    '2102': 'Rechazo - El archivo ZIP no contiene XML',
    '2103': 'Rechazo - El nombre del archivo ZIP es incorrecto',
    '2104': 'Rechazo - El nombre del archivo XML es incorrecto',
    '2200': 'Rechazo - Firma digital inválida',
    '2300': 'Rechazo - El comprobante fue enviado anteriormente',
    '2301': 'Rechazo - El comprobante número F001-00000001 ya existe con fecha de emisión diferente',
    '2302': 'Rechazo - El número de comprobante ya fue utilizado',
    '2310': 'Rechazo - La fecha de emisión es inválida',
    '2311': 'Rechazo - La fecha de emisión no puede ser mayor a la fecha actual',
    '2312': 'Rechazo - La fecha de emisión no debe tener una antigüedad mayor a 7 días',
    '4000': 'Rechazo - Error en el formato del monto total',
    '4001': 'Rechazo - Total de IGV no coincide',
    '4002': 'Rechazo - Total de ISC no coincide',
    '4003': 'Rechazo - Suma de valores de venta no coincide con el total',
  };
  
  return messages[code] || `Código ${code}`;
}
