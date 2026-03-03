/**
 * MarketPOS Desktop - Local Server Manager
 * 
 * Gestiona el ciclo de vida del servidor Next.js standalone.
 * Se integra con el proceso principal de Electron.
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const PORT_RANGE_START = 43110;
const PORT_RANGE_END = 43200;
const HEALTH_CHECK_TIMEOUT = 300000; // 5 minutos (primer arranque puede initializar PostgreSQL)
const HEALTH_CHECK_INTERVAL = 1000;

// ============================================================================
// TIPOS
// ============================================================================

export interface LocalServer {
  port: number;
  url: string;
  process: ChildProcess;
  kill: () => Promise<void>;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Busca un puerto libre en el rango especificado
 */
async function findFreePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const isFree = await isPortFree(port);
    if (isFree) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Verifica si un puerto está libre
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Espera a que el servidor responda en /api/health
 */
function waitForServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > HEALTH_CHECK_TIMEOUT) {
        reject(new Error(`Server did not start within ${HEALTH_CHECK_TIMEOUT}ms`));
        return;
      }
      
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        method: 'GET',
        timeout: 2000,
      }, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(check, HEALTH_CHECK_INTERVAL);
        }
      });
      
      req.on('error', () => {
        setTimeout(check, HEALTH_CHECK_INTERVAL);
      });
      
      req.on('timeout', () => {
        req.destroy();
        setTimeout(check, HEALTH_CHECK_INTERVAL);
      });
      
      req.end();
    };
    
    check();
  });
}

/**
 * Carga variables de entorno desde un archivo .env
 */
function loadEnvFile(envPath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  
  if (!fs.existsSync(envPath)) {
    return vars;
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        let value = valueParts.join('=').trim();
        // Remover comillas
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        vars[key.trim()] = value;
      }
    }
  });
  
  return vars;
}


// ============================================================================
// SERVIDOR LOCAL
// ============================================================================

/**
 * Devuelve el ejecutable de Node.js a usar.
 * En producción (empaquetado con Electron) usa el propio ejecutable de Electron
 * con ELECTRON_RUN_AS_NODE=1, evitando la dependencia de Node.js del sistema.
 */
function getNodeExecutable(isPackaged: boolean): { bin: string; extraEnv: Record<string, string> } {
  if (isPackaged) {
    // El exe de Electron con ELECTRON_RUN_AS_NODE=1 se comporta como Node.js puro.
    return {
      bin: process.execPath,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }
  // En desarrollo: usar node del sistema
  return { bin: 'node', extraEnv: {} };
}

/**
 * Reintenta registros de tiendas pendientes en la nube.
 * Se ejecuta en background al arrancar la app.
 */
async function retryPendingRegistrations(
  dataDir: string,
  envVars: Record<string, string>
): Promise<void> {
  const pendingFile = path.join(dataDir, 'pending_registrations.json');
  if (!fs.existsSync(pendingFile)) return;

  const cloudUrl = envVars['CLOUD_URL'] || process.env.CLOUD_URL || '';
  const apiKey = envVars['LICENSE_API_KEY'] || process.env.LICENSE_API_KEY || '';
  if (!cloudUrl || !apiKey) return;

  let pending: any[] = [];
  try {
    pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  } catch {
    fs.unlinkSync(pendingFile);
    return;
  }

  if (!pending.length) {
    fs.unlinkSync(pendingFile);
    return;
  }

  console.log(`[LocalServer] Retrying ${pending.length} pending cloud registrations...`);

  // Esperar 10 segundos para que Render despierte si estaba dormido
  await new Promise(r => setTimeout(r, 10000));

  const remaining: any[] = [];
  for (const entry of pending) {
    try {
      const res = await (fetch as any)(`${cloudUrl}/api/license/register-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(entry),
      });
      if (res.ok) {
        console.log(`[LocalServer] Registered pending store: ${entry.storeName}`);
      } else {
        remaining.push(entry);
      }
    } catch (e: any) {
      console.warn(`[LocalServer] Retry failed for ${entry.storeName}:`, e.message);
      remaining.push(entry);
    }
  }

  if (remaining.length > 0) {
    fs.writeFileSync(pendingFile, JSON.stringify(remaining, null, 2));
    console.log(`[LocalServer] ${remaining.length} stores still pending (will retry next startup)`);
  } else {
    fs.unlinkSync(pendingFile);
    console.log('[LocalServer] All pending stores registered successfully');
  }
}

/**
 * Obtiene los datos de la tienda local.
 * Intenta leer store_info.json primero; si no existe,
 * llama al API local /api/desktop/license como fallback.
 */
async function getLocalStoreData(
  serverUrl: string,
  dataDir: string
): Promise<{ storeId: string; storeName: string; ownerEmail: string; ownerName?: string } | null> {
  // 1. Intentar leer store_info.json
  const storeInfoFile = path.join(dataDir, 'store_info.json');
  if (fs.existsSync(storeInfoFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(storeInfoFile, 'utf-8'));
      if (data?.storeId && data?.ownerEmail) {
        return data;
      }
    } catch { /* fallback al API */ }
  }

  // 2. Fallback: consultar API local (funciona para tiendas creadas con instaladores viejos)
  try {
    const res = await (fetch as any)(`${serverUrl}/api/desktop/license`, {
      headers: { 'x-desktop-app': 'true' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.storeId || !data?.ownerEmail) return null;

    // Guardar para futuras consultas
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(storeInfoFile, JSON.stringify({
        storeId: data.storeId,
        storeName: data.storeName,
        ownerEmail: data.ownerEmail,
        ownerName: data.ownerName,
      }, null, 2));
    } catch { /* no critical */ }

    return {
      storeId: data.storeId,
      storeName: data.storeName || '',
      ownerEmail: data.ownerEmail,
      ownerName: data.ownerName,
    };
  } catch {
    return null;
  }
}

/**
 * Inicia un polling que sincroniza la tienda con la nube cada 30s
 * hasta tener éxito. Funciona sin importar:
 * - Si la tienda fue creada con un installer viejo (sin store_info.json)
 * - Si Render está dormido (reintenta)
 * - Si la tienda aún no fue creada (espera a que aparezca)
 */
function startCloudSyncPolling(
  serverUrl: string,
  dataDir: string,
  envVars: Record<string, string>
): void {
  const cloudUrl = envVars['CLOUD_URL'] || process.env.CLOUD_URL || '';
  const apiKey = envVars['LICENSE_API_KEY'] || process.env.LICENSE_API_KEY || '';
  if (!cloudUrl || !apiKey) {
    console.warn('[CloudSync] CLOUD_URL or LICENSE_API_KEY not set, sync disabled');
    return;
  }

  const syncedFile = path.join(dataDir, '.cloud_synced');
  let attempts = 0;
  const MAX_ATTEMPTS = 60; // 30min máximo (60 x 30s)

  const trySync = async () => {
    attempts++;
    try {
      const storeData = await getLocalStoreData(serverUrl, dataDir);
      if (!storeData) {
        console.log(`[CloudSync] Attempt ${attempts}: No store data yet, will retry...`);
        return false;
      }

      console.log(`[CloudSync] Attempt ${attempts}: Syncing ${storeData.storeName} (${storeData.storeId})...`);

      const regRes = await (fetch as any)(`${cloudUrl}/api/license/register-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(storeData),
        signal: AbortSignal.timeout(25000),
      });

      if (regRes.ok) {
        const result = await regRes.json();
        console.log(`[CloudSync] SUCCESS: ${storeData.storeName} synced (${result.already ? 'already existed' : 'new registration'})`);
        // Marcar como sincronizado
        try {
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(syncedFile, new Date().toISOString());
        } catch { /* no critical */ }
        return true;
      }
      console.warn(`[CloudSync] Attempt ${attempts}: Server returned ${regRes.status}, will retry...`);
      return false;
    } catch (e: any) {
      console.warn(`[CloudSync] Attempt ${attempts}: Failed (${e.message}), will retry...`);
      return false;
    }
  };

  // Primer intento a los 8 segundos (dar tiempo a Next.js)
  setTimeout(async () => {
    const ok = await trySync();
    if (ok) return;

    // Si falló, seguir intentando cada 30 segundos
    const interval = setInterval(async () => {
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(`[CloudSync] Max attempts (${MAX_ATTEMPTS}) reached, stopping`);
        clearInterval(interval);
        return;
      }
      const ok = await trySync();
      if (ok) {
        clearInterval(interval);
      }
    }, 30000);
  }, 8000);
}

/**
 * Inicia el servidor Next.js standalone
 */
export async function startLocalServer(resourcesPath: string, isPackaged = true): Promise<LocalServer> {
  console.log('[LocalServer] Starting Next.js standalone server...');
  
  // Encontrar puerto libre
  const port = await findFreePort();
  console.log(`[LocalServer] Using port: ${port}`);
  
  // Encontrar servidor
  const serverDir = path.join(resourcesPath, 'server');
  const serverPath = path.join(serverDir, 'server.js');
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server not found at: ${serverPath}`);
  }
  
  console.log(`[LocalServer] Server path: ${serverPath}`);
  
  // Cargar variables de entorno
  const envPath = path.join(resourcesPath, '.env');
  const envVars = loadEnvFile(envPath);
  console.log(`[LocalServer] Loaded ${Object.keys(envVars).length} env vars`);
  
  // ⚠️ IMPORTANTE: DATABASE_URL de process.env tiene prioridad sobre .env
  // porque ensurePostgres() lo configura dinámicamente con el puerto correcto
  const databaseUrl = process.env.DATABASE_URL;
  
  // Directorio de datos de la app
  const monterrialDataDir = path.join(os.homedir(), 'Documents', 'MonterrialPOS');

  // Configurar entorno
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...envVars,
    NODE_ENV: 'production',
    PORT: port.toString(),
    HOSTNAME: '127.0.0.1',
    DESKTOP_MODE: 'true',
    MONTERRIAL_DATA_DIR: monterrialDataDir,
  };
  
  // Restaurar DATABASE_URL del proceso principal (PostgreSQL embebido)
  if (databaseUrl) {
    env.DATABASE_URL = databaseUrl;
    env.DIRECT_URL = databaseUrl;
    console.log(`[LocalServer] Using embedded PostgreSQL DATABASE_URL`);
  }
  
  // Lanzar proceso
  const { bin: nodeExec, extraEnv } = getNodeExecutable(isPackaged);
  console.log(`[LocalServer] Node executable: ${nodeExec}`);

  const serverProcess: ChildProcess = spawn(nodeExec, ['server.js'], {
    cwd: serverDir,
    env: { ...env, ...extraEnv } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  
  // Capturar logs
  serverProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Next.js] ${msg}`);
  });
  
  serverProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Next.js Error] ${msg}`);
  });
  
  serverProcess.on('error', (err: Error) => {
    console.error('[LocalServer] Process error:', err);
  });
  
  // Esperar a que esté listo
  console.log('[LocalServer] Waiting for server to be ready...');
  await waitForServer(port);

  // Reintentar registros de tiendas pendientes + iniciar polling de sync con cloud
  const url = `http://127.0.0.1:${port}`;
  retryPendingRegistrations(monterrialDataDir, envVars).catch(() => {});
  startCloudSyncPolling(url, monterrialDataDir, envVars);
  
  console.log(`[LocalServer] READY ${url}`);
  
  return {
    port,
    url,
    process: serverProcess,
    kill: () => {
      return new Promise<void>((resolve) => {
        if (serverProcess.killed) {
          resolve();
          return;
        }
        
        serverProcess.once('exit', () => {
          resolve();
        });
        
        serverProcess.kill('SIGTERM');
        
        // Forzar si no termina en 5 segundos
        setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    },
  };
}
