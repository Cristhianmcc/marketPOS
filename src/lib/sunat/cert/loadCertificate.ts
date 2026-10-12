// Carga y gestión de certificados digitales PFX
import forge from 'node-forge';
import { PrismaClient } from '@prisma/client';
import { generateBetaCertificate } from './generateBetaCertificate';

export interface Certificate {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  certificatePem: string;
  privateKeyPem: string;
}

export class CertificateError extends Error {
  constructor(message: string, public code: string = 'CERT_ERROR') {
    super(message);
    this.name = 'CertificateError';
  }
}

/**
 * Carga el certificado digital de la tienda. BETA puede crear uno de prueba;
 * PROD nunca toma certificados globales del proceso.
 * 
 * @param prisma - Cliente de Prisma
 * @param storeId - ID de la tienda
 * @returns Certificado parseado
 * @throws CertificateError si no se encuentra o no se puede cargar
 */
export async function loadCertificate(
  prisma: PrismaClient,
  storeId: string
): Promise<Certificate> {
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
    select: { env: true, ruc: true, certPfxBase64: true, certPassword: true },
  });

  if (!settings?.certPfxBase64 || !settings?.certPassword) {
    if (settings?.env === 'BETA' && settings.ruc) {
      const generated = generateBetaCertificate(settings.ruc);
      await prisma.sunatSettings.update({
        where: { storeId },
        data: {
          certPfxBase64: generated.pfxBase64,
          certPassword: generated.password,
          stepCertificate: true,
        },
      });
      return parsePfxCertificate(generated.pfxBase64, generated.password);
    }
    throw new CertificateError(
      'Certificado digital no configurado para esta tienda.',
      'CERT_NOT_CONFIGURED'
    );
  }

  const pfxBase64 = settings.certPfxBase64;
  const password = settings.certPassword;

  // Parsear el certificado PFX
  try {
    return parsePfxCertificate(pfxBase64, password);
  } catch (error) {
    if (error instanceof CertificateError) {
      throw error;
    }
    throw new CertificateError(
      `Error al cargar el certificado: ${error instanceof Error ? error.message : 'unknown error'}`,
      'CERT_PARSE_ERROR'
    );
  }
}

/**
 * Parsea un archivo PFX (PKCS#12) y extrae la clave privada y certificado
 * 
 * @param pfxBase64 - Contenido PFX en base64
 * @param password - Contraseña del certificado
 * @returns Certificado parseado con clave privada y certificado
 * @throws CertificateError si el formato es inválido o la contraseña es incorrecta
 */
export function parsePfxCertificate(pfxBase64: string, password: string): Certificate {
  try {
    // Decodificar base64
    const pfxBuffer = forge.util.decode64(pfxBase64);
    const pfxAsn1 = forge.asn1.fromDer(pfxBuffer);
    
    // Parsear PKCS#12
    const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

    // Buscar la clave privada
    const keyData = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const pkcs8Bags = keyData[forge.pki.oids.pkcs8ShroudedKeyBag];
    
    if (!pkcs8Bags || pkcs8Bags.length === 0) {
      throw new CertificateError(
        'No se encontró clave privada en el archivo PFX',
        'CERT_NO_PRIVATE_KEY'
      );
    }

    const privateKey = pkcs8Bags[0].key;
    if (!privateKey) {
      throw new CertificateError(
        'No se pudo extraer la clave privada del archivo PFX',
        'CERT_INVALID_PRIVATE_KEY'
      );
    }

    // Buscar el certificado
    const certData = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBags = certData[forge.pki.oids.certBag];
    
    if (!certBags || certBags.length === 0) {
      throw new CertificateError(
        'No se encontró certificado en el archivo PFX',
        'CERT_NO_CERTIFICATE'
      );
    }

    const certificate = certBags[0].cert;
    if (!certificate) {
      throw new CertificateError(
        'No se pudo extraer el certificado del archivo PFX',
        'CERT_INVALID_CERTIFICATE'
      );
    }

    // Validar fecha de expiración
    const now = new Date();
    if (certificate.validity.notAfter < now) {
      throw new CertificateError(
        `El certificado expiró el ${certificate.validity.notAfter.toISOString()}`,
        'CERT_EXPIRED'
      );
    }

    if (certificate.validity.notBefore > now) {
      throw new CertificateError(
        `El certificado aún no es válido (válido desde ${certificate.validity.notBefore.toISOString()})`,
        'CERT_NOT_YET_VALID'
      );
    }

    // Convertir a PEM
    const certificatePem = forge.pki.certificateToPem(certificate);
    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

    return {
      privateKey: privateKey as forge.pki.rsa.PrivateKey,
      certificate,
      certificatePem,
      privateKeyPem,
    };
  } catch (error) {
    if (error instanceof CertificateError) {
      throw error;
    }
    
    // Error común: contraseña incorrecta
    if (error instanceof Error && error.message.includes('password')) {
      throw new CertificateError(
        'Contraseña del certificado incorrecta',
        'CERT_INVALID_PASSWORD'
      );
    }

    throw new CertificateError(
      `Error al parsear el certificado PFX: ${error instanceof Error ? error.message : 'unknown error'}`,
      'CERT_PARSE_ERROR'
    );
  }
}

/**
 * Valida que un certificado sea válido para firmar documentos SUNAT
 * 
 * @param cert - Certificado a validar
 * @returns true si es válido, false en caso contrario
 */
export function validateCertificateForSunat(cert: Certificate): boolean {
  try {
    // Verificar que tenga clave privada
    if (!cert.privateKey) {
      return false;
    }

    // Verificar que el certificado esté vigente
    const now = new Date();
    if (cert.certificate.validity.notAfter < now || cert.certificate.validity.notBefore > now) {
      return false;
    }

    // Verificar que tenga los campos requeridos
    if (!cert.certificate.subject) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isSelfSignedCertificate(cert: Certificate): boolean {
  try {
    return cert.certificate.isIssuer(cert.certificate) &&
      cert.certificate.verify(cert.certificate);
  } catch {
    return false;
  }
}

/**
 * Extrae el RUC del certificado (si está presente en el subject)
 * 
 * @param cert - Certificado
 * @returns RUC o null si no se encuentra
 */
export function extractRucFromCertificate(cert: Certificate): string | null {
  try {
    const subject = cert.certificate.subject;
    
    // Buscar en los atributos del subject
    for (const attr of subject.attributes) {
      const value = String(attr.value || '');
      const match = value.match(/(?:^|\D)(\d{11})(?:\D|$)/);
      if (match) return match[1];
    }

    return null;
  } catch {
    return null;
  }
}
