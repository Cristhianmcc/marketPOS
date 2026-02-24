/**
 * D6.2 - Raster Print Transport Layer
 * 
 * Provides unified interface for USB and Network ESC/POS printing.
 * Reuses D6 (USB) and D6.1 (Network) connections.
 */

import { printAndClose } from '../escpos/usbPrinter';
import { printToNetworkPrinter } from '../escpos/networkPrinter';
import { RasterTransport } from '../escpos/types';

// ============== Types ==============

export interface TransportConfig {
  mode: RasterTransport;
  // USB
  vendorId?: number;
  productId?: number;
  // Network
  netHost?: string;
  netPort?: number;
  netTimeout?: number;
}

export interface TransportResult {
  success: boolean;
  error?: string;
}

// ============== Unified Transport ==============

/**
 * Send raw bytes to printer via configured transport.
 * 
 * @param config - Transport configuration (USB or NET)
 * @param data - Raw ESC/POS data buffer
 * @returns Result with success status
 */
export async function sendViaTrasport(
  config: TransportConfig,
  data: Buffer
): Promise<TransportResult> {
  if (config.mode === 'USB') {
    return sendViaUsb(config, data);
  } else {
    return sendViaNetwork(config, data);
  }
}

// ============== USB Transport ==============

/**
 * Send data via USB transport.
 */
async function sendViaUsb(
  config: TransportConfig,
  data: Buffer
): Promise<TransportResult> {
  const { vendorId, productId } = config;

  if (!vendorId || !productId) {
    return {
      success: false,
      error: 'USB: vendorId y productId requeridos',
    };
  }

  try {
    const success = await printAndClose(vendorId, productId, data);
    
    if (success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: 'USB: No se pudo enviar datos a la impresora',
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `USB: ${message}`,
    };
  }
}

// ============== Network Transport ==============

/**
 * Send data via Network transport.
 */
async function sendViaNetwork(
  config: TransportConfig,
  data: Buffer
): Promise<TransportResult> {
  const { netHost, netPort = 9100, netTimeout = 5000 } = config;

  if (!netHost) {
    return {
      success: false,
      error: 'Network: dirección IP requerida',
    };
  }

  try {
    const result = await printToNetworkPrinter(netHost, netPort, data, netTimeout);
    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || 'Network: Error desconocido',
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Network: ${message}`,
    };
  }
}

// ============== Transport Validation ==============

/**
 * Validate transport configuration.
 */
export function validateTransportConfig(config: TransportConfig): string | null {
  if (config.mode === 'USB') {
    if (!config.vendorId || !config.productId) {
      return 'Debe seleccionar una impresora USB';
    }
  } else {
    if (!config.netHost) {
      return 'Debe ingresar la dirección IP de la impresora';
    }
    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(config.netHost)) {
      return 'Dirección IP inválida';
    }
    if (config.netPort && (config.netPort < 1 || config.netPort > 65535)) {
      return 'Puerto inválido (1-65535)';
    }
  }
  return null;
}

/**
 * Build transport config from escpos config.
 */
export function buildTransportConfig(escposConfig: {
  rasterTransport: RasterTransport;
  vendorId?: number | null;
  productId?: number | null;
  netHost?: string | null;
  netPort?: number;
  netTimeout?: number;
}): TransportConfig {
  return {
    mode: escposConfig.rasterTransport,
    vendorId: escposConfig.vendorId ?? undefined,
    productId: escposConfig.productId ?? undefined,
    netHost: escposConfig.netHost ?? undefined,
    netPort: escposConfig.netPort,
    netTimeout: escposConfig.netTimeout,
  };
}
