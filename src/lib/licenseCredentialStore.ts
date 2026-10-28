import fs from 'fs/promises';
import path from 'path';

interface LicenseCredentialFile {
  version: 1;
  stores: Record<string, string>;
}

let writeQueue: Promise<void> = Promise.resolve();

/**
 * Lugares donde se guarda el archivo, en orden de preferencia. Primero la
 * carpeta propia de la app (MONTERRIAL_SECRETS_DIR, en AppData): Windows puede
 * bloquear escrituras en Documentos (acceso controlado a carpetas, OneDrive).
 */
function credentialPaths(): string[] {
  const dirs = [
    process.env.MONTERRIAL_SECRETS_DIR?.trim(),
    process.env.MONTERRIAL_DATA_DIR?.trim() || path.join(process.cwd(), '.marketpos-runtime'),
  ].filter((dir): dir is string => Boolean(dir));
  return [...new Set(dirs)].map((dir) => path.join(dir, 'config', 'license-credentials.json'));
}

async function readFile(filePath: string): Promise<LicenseCredentialFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as LicenseCredentialFile;
    if (parsed.version === 1 && parsed.stores && typeof parsed.stores === 'object') return parsed;
  } catch {
    // Primera instalación o archivo ausente/corrupto: se reconstruye al registrar.
  }
  return null;
}

/** Junta las credenciales de todos los lugares; manda el de mayor preferencia. */
async function readCredentials(): Promise<LicenseCredentialFile> {
  const stores: Record<string, string> = {};
  for (const filePath of [...credentialPaths()].reverse()) {
    Object.assign(stores, (await readFile(filePath))?.stores ?? {});
  }
  return { version: 1, stores };
}

export async function getStoreLicenseCredential(storeId: string): Promise<string | null> {
  const data = await readCredentials();
  return data.stores[storeId] || null;
}

const isPermissionError = (error: unknown) =>
  ['EPERM', 'EACCES', 'EROFS'].includes((error as NodeJS.ErrnoException)?.code ?? '');

export async function saveStoreLicenseCredential(storeId: string, token: string): Promise<void> {
  const operation = writeQueue.then(async () => {
    const data = await readCredentials();
    data.stores[storeId] = token;
    let lastError: unknown = null;
    for (const filePath of credentialPaths()) {
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporaryPath, filePath);
        return;
      } catch (error) {
        // Sin permiso en esta carpeta: se intenta la siguiente
        if (!isPermissionError(error)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Error('No hay carpeta disponible para guardar la licencia');
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
