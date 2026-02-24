/**
 * D6.1 - Network Printer Module
 * Handles TCP/IP connection to ESC/POS printers on port 9100
 */

import * as net from 'net';
import * as iconv from 'iconv-lite';

// ============== Types ==============

export interface NetworkPrinterConfig {
  host: string;
  port: number;
  timeout: number;
}

export interface NetworkConnection {
  socket: net.Socket;
  write: (data: Buffer) => Promise<void>;
  close: () => Promise<void>;
}

export interface ConnectionResult {
  success: boolean;
  error?: string;
  details?: string;
}

// ============== Connection ==============

/**
 * Connect to a network printer via TCP
 */
export function connectNetworkPrinter(
  host: string,
  port: number = 9100,
  timeoutMs: number = 5000
): Promise<NetworkConnection> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let connected = false;
    let timeoutHandle: NodeJS.Timeout;

    // Set timeout
    timeoutHandle = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        reject(new Error('ETIMEDOUT: Connection timed out'));
      }
    }, timeoutMs);

    // Connection error handler
    socket.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutHandle);
      if (!connected) {
        let errorMessage = err.message;
        
        // Friendly error messages
        if (err.code === 'ECONNREFUSED') {
          errorMessage = 'Conexión rechazada. Verificar que la impresora esté encendida y accesible.';
        } else if (err.code === 'ETIMEDOUT') {
          errorMessage = 'Tiempo de espera agotado. Verificar IP y que la impresora esté en la misma red.';
        } else if (err.code === 'ENOTFOUND' || err.code === 'ENOENT') {
          errorMessage = 'Host no encontrado. Verificar la dirección IP.';
        } else if (err.code === 'ENETUNREACH') {
          errorMessage = 'Red no accesible. Verificar conexión de red.';
        } else if (err.code === 'EHOSTUNREACH') {
          errorMessage = 'Host no accesible. Verificar que la impresora esté encendida.';
        }
        
        reject(new Error(errorMessage));
      }
    });

    // Connect
    socket.connect(port, host, () => {
      connected = true;
      clearTimeout(timeoutHandle);

      const connection: NetworkConnection = {
        socket,
        
        write: (data: Buffer): Promise<void> => {
          return new Promise((res, rej) => {
            socket.write(data, (err) => {
              if (err) rej(err);
              else res();
            });
          });
        },
        
        close: (): Promise<void> => {
          return new Promise((res) => {
            socket.end(() => {
              socket.destroy();
              res();
            });
            // Force close after 1 second if not graceful
            setTimeout(() => {
              if (!socket.destroyed) {
                socket.destroy();
              }
              res();
            }, 1000);
          });
        },
      };

      resolve(connection);
    });
  });
}

// ============== Print and Close ==============

/**
 * Print data to network printer and close connection
 */
export async function printToNetworkPrinter(
  host: string,
  port: number,
  data: Buffer,
  timeoutMs: number = 5000
): Promise<ConnectionResult> {
  let connection: NetworkConnection | null = null;
  
  console.log('[NetworkPrinter] printToNetworkPrinter called');
  console.log('[NetworkPrinter] Host:', host, 'Port:', port, 'Data length:', data.length, 'Timeout:', timeoutMs);
  
  try {
    console.log('[NetworkPrinter] Connecting...');
    connection = await connectNetworkPrinter(host, port, timeoutMs);
    console.log('[NetworkPrinter] Connected, writing data...');
    await connection.write(data);
    console.log('[NetworkPrinter] Data written, waiting 300ms...');
    
    // Small delay to ensure data is sent
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log('[NetworkPrinter] Closing connection...');
    await connection.close();
    console.log('[NetworkPrinter] Connection closed successfully');
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[NetworkPrinter] Error:', message);
    
    // Ensure connection is closed
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore close error
      }
    }
    
    return { 
      success: false, 
      error: message,
      details: error instanceof Error ? error.stack : undefined,
    };
  }
}

// ============== Validation ==============

/**
 * Validate IP address format
 */
export function isValidIp(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  
  // Also allow hostnames
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return hostnameRegex.test(ip);
}

/**
 * Validate port number
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}
