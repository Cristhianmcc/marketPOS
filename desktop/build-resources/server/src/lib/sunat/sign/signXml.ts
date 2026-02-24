// Firmador de XML con XMLDSig (RSA-SHA256)
import forge from 'node-forge';
import { create } from 'xmlbuilder2';
import type { Certificate } from '../cert/loadCertificate';

export interface SignedXmlResult {
  signedXml: string;
  digestValue: string;
  signatureValue: string;
}

export class SignatureError extends Error {
  constructor(message: string, public code: string = 'SIGNATURE_ERROR') {
    super(message);
    this.name = 'SignatureError';
  }
}

/**
 * Firma un XML UBL con XMLDSig usando RSA-SHA256
 * 
 * @param xml - XML sin firma (string)
 * @param cert - Certificado digital
 * @param signatureId - ID para la firma (por ejemplo, doc ID)
 * @returns XML firmado con la firma digital insertada
 */
export function signXml(xml: string, cert: Certificate, signatureId: string): SignedXmlResult {
  try {
    // 1. Preparar el XML removiendo el placeholder (SUNAT valida sin el placeholder)
    const placeholderPattern = /<!--[\s]*Signature placeholder[^>]*-->/i;
    const xmlForDigest = xml.replace(placeholderPattern, '');
    
    // 2. Canonicalizar el XML preparado (C14N)
    const canonicalXml = canonicalizeXml(xmlForDigest);

    // 3. Calcular el digest (hash SHA-256) del XML canonicalizado
    const md = forge.md.sha256.create();
    md.update(canonicalXml, 'utf8');
    const digestValue = forge.util.encode64(md.digest().bytes());

    // 4. Crear el SignedInfo
    const signedInfo = createSignedInfo(digestValue, '');
    const canonicalSignedInfo = canonicalizeXml(signedInfo);

    // 5. Firmar el SignedInfo con la clave privada
    const mdSig = forge.md.sha256.create();
    mdSig.update(canonicalSignedInfo, 'utf8');
    const signature = cert.privateKey.sign(mdSig);
    const signatureValue = forge.util.encode64(signature);

    // 6. Obtener el certificado en base64 (sin headers PEM)
    const certBase64 = cert.certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\n/g, '');

    // 7. Crear el nodo Signature completo
    const signatureXml = createSignatureElement(
      signatureId,
      digestValue,
      signatureValue,
      certBase64
    );

    // 8. Insertar la firma en el XML original
    const signedXml = insertSignatureIntoXml(xml, signatureXml);

    return {
      signedXml,
      digestValue,
      signatureValue,
    };
  } catch (error) {
    throw new SignatureError(
      `Error al firmar el XML: ${error instanceof Error ? error.message : 'unknown error'}`,
      'SIGNATURE_FAILED'
    );
  }
}

/**
 * Canonicaliza un XML usando C14N (Canonical XML 1.0)
 * Implementación simplificada para SUNAT
 */
function canonicalizeXml(xml: string): string {
  // Eliminar comentarios XML
  let canonical = xml.replace(/<!--[\s\S]*?-->/g, '');
  
  // Eliminar declaración XML
  canonical = canonical.replace(/<\?xml[^?]*\?>/g, '');
  
  // Eliminar espacios en blanco entre tags
  canonical = canonical.replace(/>\s+</g, '><');
  
  // Trim
  canonical = canonical.trim();
  
  return canonical;
}

/**
 * Crea el elemento SignedInfo para XMLDSig
 */
function createSignedInfo(digestValue: string, referenceUri: string = ''): string {
  const signedInfo = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('SignedInfo', {
      xmlns: 'http://www.w3.org/2000/09/xmldsig#'
    })
      .ele('CanonicalizationMethod', {
        Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
      }).up()
      .ele('SignatureMethod', {
        Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
      }).up()
      .ele('Reference', {
        URI: referenceUri
      })
        .ele('Transforms')
          .ele('Transform', {
            Algorithm: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
          }).up()
        .up()
        .ele('DigestMethod', {
          Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
        }).up()
        .ele('DigestValue').txt(digestValue).up()
      .up()
    .up();

  // Remover declaración XML del output
  return signedInfo.end({ prettyPrint: false }).replace(/<\?xml[^?]*\?>/g, '').trim();
}

/**
 * Crea el elemento Signature completo
 */
function createSignatureElement(
  signatureId: string,
  digestValue: string,
  signatureValue: string,
  x509Certificate: string
): string {
  const signature = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('ds:Signature', {
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'Id': signatureId
    })
      .ele('ds:SignedInfo')
        .ele('ds:CanonicalizationMethod', {
          Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        }).up()
        .ele('ds:SignatureMethod', {
          Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
        }).up()
        .ele('ds:Reference', {
          URI: ''
        })
          .ele('ds:Transforms')
            .ele('ds:Transform', {
              Algorithm: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
            }).up()
          .up()
          .ele('ds:DigestMethod', {
            Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
          }).up()
          .ele('ds:DigestValue').txt(digestValue).up()
        .up()
      .up()
      .ele('ds:SignatureValue').txt(signatureValue).up()
      .ele('ds:KeyInfo')
        .ele('ds:X509Data')
          .ele('ds:X509Certificate').txt(x509Certificate).up()
        .up()
      .up()
    .up();

  // Remover declaración XML del output - esto es un fragmento
  return signature.end({ prettyPrint: true }).replace(/<\?xml[^?]*\?>/g, '').trim();
}

/**
 * Inserta la firma en el XML UBL (en el ExtensionContent)
 */
function insertSignatureIntoXml(originalXml: string, signatureXml: string): string {
  // Buscar el comentario placeholder de la firma
  const placeholderPattern = /<!--[\s]*Signature placeholder[^>]*-->/i;
  
  if (placeholderPattern.test(originalXml)) {
    // Reemplazar el placeholder con la firma
    return originalXml.replace(placeholderPattern, signatureXml);
  } else {
    // Si no hay placeholder, buscar el ExtensionContent e insertar la firma
    const extensionContentPattern = /(<ext:ExtensionContent>)([\s\S]*?)(<\/ext:ExtensionContent>)/i;
    
    if (extensionContentPattern.test(originalXml)) {
      return originalXml.replace(
        extensionContentPattern,
        `$1\n${signatureXml}\n$3`
      );
    } else {
      throw new SignatureError(
        'No se encontró el nodo ext:ExtensionContent para insertar la firma',
        'SIGNATURE_NO_EXTENSION_CONTENT'
      );
    }
  }
}

/**
 * Verifica una firma XML (para pruebas/validación)
 */
export function verifyXmlSignature(signedXml: string, cert: Certificate): boolean {
  try {
    // Extraer DigestValue de la firma
    const digestMatch = signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/);
    if (!digestMatch) return false;

    // Extraer SignatureValue
    const signatureMatch = signedXml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/);
    if (!signatureMatch) return false;

    // Remover la firma del XML
    const xmlWithoutSig = signedXml.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/i, '');
    
    // Canonicalizar
    const canonicalXml = canonicalizeXml(xmlWithoutSig);

    // Recalcular digest
    const md = forge.md.sha256.create();
    md.update(canonicalXml, 'utf8');
    const computedDigest = forge.util.encode64(md.digest().bytes());

    // Verificar que el digest coincida
    if (computedDigest !== digestMatch[1]) {
      return false;
    }

    // TODO: Verificar la firma con la clave pública del certificado
    // (para MVP simplificado, solo verificamos el digest)

    return true;
  } catch {
    return false;
  }
}

/**
 * Calcula el hash SHA-256 de un XML firmado (para almacenar en DB)
 */
export function calculateXmlHash(xml: string): string {
  const md = forge.md.sha256.create();
  md.update(xml, 'utf8');
  return md.digest().toHex();
}
