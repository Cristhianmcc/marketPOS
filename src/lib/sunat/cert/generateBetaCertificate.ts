import crypto from 'crypto';
import forge from 'node-forge';

export interface GeneratedBetaCertificate {
  pfxBase64: string;
  password: string;
}

/**
 * Genera un certificado autofirmado para validar XMLDSig exclusivamente en
 * SUNAT BETA. Nunca debe utilizarse cuando la tienda está en PROD.
 */
export function generateBetaCertificate(ruc: string): GeneratedBetaCertificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = crypto.randomBytes(16).toString('hex');
  certificate.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);

  const attributes = [
    { name: 'countryName', value: 'PE' },
    { name: 'organizationName', value: 'Monterrial POS - Pruebas BETA' },
    { name: 'commonName', value: `BETA-${ruc}` },
    { name: 'serialNumber', value: ruc },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const password = crypto.randomBytes(24).toString('base64url');
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, password, {
    algorithm: '3des',
    friendlyName: `SUNAT-BETA-${ruc}`,
  });

  return {
    pfxBase64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    password,
  };
}
