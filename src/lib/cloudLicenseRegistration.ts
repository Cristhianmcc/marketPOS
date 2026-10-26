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

function getCloudBaseUrl(): string {
  const value = process.env.CLOUD_URL?.trim().replace(/\/+$/, '') || '';
  if (!value) throw new Error('CLOUD_URL_NOT_CONFIGURED');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('CLOUD_URL_MUST_USE_HTTPS');
  }
  return value;
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
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.licenseToken) {
    throw new Error(payload?.error || `CLOUD_REGISTRATION_FAILED_${response.status}`);
  }
  return payload as CloudRegistrationResult;
}
