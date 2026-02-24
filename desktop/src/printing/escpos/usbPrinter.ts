/**
 * D6-USB - USB Printer Module
 * Handles USB device detection and connection for ESC/POS printers
 */

import * as usb from 'usb';
import { UsbDevice, getVendorName, KNOWN_PRINTER_VENDORS } from './types';

// ============== USB Device Discovery ==============

/**
 * List all USB devices that could be printers
 * Filters by known printer vendor IDs or devices with printer interface
 */
export function listUsbPrinters(): UsbDevice[] {
  const devices: UsbDevice[] = [];
  
  try {
    const usbDevices = usb.getDeviceList();
    
    for (const device of usbDevices) {
      const desc = device.deviceDescriptor;
      
      // Check if it's a known printer vendor or has printer class (0x07)
      const isPrinterClass = checkPrinterClass(device);
      const isKnownVendor = isKnownPrinterVendor(desc.idVendor);
      
      if (isPrinterClass || isKnownVendor) {
        let name = getVendorName(desc.idVendor);
        let manufacturer = '';
        let serialNumber = '';
        
        // Try to get string descriptors (may fail without driver)
        try {
          device.open();
          
          if (desc.iManufacturer) {
            manufacturer = getStringDescriptor(device, desc.iManufacturer);
          }
          if (desc.iProduct) {
            name = getStringDescriptor(device, desc.iProduct) || name;
          }
          if (desc.iSerialNumber) {
            serialNumber = getStringDescriptor(device, desc.iSerialNumber);
          }
          
          device.close();
        } catch {
          // Device might be in use or need driver
        }
        
        devices.push({
          vendorId: desc.idVendor,
          productId: desc.idProduct,
          name: name || `Printer ${desc.idVendor.toString(16)}:${desc.idProduct.toString(16)}`,
          manufacturer,
          serialNumber,
        });
      }
    }
  } catch (error) {
    console.error('[USB] Error listing devices:', error);
  }
  
  return devices;
}

/**
 * Check if device has printer interface class (0x07)
 * Tries reading configDescriptor directly first (works on Windows without open),
 * then falls back to briefly opening the device.
 */
function checkPrinterClass(device: usb.Device): boolean {
  // First try: read without opening (works on Windows for most devices)
  try {
    const configDesc = device.configDescriptor;
    if (configDesc) {
      for (const iface of configDesc.interfaces) {
        for (const alt of iface) {
          if (alt.bInterfaceClass === 0x07) return true;
        }
      }
    }
  } catch {
    // Silent - try opening below
  }

  // Second try: open device to read descriptor
  try {
    device.open();
    const configDesc = device.configDescriptor;
    device.close();
    if (configDesc) {
      for (const iface of configDesc.interfaces) {
        for (const alt of iface) {
          if (alt.bInterfaceClass === 0x07) return true;
        }
      }
    }
  } catch {
    // Device in use or access denied - ignore
  }

  return false;
}

/**
 * Check if vendor ID is a known printer manufacturer
 * Uses the centralized list from types.ts
 */
function isKnownPrinterVendor(vendorId: number): boolean {
  return vendorId in KNOWN_PRINTER_VENDORS;
}

/**
 * Get USB string descriptor
 */
function getStringDescriptor(device: usb.Device, index: number): string {
  return new Promise<string>((resolve) => {
    device.getStringDescriptor(index, (error, value) => {
      resolve(error ? '' : (value || ''));
    });
  }) as unknown as string;
}

// ============== USB Connection ==============

export interface UsbConnection {
  device: usb.Device;
  endpoint: usb.OutEndpoint;
  close: () => void;
}

/**
 * Open USB connection to a specific printer
 */
export function openUsbPrinter(vendorId: number, productId: number): UsbConnection | null {
  try {
    const device = usb.findByIds(vendorId, productId);
    
    if (!device) {
      console.error(`[USB] Device not found: ${vendorId.toString(16)}:${productId.toString(16)}`);
      return null;
    }
    
    device.open();
    
    // Claim interface (usually 0 for printers)
    const iface = device.interface(0);
    
    // On Windows, may need to detach kernel driver
    if (process.platform !== 'win32' && iface.isKernelDriverActive()) {
      iface.detachKernelDriver();
    }
    
    iface.claim();
    
    // Find OUT endpoint for printing
    const outEndpoint = findOutEndpoint(iface);
    
    if (!outEndpoint) {
      device.close();
      console.error('[USB] No OUT endpoint found');
      return null;
    }
    
    return {
      device,
      endpoint: outEndpoint,
      close: () => {
        try {
          iface.release(() => {
            device.close();
          });
        } catch (e) {
          console.error('[USB] Error closing:', e);
        }
      },
    };
  } catch (error) {
    console.error('[USB] Error opening device:', error);
    return null;
  }
}

/**
 * Find the OUT endpoint for printing
 */
function findOutEndpoint(iface: usb.Interface): usb.OutEndpoint | null {
  for (const endpoint of iface.endpoints) {
    // OUT endpoint (direction = OUT)
    if (endpoint.direction === 'out') {
      return endpoint as usb.OutEndpoint;
    }
  }
  return null;
}

// ============== Raw Print ==============

/**
 * Send raw bytes to USB printer
 */
export function sendToPrinter(connection: UsbConnection, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.endpoint.transfer(data, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Print with auto-close
 */
export async function printAndClose(
  vendorId: number,
  productId: number,
  data: Buffer
): Promise<boolean> {
  const connection = openUsbPrinter(vendorId, productId);
  
  if (!connection) {
    return false;
  }
  
  try {
    await sendToPrinter(connection, data);
    
    // Wait a bit for print to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    connection.close();
    return true;
  } catch (error) {
    console.error('[USB] Print error:', error);
    connection.close();
    return false;
  }
}
