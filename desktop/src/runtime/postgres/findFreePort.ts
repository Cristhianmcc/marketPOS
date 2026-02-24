/**
 * D7.1 - Find Free Port
 * Finds an available port for PostgreSQL
 */

import * as net from 'net';

const DEFAULT_PORT = 54329; // Non-standard port to avoid conflicts
const PORT_RANGE_START = 54329;
const PORT_RANGE_END = 54399;

/**
 * Check if a port is free
 * @param port Port number to check
 * @returns True if port is free
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find a free port in the configured range
 * @param preferredPort Preferred port to try first (default: 54329)
 * @returns Available port number
 * @throws Error if no free port found
 */
export async function findFreePort(preferredPort: number = DEFAULT_PORT): Promise<number> {
  // Try preferred port first
  if (await isPortFree(preferredPort)) {
    return preferredPort;
  }
  
  console.log(`[findFreePort] Port ${preferredPort} is in use, searching for alternative...`);
  
  // Search in range
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (port === preferredPort) continue; // Already tried
    
    if (await isPortFree(port)) {
      console.log(`[findFreePort] Found free port: ${port}`);
      return port;
    }
  }
  
  throw new Error(`No free port found in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Check if a specific port is in use (opposite of isPortFree)
 * Used to verify PostgreSQL is listening
 * @param port Port to check
 * @param host Host to check (default: 127.0.0.1)
 * @returns True if something is listening on the port
 */
export function isPortInUse(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    
    client.once('connect', () => {
      client.destroy();
      resolve(true);
    });
    
    client.once('error', () => {
      client.destroy();
      resolve(false);
    });
    
    client.connect(port, host);
  });
}

/**
 * Wait for a port to become ready (something listening)
 * @param port Port to wait for
 * @param timeoutMs Maximum wait time in milliseconds
 * @param intervalMs Check interval in milliseconds
 * @returns True if port became ready, false if timeout
 */
export async function waitForPort(
  port: number,
  timeoutMs: number = 15000,
  intervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await isPortInUse(port)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  return false;
}
