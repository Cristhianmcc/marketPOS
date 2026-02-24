/**
 * MarketPOS Desktop - Next.js Standalone Server Launcher
 * 
 * Este script inicia el servidor Next.js standalone para el modo desktop.
 * Detecta un puerto libre, lanza el servidor y espera hasta que esté listo.
 * 
 * Uso: npx ts-node scripts/desktop/start-next-standalone.ts
 * O desde compiled: node dist/start-next-standalone.js
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const DEFAULT_PORT = 43110;
const PORT_RANGE_START = 43110;
const PORT_RANGE_END = 43200;
const HEALTH_CHECK_TIMEOUT = 30000; // 30 segundos máximo
const HEALTH_CHECK_INTERVAL = 500;  // Cada 500ms

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Busca un puerto libre en el rango especificado
 */
async function findFreePort(start: number = PORT_RANGE_START, end: number = PORT_RANGE_END): Promise<number> {
  for (let port = start; port <= end; port++) {
    const isFree = await isPortFree(port);
    if (isFree) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${start}-${end}`);
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
function waitForServer(port: number, timeout: number = HEALTH_CHECK_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > timeout) {
        reject(new Error(`Server did not start within ${timeout}ms`));
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
 * Encuentra la ruta del servidor standalone
 */
function findServerPath(): string {
  // En desarrollo: .next/standalone/server.js
  const devPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  
  // En producción empaquetada: resources/server/server.js
  const prodPath = path.join(process.resourcesPath || '', 'server', 'server.js');
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }
  
  throw new Error('Next.js standalone server not found. Did you run: DESKTOP_BUILD=1 npm run build?');
}

// ============================================================================
// SERVIDOR
// ============================================================================

export interface ServerInstance {
  port: number;
  url: string;
  process: ChildProcess;
  kill: () => void;
}

/**
 * Inicia el servidor Next.js standalone
 */
export async function startServer(envVars?: Record<string, string>): Promise<ServerInstance> {
  console.log('[Server] Starting Next.js standalone server...');
  
  // Encontrar puerto libre
  const port = await findFreePort();
  console.log(`[Server] Using port: ${port}`);
  
  // Encontrar servidor
  const serverPath = findServerPath();
  const serverDir = path.dirname(serverPath);
  console.log(`[Server] Server path: ${serverPath}`);
  
  // Variables de entorno
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NODE_ENV: 'production',
    PORT: port.toString(),
    HOSTNAME: '127.0.0.1',
    ...envVars,
  };
  
  // Cargar .env si existe
  const envPath = path.join(serverDir, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key) {
          let value = valueParts.join('=').trim();
          // Remover comillas
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key.trim()] = value;
        }
      }
    });
    console.log('[Server] Loaded .env file');
  }
  
  // Lanzar proceso
  const serverProcess: ChildProcess = spawn('node', ['server.js'], {
    cwd: serverDir,
    env: env as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
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
    console.error('[Server] Process error:', err);
  });
  
  serverProcess.on('exit', (code: number | null) => {
    console.log(`[Server] Process exited with code: ${code}`);
  });
  
  // Esperar a que esté listo
  console.log('[Server] Waiting for server to be ready...');
  await waitForServer(port);
  
  const url = `http://127.0.0.1:${port}`;
  console.log(`[Server] READY ${url}`);
  
  return {
    port,
    url,
    process: serverProcess,
    kill: () => {
      if (!serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        // Forzar si no termina en 5 segundos
        setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
        }, 5000);
      }
    },
  };
}

// ============================================================================
// CLI
// ============================================================================

// Si se ejecuta directamente
if (require.main === module) {
  startServer()
    .then((server) => {
      console.log(`\n✅ Server running at: ${server.url}\n`);
      console.log('Press Ctrl+C to stop.\n');
      
      // Manejar cierre
      process.on('SIGINT', () => {
        console.log('\n[Server] Shutting down...');
        server.kill();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        server.kill();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
