/**
 * MÓDULO 18.7 — Validaciones Fiscales SUNAT
 * 
 * Validaciones de datos fiscales según normativa SUNAT para documentos electrónicos.
 * 
 * REGLAS PRINCIPALES:
 * - RUC: Exactamente 11 dígitos (obligatorio para FACTURA)
 * - DNI: Exactamente 8 dígitos (opcional para BOLETA)
 * - CE (Carnet Extranjería): Hasta 12 caracteres alfanuméricos
 * - Totales: >= 0
 * - IGV: 18% del gravable
 */

/**
 * Tipos de documento de identidad SUNAT
 */
export enum TipoDocIdentidad {
  DNI = '1',           // DNI
  RUC = '6',           // RUC
  CE = '4',            // Carnet de Extranjería
  PASAPORTE = '7',     // Pasaporte
  CDI = 'A',           // Cédula Diplomática
  SIN_RUC = '0',       // Sin RUC / Documento No Domiciliado
  OTROS = '-',         // Otros
}

/**
 * Resultado de validación
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida un RUC peruano
 * 
 * Reglas:
 * - Exactamente 11 dígitos
 * - Comienza con 10, 15, 16, 17, o 20
 * - Dígito verificador válido (algoritmo módulo 11)
 * 
 * @param ruc - Número de RUC a validar
 * @returns true si es válido
 */
export function isValidRuc(ruc: string | null | undefined): boolean {
  if (!ruc) return false;
  
  // Limpiar espacios
  const cleanRuc = ruc.trim();
  
  // Verificar que sean exactamente 11 dígitos
  if (!/^\d{11}$/.test(cleanRuc)) {
    return false;
  }
  
  // Verificar prefijo válido
  const prefix = cleanRuc.substring(0, 2);
  const validPrefixes = ['10', '15', '16', '17', '20'];
  if (!validPrefixes.includes(prefix)) {
    return false;
  }
  
  // En BETA/desarrollo: solo validar formato y prefijo
  // En PROD: descomentar la validación del dígito verificador
  const skipCheckDigit = process.env.SUNAT_SKIP_CHECK_DIGIT === 'true' || process.env.NODE_ENV === 'development';
  if (skipCheckDigit) {
    return true;
  }
  
  // Algoritmo de dígito verificador (módulo 11)
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanRuc[i]) * weights[i];
  }
  
  const remainder = sum % 11;
  const checkDigit = 11 - remainder;
  const expectedDigit = checkDigit === 11 ? 0 : (checkDigit === 10 ? 0 : checkDigit);
  
  return parseInt(cleanRuc[10]) === expectedDigit;
}

/**
 * Valida un DNI peruano
 * 
 * Reglas:
 * - Exactamente 8 dígitos
 * 
 * @param dni - Número de DNI a validar
 * @returns true si es válido
 */
export function isValidDni(dni: string | null | undefined): boolean {
  if (!dni) return false;
  
  // Limpiar espacios
  const cleanDni = dni.trim();
  
  // Verificar que sean exactamente 8 dígitos
  return /^\d{8}$/.test(cleanDni);
}

/**
 * Valida un Carnet de Extranjería
 * 
 * Reglas:
 * - Hasta 12 caracteres alfanuméricos
 * 
 * @param ce - Número de CE a validar
 * @returns true si es válido
 */
export function isValidCe(ce: string | null | undefined): boolean {
  if (!ce) return false;
  
  const cleanCe = ce.trim();
  
  // Alfanumérico, máximo 12 caracteres
  return /^[A-Za-z0-9]{1,12}$/.test(cleanCe);
}

/**
 * Valida un número de documento según su tipo
 * 
 * @param docType - Tipo de documento (DNI, RUC, CE, etc)
 * @param docNumber - Número del documento
 * @returns Resultado de validación
 */
export function validateDocNumber(
  docType: string,
  docNumber: string | null | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!docNumber) {
    result.errors.push('Número de documento es requerido');
    result.valid = false;
    return result;
  }

  const cleanNumber = docNumber.trim();

  switch (docType.toUpperCase()) {
    case 'RUC':
    case '6':
      if (!isValidRuc(cleanNumber)) {
        result.errors.push('RUC inválido: debe tener 11 dígitos y formato válido');
        result.valid = false;
      }
      break;

    case 'DNI':
    case '1':
      if (!isValidDni(cleanNumber)) {
        result.errors.push('DNI inválido: debe tener exactamente 8 dígitos');
        result.valid = false;
      }
      break;

    case 'CE':
    case '4':
      if (!isValidCe(cleanNumber)) {
        result.errors.push('Carnet de Extranjería inválido: máximo 12 caracteres alfanuméricos');
        result.valid = false;
      }
      break;

    case 'PASAPORTE':
    case '7':
      // Pasaporte: más flexible, solo verificar que no esté vacío
      if (cleanNumber.length === 0 || cleanNumber.length > 20) {
        result.errors.push('Pasaporte inválido: debe tener entre 1 y 20 caracteres');
        result.valid = false;
      }
      break;

    case '-':
    case '0':
      // Sin documento / No domiciliado - permitir vacío o guión
      if (cleanNumber !== '-' && cleanNumber !== '00000000') {
        result.warnings.push('Para "Sin RUC" se recomienda usar "-" o "00000000"');
      }
      break;

    default:
      result.warnings.push(`Tipo de documento "${docType}" no tiene validación específica`);
  }

  return result;
}

/**
 * Valida datos para FACTURA
 * 
 * Reglas:
 * - Cliente DEBE tener RUC válido
 * - Total > 0
 * 
 * @param customerDocType - Tipo de documento del cliente
 * @param customerDocNumber - Número de documento
 * @param total - Total del documento
 * @returns Resultado de validación
 */
export function validateFacturaData(
  customerDocType: string,
  customerDocNumber: string,
  total: number
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // FACTURA requiere RUC
  if (customerDocType.toUpperCase() !== 'RUC' && customerDocType !== '6') {
    result.errors.push('FACTURA requiere RUC como tipo de documento');
    result.valid = false;
  }

  // Validar RUC
  if (!isValidRuc(customerDocNumber)) {
    result.errors.push('RUC inválido para FACTURA: debe tener 11 dígitos válidos');
    result.valid = false;
  }

  // Total debe ser positivo
  if (total < 0) {
    result.errors.push('Total no puede ser negativo');
    result.valid = false;
  }

  return result;
}

/**
 * Valida datos para BOLETA
 * 
 * Reglas:
 * - DNI opcional pero si se incluye debe ser válido
 * - Si monto > 700 PEN, DNI es obligatorio
 * - Total >= 0
 * 
 * @param customerDocType - Tipo de documento del cliente
 * @param customerDocNumber - Número de documento
 * @param total - Total del documento
 * @returns Resultado de validación
 */
export function validateBoletaData(
  customerDocType: string,
  customerDocNumber: string,
  total: number
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // DNI es obligatorio si monto > 700
  const BOLETA_LIMIT = 700;
  if (total > BOLETA_LIMIT) {
    if (!customerDocNumber || customerDocNumber === '-' || customerDocNumber === '00000000') {
      result.errors.push(`Para montos mayores a S/ ${BOLETA_LIMIT} se requiere documento de identidad`);
      result.valid = false;
    }
  }

  // Si hay documento, validarlo
  if (customerDocNumber && customerDocNumber !== '-' && customerDocNumber !== '00000000') {
    const docValidation = validateDocNumber(customerDocType, customerDocNumber);
    result.errors.push(...docValidation.errors);
    result.warnings.push(...docValidation.warnings);
    if (!docValidation.valid) {
      result.valid = false;
    }
  }

  // Total debe ser no negativo
  if (total < 0) {
    result.errors.push('Total no puede ser negativo');
    result.valid = false;
  }

  return result;
}

/**
 * Valida totales de un documento
 * 
 * @param taxable - Monto gravable
 * @param igv - IGV calculado
 * @param total - Total del documento
 * @returns Resultado de validación
 */
export function validateTotals(
  taxable: number,
  igv: number,
  total: number
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Todos deben ser no negativos
  if (taxable < 0) {
    result.errors.push('Monto gravable no puede ser negativo');
    result.valid = false;
  }

  if (igv < 0) {
    result.errors.push('IGV no puede ser negativo');
    result.valid = false;
  }

  if (total < 0) {
    result.errors.push('Total no puede ser negativo');
    result.valid = false;
  }

  // Verificar que IGV sea aproximadamente 18% del gravable
  const IGV_RATE = 0.18;
  const expectedIgv = taxable * IGV_RATE;
  const tolerance = 0.02; // 2 centavos de tolerancia
  
  if (Math.abs(igv - expectedIgv) > tolerance) {
    result.warnings.push(`IGV (${igv}) no coincide con 18% del gravable (${expectedIgv.toFixed(2)})`);
  }

  // Verificar que total = taxable + igv
  const expectedTotal = taxable + igv;
  if (Math.abs(total - expectedTotal) > tolerance) {
    result.errors.push(`Total (${total}) no coincide con gravable + IGV (${expectedTotal.toFixed(2)})`);
    result.valid = false;
  }

  return result;
}

/**
 * Validación completa para emisión de documento
 */
export function validateForEmission(params: {
  docType: 'FACTURA' | 'BOLETA';
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  taxable: number;
  igv: number;
  total: number;
}): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Validar nombre del cliente
  if (!params.customerName || params.customerName.trim().length < 2) {
    result.errors.push('Nombre del cliente es requerido (mínimo 2 caracteres)');
    result.valid = false;
  }

  // Validar según tipo de documento
  if (params.docType === 'FACTURA') {
    const facturaValidation = validateFacturaData(
      params.customerDocType,
      params.customerDocNumber,
      params.total
    );
    result.errors.push(...facturaValidation.errors);
    result.warnings.push(...facturaValidation.warnings);
    if (!facturaValidation.valid) result.valid = false;
  } else {
    const boletaValidation = validateBoletaData(
      params.customerDocType,
      params.customerDocNumber,
      params.total
    );
    result.errors.push(...boletaValidation.errors);
    result.warnings.push(...boletaValidation.warnings);
    if (!boletaValidation.valid) result.valid = false;
  }

  // Validar totales
  const totalsValidation = validateTotals(
    params.taxable,
    params.igv,
    params.total
  );
  result.errors.push(...totalsValidation.errors);
  result.warnings.push(...totalsValidation.warnings);
  if (!totalsValidation.valid) result.valid = false;

  return result;
}
