/**
 * MÓDULO 18.4 — ZIP BUILDER
 * 
 * Crea archivos ZIP que contienen el XML firmado para enviar a SUNAT.
 * SUNAT requiere que el XML esté comprimido en ZIP con nombre específico.
 */

import AdmZip from 'adm-zip';

/**
 * Crea un archivo ZIP que contiene el XML firmado.
 * 
 * @param filename - Nombre del archivo XML dentro del ZIP (ej: 20123456789-01-F001-00000001.xml)
 * @param xmlContent - Contenido del XML firmado como string
 * @returns Base64 del archivo ZIP generado
 * 
 * @example
 * const zipBase64 = buildZip('20123456789-01-F001-00000001.xml', xmlSigned);
 */
export function buildZip(filename: string, xmlContent: string): string {
  const zip = new AdmZip();
  
  // Agregar el XML al ZIP
  zip.addFile(filename, Buffer.from(xmlContent, 'utf-8'));
  
  // Generar el ZIP como buffer
  const zipBuffer = zip.toBuffer();
  
  // Convertir a Base64
  return zipBuffer.toString('base64');
}

/**
 * Extrae el contenido de un archivo ZIP (útil para procesar CDR de SUNAT).
 * 
 * @param zipBase64 - ZIP en Base64
 * @param filename - Nombre del archivo a extraer (opcional, toma el primero si no se especifica)
 * @returns Contenido del archivo como string
 */
export function extractFromZip(zipBase64: string, filename?: string): string | null {
  try {
    const zipBuffer = Buffer.from(zipBase64, 'base64');
    const zip = new AdmZip(zipBuffer);
    
    const entries = zip.getEntries();
    
    if (entries.length === 0) {
      return null;
    }
    
    // Si se especifica filename, buscar ese archivo
    if (filename) {
      const entry = entries.find(e => e.entryName === filename);
      return entry ? entry.getData().toString('utf-8') : null;
    }
    
    // Si no, tomar el primer archivo
    return entries[0].getData().toString('utf-8');
  } catch (error) {
    console.error('Error extracting from ZIP:', error);
    return null;
  }
}

/**
 * Genera el nombre de archivo estándar para SUNAT.
 * Formato: {RUC}-{TIPO}-{SERIE}-{NUMERO}.xml
 * 
 * @param ruc - RUC del emisor (11 dígitos)
 * @param sunatDocCode - Código SUNAT del documento (01=FACTURA, 03=BOLETA, 07=NC, 08=ND)
 * @param series - Serie del documento (ej: F001, B001)
 * @param number - Número del documento (debe estar paddeado a 8 dígitos)
 * @returns Nombre del archivo para SUNAT
 * 
 * @example
 * buildSunatFilename('20123456789', '01', 'F001', '00000123') 
 * // => '20123456789-01-F001-00000123.xml'
 */
export function buildSunatFilename(
  ruc: string,
  sunatDocCode: string,
  series: string,
  number: string
): string {
  // Asegurar que el número esté paddeado a 8 dígitos
  const paddedNumber = number.padStart(8, '0');
  
  return `${ruc}-${sunatDocCode}-${series}-${paddedNumber}.xml`;
}

/**
 * Mapea el tipo de documento interno a código SUNAT.
 * 
 * @param docType - Tipo de documento interno (FACTURA, BOLETA, CREDIT_NOTE, DEBIT_NOTE)
 * @returns Código SUNAT correspondiente
 */
export function mapDocTypeToSunatCode(docType: string): string {
  const mapping: Record<string, string> = {
    'FACTURA': '01',
    'BOLETA': '03',
    'CREDIT_NOTE': '07',
    'DEBIT_NOTE': '08',
  };
  
  return mapping[docType] || '01';
}
