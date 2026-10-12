import type { Certificate } from '../cert/loadCertificate';
import {
  extractRucFromCertificate,
  isSelfSignedCertificate,
  parsePfxCertificate,
} from '../cert/loadCertificate';

export type ProductionCheckKey =
  | 'fiscalData'
  | 'solCredentials'
  | 'certificate'
  | 'signatureTest';

export interface ProductionReadinessInput {
  ruc?: string | null;
  razonSocial?: string | null;
  address?: string | null;
  solUser?: string | null;
  solPass?: string | null;
  certPfxBase64?: string | null;
  certPassword?: string | null;
  stepTestSign?: boolean | null;
}

export interface ProductionReadinessCheck {
  ok: boolean;
  message: string;
}

export interface ProductionReadinessResult {
  ready: boolean;
  checks: Record<ProductionCheckKey, ProductionReadinessCheck>;
  errors: string[];
  warnings: string[];
  certificateExpiresAt: string | null;
}

function validRucCheckDigit(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!['10', '15', '16', '17', '20'].includes(ruc.slice(0, 2))) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(ruc[index]) * weight, 0);
  const calculated = 11 - (sum % 11);
  const expected = calculated >= 10 ? calculated - 10 : calculated;
  return Number(ruc[10]) === expected;
}

function keysMatch(certificate: Certificate): boolean {
  const publicKey = certificate.certificate.publicKey as {
    n?: { compareTo(other: unknown): number };
    e?: { compareTo(other: unknown): number };
  };
  const privateKey = certificate.privateKey as unknown as {
    n?: unknown;
    e?: unknown;
  };

  return Boolean(
    publicKey?.n &&
    publicKey?.e &&
    privateKey?.n &&
    privateKey?.e &&
    publicKey.n.compareTo(privateKey.n) === 0 &&
    publicKey.e.compareTo(privateKey.e) === 0
  );
}

function validateSolCredentials(input: ProductionReadinessInput, ruc: string): ProductionReadinessCheck {
  const rawUser = input.solUser?.trim() || '';
  const password = input.solPass || '';

  if (!rawUser || !password) {
    return { ok: false, message: 'Credenciales SOL de la tienda incompletas' };
  }

  if (/\s/.test(rawUser)) {
    return { ok: false, message: 'El usuario SOL no puede contener espacios' };
  }

  const upperUser = rawUser.toUpperCase();
  if (upperUser === 'MODDATOS' || upperUser === `${ruc}MODDATOS`) {
    return { ok: false, message: 'Las credenciales MODDATOS son solo para BETA' };
  }

  if (/^\d{11}/.test(rawUser) && !rawUser.startsWith(ruc)) {
    return { ok: false, message: 'El RUC incluido en el usuario SOL no coincide con la tienda' };
  }

  const localUser = rawUser.startsWith(ruc) ? rawUser.slice(ruc.length) : rawUser;
  if (!localUser || localUser.length > 20) {
    return { ok: false, message: 'El usuario SOL tiene un formato inválido' };
  }

  return { ok: true, message: 'Credenciales SOL propias de la tienda configuradas' };
}

export function validateProductionReadiness(
  input: ProductionReadinessInput,
  now: Date = new Date()
): ProductionReadinessResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ruc = input.ruc?.trim() || '';
  let certificateExpiresAt: string | null = null;

  const fiscalData: ProductionReadinessCheck = validRucCheckDigit(ruc) &&
    Boolean(input.razonSocial?.trim()) &&
    Boolean(input.address?.trim())
    ? { ok: true, message: 'RUC, razón social y dirección fiscal completos' }
    : { ok: false, message: 'Completa un RUC válido, razón social y dirección fiscal' };

  const solCredentials = validateSolCredentials(input, ruc);

  let certificate: ProductionReadinessCheck = {
    ok: false,
    message: 'Certificado digital real no configurado',
  };

  if (input.certPfxBase64 && input.certPassword) {
    try {
      const parsed = parsePfxCertificate(input.certPfxBase64, input.certPassword);
      certificateExpiresAt = parsed.certificate.validity.notAfter.toISOString();
      const certificateRuc = extractRucFromCertificate(parsed);
      const keyBits = parsed.privateKey.n.bitLength();

      if (isSelfSignedCertificate(parsed)) {
        certificate = { ok: false, message: 'El certificado autofirmado de BETA no sirve en PRODUCCIÓN' };
      } else if (!keysMatch(parsed)) {
        certificate = { ok: false, message: 'La clave privada no corresponde al certificado' };
      } else if (keyBits < 2048) {
        certificate = { ok: false, message: 'El certificado debe usar una clave RSA de al menos 2048 bits' };
      } else if (!certificateRuc) {
        certificate = { ok: false, message: 'No se pudo verificar el RUC dentro del certificado' };
      } else if (certificateRuc !== ruc) {
        certificate = { ok: false, message: 'El RUC del certificado no coincide con el de la tienda' };
      } else {
        certificate = { ok: true, message: 'PFX vigente, con clave privada y RUC coincidente' };
        const warningDate = new Date(now);
        warningDate.setDate(warningDate.getDate() + 30);
        if (parsed.certificate.validity.notAfter <= warningDate) {
          warnings.push('El certificado digital vence dentro de los próximos 30 días');
        }
      }
    } catch (error) {
      certificate = {
        ok: false,
        message: error instanceof Error ? error.message : 'Certificado digital inválido',
      };
    }
  }

  const signatureTest: ProductionReadinessCheck = input.stepTestSign
    ? { ok: true, message: 'Firma XML probada con el certificado actual' }
    : { ok: false, message: 'Falta probar la firma con el certificado actual' };

  const checks = { fiscalData, solCredentials, certificate, signatureTest };
  for (const check of Object.values(checks)) {
    if (!check.ok) errors.push(check.message);
  }

  return {
    ready: errors.length === 0,
    checks,
    errors,
    warnings,
    certificateExpiresAt,
  };
}
