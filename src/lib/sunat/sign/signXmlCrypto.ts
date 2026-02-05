// Firmador de XML con XMLDSig usando xml-crypto (estándar)
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import forge from 'node-forge';
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
 * Firma un XML UBL con XMLDSig usando RSA-SHA256 y xml-crypto
 */
export function signXml(xml: string, cert: Certificate, signatureId: string): SignedXmlResult {
  try {
    // 1. Preparar el XML - remover el placeholder de firma
    const placeholderPattern = /<!--[\s]*Signature placeholder[^>]*-->/gi;
    let preparedXml = xml.replace(placeholderPattern, '');
    
    // 2. Crear el firmador
    const sig = new SignedXml({
      privateKey: cert.privateKeyPem,
      publicCert: cert.certificatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    // 3. Configurar la referencia (todo el documento con transform enveloped)
    sig.addReference({
      xpath: '/*',
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    });

    // 4. Firmar
    sig.computeSignature(preparedXml, {
      prefix: 'ds',
      location: {
        reference: '//*[local-name()="ExtensionContent"]',
        action: 'append',
      },
    });

    const signedXml = sig.getSignedXml();

    // 5. Extraer valores para retorno
    const digestMatch = signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/);
    const signatureMatch = signedXml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/);

    return {
      signedXml,
      digestValue: digestMatch ? digestMatch[1] : '',
      signatureValue: signatureMatch ? signatureMatch[1] : '',
    };
  } catch (error) {
    throw new SignatureError(
      `Error al firmar el XML: ${error instanceof Error ? error.message : 'unknown error'}`,
      'SIGNATURE_FAILED'
    );
  }
}

/**
 * Calcula el hash SHA-256 de un XML (para almacenamiento)
 */
export function calculateXmlHash(xml: string): string {
  const md = forge.md.sha256.create();
  md.update(xml, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

/**
 * Verifica una firma XML
 */
export function verifyXmlSignature(signedXml: string, cert: Certificate): boolean {
  try {
    const doc = new DOMParser().parseFromString(signedXml, 'text/xml');
    const signatureNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    
    if (!signatureNode) return false;

    const sig = new SignedXml({ publicCert: cert.certificatePem });
    sig.loadSignature(signatureNode);
    
    return sig.checkSignature(signedXml);
  } catch {
    return false;
  }
}
