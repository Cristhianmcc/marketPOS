import fs from 'fs/promises';
import path from 'path';

interface LicenseCredentialFile {
  version: 1;
  stores: Record<string, string>;
}

let writeQueue: Promise<void> = Promise.resolve();

function credentialPath(): string {
  const dataDir = process.env.MONTERRIAL_DATA_DIR?.trim() || path.join(process.cwd(), '.marketpos-runtime');
  return path.join(dataDir, 'config', 'license-credentials.json');
}

async function readCredentials(): Promise<LicenseCredentialFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(credentialPath(), 'utf8')) as LicenseCredentialFile;
    if (parsed.version === 1 && parsed.stores && typeof parsed.stores === 'object') return parsed;
  } catch {
    // Primera instalación o archivo ausente/corrupto: se reconstruye al registrar.
  }
  return { version: 1, stores: {} };
}

export async function getStoreLicenseCredential(storeId: string): Promise<string | null> {
  const data = await readCredentials();
  return data.stores[storeId] || null;
}

export async function saveStoreLicenseCredential(storeId: string, token: string): Promise<void> {
  const operation = writeQueue.then(async () => {
    const filePath = credentialPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const data = await readCredentials();
    data.stores[storeId] = token;
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
