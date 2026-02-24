/**
 * D6.1 - Ping Printer Module
 * Quick connectivity test for network printers
 */

import * as net from 'net';

// ============== Types ==============

export interface PingResult {
  ok: boolean;
  reason?: string;
  latencyMs?: number;
}

// ============== Ping ==============

/**
 * Quick TCP ping to test printer connectivity
 * Just opens a connection and closes it immediately
 */
export function pingPrinter(
  host: string,
  port: number = 9100,
  timeoutMs: number = 2000
): Promise<PingResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    // Timeout
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        ok: false,
        reason: 'Timeout: no response in ' + timeoutMs + 'ms',
      });
    }, timeoutMs);

    // Error handler
    socket.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      cleanup();
      
      let reason = err.message;
      if (err.code === 'ECONNREFUSED') {
        reason = 'Connection refused';
      } else if (err.code === 'ETIMEDOUT') {
        reason = 'Connection timed out';
      } else if (err.code === 'ENOTFOUND') {
        reason = 'Host not found';
      } else if (err.code === 'ENETUNREACH') {
        reason = 'Network unreachable';
      } else if (err.code === 'EHOSTUNREACH') {
        reason = 'Host unreachable';
      }
      
      resolve({ ok: false, reason });
    });

    // Connect
    socket.connect(port, host, () => {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      
      // Close connection immediately
      socket.end();
      socket.destroy();
      resolved = true;
      
      resolve({ ok: true, latencyMs });
    });
  });
}

// ============== Batch Ping ==============

/**
 * Ping multiple printers and return results
 * Useful for network printer discovery
 */
export async function pingMultiplePrinters(
  targets: Array<{ host: string; port?: number }>,
  timeoutMs: number = 1000
): Promise<Array<{ host: string; port: number; result: PingResult }>> {
  const results = await Promise.all(
    targets.map(async ({ host, port = 9100 }) => {
      const result = await pingPrinter(host, port, timeoutMs);
      return { host, port, result };
    })
  );
  
  return results;
}

// ============== Network Scan (Simple) ==============

/**
 * Scan a subnet for printers on port 9100
 * Example: scanSubnet("192.168.1", 1, 254) scans 192.168.1.1-254
 * Warning: Can be slow, use sparingly
 */
export async function scanSubnetForPrinters(
  baseIp: string,
  startHost: number = 1,
  endHost: number = 254,
  port: number = 9100,
  timeoutMs: number = 500
): Promise<Array<{ ip: string; latencyMs: number }>> {
  const printers: Array<{ ip: string; latencyMs: number }> = [];
  
  // Scan in batches of 20 to avoid overwhelming the network
  const batchSize = 20;
  
  for (let i = startHost; i <= endHost; i += batchSize) {
    const batch: Promise<void>[] = [];
    
    for (let j = i; j < Math.min(i + batchSize, endHost + 1); j++) {
      const ip = `${baseIp}.${j}`;
      batch.push(
        pingPrinter(ip, port, timeoutMs).then((result) => {
          if (result.ok && result.latencyMs !== undefined) {
            printers.push({ ip, latencyMs: result.latencyMs });
          }
        })
      );
    }
    
    await Promise.all(batch);
  }
  
  return printers.sort((a, b) => a.latencyMs - b.latencyMs);
}
