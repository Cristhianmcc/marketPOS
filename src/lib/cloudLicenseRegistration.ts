interface CloudStoreRegistration {
  storeId: string;
  storeName: string;
  ownerEmail: string;
  ownerName: string;
  ruc?: string | null;
  address?: string | null;
  phone?: string | null;
  planCode: string;
}

interface CloudRegistrationResult {
  ok: boolean;
  already?: boolean;
  licenseToken: string;
}

/**
 * Solo el servidor local del escritorio registra tiendas en la nube. En la web
 * la tienda ya vive en la base cloud y no necesita credencial de licencia.
 */
export function isCloudLicenseRegistrationAvailable(): boolean {
  return Boolean(process.env.DESKTOP_INTERNAL_TOKEN || process.env.MONTERRIAL_DATA_DIR);
}

function getCloudBaseUrl(): string {
  const value = process.env.CLOUD_URL?.trim().replace(/\/+$/, '') || '';
  if (!value) throw new Error('CLOUD_URL_NOT_CONFIGURED');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('CLOUD_URL_MUST_USE_HTTPS');
  }
  return value;
}

/** Mensaje claro para el dueño según por qué falló el registro en la nube. */
export function describeCloudRegistrationError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'TimeoutError' || name === 'AbortError') {
    return 'El servidor web tardó demasiado en responder (puede estar despertando). Espera un minuto e inténtalo de nuevo.';
  }
  if (message.startsWith('CLOUD_URL_')) return 'La dirección del servidor web (CLOUD_URL) no está configurada en este equipo.';
  if (/401|unauthorized/i.test(message)) {
    return 'El servidor web no aceptó tu sesión de superadministrador (dura 4 horas). Cierra sesión, vuelve a entrar como superadministrador y registra de nuevo.';
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|network/i.test(message)) {
    return 'No hay conexión con el servidor web. Revisa el Internet de esta PC.';
  }
  return `El servidor web rechazó el registro: ${message}`;
}

export async function registerStoreInCloud(
  input: CloudStoreRegistration,
  cloudAdminToken: string,
): Promise<CloudRegistrationResult> {
  const response = await fetch(`${getCloudBaseUrl()}/api/license/register-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cloudAdminToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    // Render gratuito puede tardar cerca de un minuto en despertar
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.licenseToken) {
    throw new Error(payload?.error || `CLOUD_REGISTRATION_FAILED_${response.status}`);
  }
  return payload as CloudRegistrationResult;
}
