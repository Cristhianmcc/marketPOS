/**
 * D6-BT - Bluetooth Serial Printer Module
 *
 * On Windows, a Bluetooth thermal printer paired via Windows Settings
 * appears as a virtual COM port (COMx with description "Bluetooth Serial Port").
 * We write raw ESC/POS bytes over that port — no driver needed.
 *
 * Flow:
 *  1. User pairs printer in Windows Bluetooth settings (one-time setup)
 *  2. Windows creates COM4 / COM5 / etc. automatically
 *  3. This module lists all COM ports, highlighting Bluetooth ones
 *  4. User selects their port; app saves it and uses it for every print
 */

import { SerialPort } from 'serialport';

// ============== Types ==============

export interface BtPortInfo {
  /** e.g. "COM4" */
  path: string;
  /** Human-readable label shown in UI */
  friendlyName: string;
  /** True when Windows reports this as a Bluetooth Serial Port */
  isBluetooth: boolean;
}

// ============== Discovery ==============

/**
 * Returns all available COM/serial ports.
 * Ports whose friendlyName or manufacturer includes "bluetooth" are flagged.
 */
export async function listBluetoothPorts(): Promise<BtPortInfo[]> {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => {
      // serialport PortInfo may include friendlyName on Windows at runtime
      const winFriendly = (p as unknown as Record<string, unknown>).friendlyName as string | undefined;
      const label = [winFriendly, p.manufacturer, p.pnpId]
        .filter(Boolean)
        .join(' ');
      const isBluetooth = /bluetooth/i.test(label);
      const friendlyName = winFriendly || p.manufacturer || p.path;
      return { path: p.path, friendlyName, isBluetooth };
    });
  } catch (err) {
    console.error('[BT] Error listing serial ports:', err);
    return [];
  }
}

// ============== Print ==============

/**
 * Opens the given COM port, writes ESC/POS bytes, drains, and closes.
 * Times out if the port is unreachable (printer off / out of range).
 */
export async function printViaBluetooth(
  portPath: string,
  data: Buffer,
  baudRate: number = 9600,
  timeoutMs: number = 8000,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try { port.removeAllListeners(); port.close(() => {}); } catch {}
      settle({ success: false, error: 'Timeout: la impresora no respondió. Verifica que esté encendida y en rango Bluetooth.' });
    }, timeoutMs);

    const port = new SerialPort({ path: portPath, baudRate, autoOpen: false });

    port.open((openErr) => {
      if (openErr) {
        settle({ success: false, error: `No se pudo abrir ${portPath}: ${openErr.message}` });
        return;
      }

      port.write(data, 'binary', (writeErr) => {
        if (writeErr) {
          try { port.close(() => {}); } catch {}
          settle({ success: false, error: `Error al escribir datos: ${writeErr.message}` });
          return;
        }

        port.drain((drainErr) => {
          try { port.close(() => {}); } catch {}
          if (drainErr) {
            settle({ success: false, error: `Error al vaciar buffer: ${drainErr.message}` });
          } else {
            settle({ success: true });
          }
        });
      });
    });

    port.on('error', (err) => {
      settle({ success: false, error: `Error en puerto serie: ${err.message}` });
    });
  });
}
