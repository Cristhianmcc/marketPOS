/**
 * D6-USB - USB Printer Module
 * Handles USB device detection and connection for ESC/POS printers
 *
 * Windows note: libusb cannot claim a USB interface that is owned by
 * the Windows usbprint.sys kernel driver (which Epson / standard USB
 * printers use).  On Windows we therefore try a native port-file write
 * first (\\.\USB001 / USB002…) before falling back to libusb.
 */

import * as usb from 'usb';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
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

// ============== Windows-native printing ==============

/**
 * PowerShell script that uses the Win32 Spooler API (winspool.drv) to send
 * raw ESC/POS bytes directly to a named printer — same path Windows uses
 * internally.  Works with ANY installed Windows printer driver (Epson,
 * Star, etc.) without driver replacement.
 *
 * Usage: powershell -File script.ps1 -PrinterName "EPSON TM-T20II" -FilePath "C:\...\escpos.bin"
 */
const WIN_RAW_PRINT_PS1 = `
param([string]$PrinterName, [string]$FilePath)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinSpool {
    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFO pDocInfo);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cdBuf, out int pcWritten);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$hPrinter = [IntPtr]::Zero
if (-not [WinSpool]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    Write-Error "OpenPrinter failed for: $PrinterName (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"; exit 1
}
$di = New-Object WinSpool+DOCINFO
$di.pDocName = "ESC/POS RAW"
$di.pOutputFile = $null
$di.pDataType = "RAW"
if (-not [WinSpool]::StartDocPrinter($hPrinter, 1, [ref]$di)) {
    [WinSpool]::ClosePrinter($hPrinter); Write-Error "StartDocPrinter failed"; exit 1
}
[WinSpool]::StartPagePrinter($hPrinter) | Out-Null
$written = 0
[WinSpool]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written) | Out-Null
[WinSpool]::EndPagePrinter($hPrinter) | Out-Null
[WinSpool]::EndDocPrinter($hPrinter) | Out-Null
[WinSpool]::ClosePrinter($hPrinter) | Out-Null
if ($written -eq $bytes.Length) { Write-Output "OK:$written"; exit 0 }
else { Write-Error "WritePrinter wrote $written of $($bytes.Length) bytes"; exit 1 }
`.trim();

/**
 * Get all real (non-virtual) Windows printer names.
 * Does NOT filter by port name — Epson TM uses ESDPRT001, not USB*.
 */
function listWindowsUsbPrinters(): string[] {
  try {
    // Exclude known virtual/software printers
    const ps = [
      `Get-WmiObject Win32_Printer`,
      `| Where-Object {`,
      `  $_.Name -notmatch 'OneNote|PDF|XPS|Fax|Virtual|Generic|Microsoft' -and`,
      `  $_.PortName -notmatch '^nul|^PORTPROMPT|^127\\.'`,
      `} | ForEach-Object { $_.Name }`,
    ].join(' ');
    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      timeout: 8000, encoding: 'utf8'
    }).trim();
    return out ? out.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Pick best printer name: prefer Epson/thermal keywords, otherwise first.
 */
function pickBestPrinter(names: string[], vendorId: number): string | null {
  if (!names.length) return null;
  // Prefer explicit thermal receipt printer keywords
  const thermal = names.find(n => /epson|tm-t|tm_t|star|bixolon|citizen|receipt|ticket/i.test(n));
  if (thermal) return thermal;
  // For Epson VID specifically, take anything with EPSON
  if (vendorId === 0x04B8) {
    const epson = names.find(n => /epson/i.test(n));
    if (epson) return epson;
  }
  return names[0];
}

/**
 * Send raw ESC/POS bytes to a Windows printer using the Win32 Spooler API
 * (winspool.drv → OpenPrinter / WritePrinter / ClosePrinter).
 *
 * This is the definitive Windows approach — works with official Epson driver,
 * no driver replacement needed.
 */
async function printWindowsNative(
  vendorId: number,
  productId: number,
  data: Buffer
): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  // 1. Discover USB printers installed in Windows
  const usbPrinters = listWindowsUsbPrinters();
  console.log(`[USB-WIN] Installed USB printers: [${usbPrinters.join(', ')}]`);

  const printerName = pickBestPrinter(usbPrinters, vendorId);
  if (!printerName) {
    console.warn('[USB-WIN] No USB printer found in Windows. Is the Epson driver installed?');
    return false;
  }
  console.log(`[USB-WIN] Selected printer: "${printerName}"`);

  // 2. Write ESC/POS bytes and PS1 script to temp files
  const tmpDir  = os.tmpdir();
  const binFile = path.join(tmpDir, `escpos_${Date.now()}.bin`);
  const ps1File = path.join(tmpDir, `escpos_print_${Date.now()}.ps1`);

  try {
    fs.writeFileSync(binFile, data);
    fs.writeFileSync(ps1File, WIN_RAW_PRINT_PS1, 'utf8');
  } catch (e) {
    console.error('[USB-WIN] Failed to write temp files:', e);
    return false;
  }

  try {
    // 3. Execute the PowerShell script (uses winspool.drv via P/Invoke)
    const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${ps1File}" -PrinterName "${printerName}" -FilePath "${binFile}"`;
    console.log(`[USB-WIN] Running: ${cmd}`);
    const result = execSync(cmd, { timeout: 20000, encoding: 'utf8' }).trim();
    console.log(`[USB-WIN] Result: ${result}`);
    if (result.startsWith('OK:')) {
      console.log(`[USB-WIN] ✓ Print OK via WinSpool → "${printerName}"`);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[USB-WIN] WinSpool print failed:', (e as Error).message);

    // 4. Last-resort fallback: copy /b to port file USB001..USB009
    console.log('[USB-WIN] Trying copy /b fallback...');
    for (let i = 1; i <= 9; i++) {
      const port = `\\\\.\\USB00${i}`;
      try {
        execSync(`cmd /c copy /b "${binFile}" "${port}"`, { timeout: 8000, encoding: 'utf8' });
        console.log(`[USB-WIN] copy /b OK via ${port}`);
        return true;
      } catch { /* try next */ }
    }
    return false;
  } finally {
    try { fs.unlinkSync(binFile); } catch { /* ignore */ }
    try { fs.unlinkSync(ps1File); } catch { /* ignore */ }
  }
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

export interface PrintResult {
  ok: boolean;
  detail: string;
}

/**
 * Print with auto-close.
 *
 * Returns { ok, detail } so callers can surface the real error to the user.
 *
 * Strategy:
 *  1. On Windows → WinSpool API via PowerShell P/Invoke (official Epson driver).
 *  2. Fallback → libusb direct transfer (Linux/macOS or WinUSB driver).
 */
export async function printAndClose(
  vendorId: number,
  productId: number,
  data: Buffer
): Promise<PrintResult> {

  // ── 1. Windows native path ──────────────────────────────────────────────
  if (process.platform === 'win32') {
    try {
      const ok = await printWindowsNative(vendorId, productId, data);
      if (ok) return { ok: true, detail: 'OK via WinSpool' };
      return { ok: false, detail: 'WinSpool: todos los métodos fallaron (ver log del proceso principal)' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[USB] Windows native error:', msg);
      return { ok: false, detail: `WinSpool error: ${msg}` };
    }
  }

  // ── 2. libusb path (Linux/macOS, or Windows with WinUSB driver) ─────────
  const connection = openUsbPrinter(vendorId, productId);
  if (!connection) {
    return { ok: false, detail: 'libusb: dispositivo no encontrado o no se pudo abrir' };
  }

  try {
    await sendToPrinter(connection, data);
    await new Promise(resolve => setTimeout(resolve, 500));
    connection.close();
    return { ok: true, detail: 'OK via libusb' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[USB] libusb print error:', msg);
    connection.close();
    return { ok: false, detail: `libusb error: ${msg}` };
  }
}

// ============== Diagnostics ==============

/**
 * Runs a full diagnostic and returns a plain-text report.
 * Exposed via IPC so the renderer can display it.
 */
export function diagnosePrinters(vendorId?: number, productId?: number): string {
  const lines: string[] = [];
  const ts = new Date().toLocaleTimeString();
  lines.push(`=== Diagnóstico de impresora USB (${ts}) ===`);
  lines.push(`Platform: ${process.platform}`);
  if (vendorId) lines.push(`VID: 0x${vendorId.toString(16).toUpperCase().padStart(4,'0')}  PID: 0x${(productId??0).toString(16).toUpperCase().padStart(4,'0')}`);

  // 1. libusb device list
  try {
    const usbDevices = usb.getDeviceList();
    const printers = usbDevices.filter(d => {
      try {
        const cfg = d.configDescriptor;
        if (cfg) return cfg.interfaces.some(i => i.some(a => a.bInterfaceClass === 0x07));
      } catch { /* ignore */ }
      const vid = d.deviceDescriptor.idVendor;
      return vid in KNOWN_PRINTER_VENDORS;
    });
    lines.push(`\n[libusb] Dispositivos USB detectados: ${usbDevices.length} total, ${printers.length} impresoras`);
    for (const p of printers) {
      const d = p.deviceDescriptor;
      lines.push(`  VID=0x${d.idVendor.toString(16).padStart(4,'0')} PID=0x${d.idProduct.toString(16).padStart(4,'0')} → ${getVendorName(d.idVendor) || 'Desconocido'}`);
    }
  } catch (e) {
    lines.push(`[libusb] Error listando dispositivos: ${e}`);
  }

  if (process.platform === 'win32') {
    // 2. All Windows printers
    try {
      const allPrinters = execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-WmiObject Win32_Printer | ForEach-Object { $_.Name + ' | Port=' + $_.PortName + ' | Status=' + $_.PrinterStatus }"`,
        { timeout: 8000, encoding: 'utf8' }
      ).trim();
      lines.push(`\n[Windows] Impresoras instaladas:`);
      (allPrinters || '(ninguna)').split(/\r?\n/).forEach(l => lines.push(`  ${l}`));
    } catch (e) {
      lines.push(`[Windows] Error consultando impresoras: ${e}`);
    }

    // 3. PnP USB printer entities
    try {
      const pnp = execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-WmiObject Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Printer' -or $_.Description -match 'print' } | ForEach-Object { $_.Name + ' | ' + $_.DeviceID }"`,
        { timeout: 8000, encoding: 'utf8' }
      ).trim();
      lines.push(`\n[PnP] Entidades de impresora:`);
      (pnp || '(ninguna)').split(/\r?\n/).forEach(l => lines.push(`  ${l}`));
    } catch (e) {
      lines.push(`[PnP] Error: ${e}`);
    }

    // 4. Available USB ports
    try {
      const ports = execSync(
        `powershell -NoProfile -NonInteractive -Command "[System.IO.Directory]::GetFiles('\\\\.\\') | Where-Object { $_ -match 'USB|COM|LPT' }"`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim();
      lines.push(`\n[Puertos] Puertos disponibles: ${ports || '(ninguno detectado)'}`);
    } catch (e) {
      lines.push(`[Puertos] Error listando puertos: ${e}`);
    }

    // 5. USB printer detection result
    const usbPrinters = listWindowsUsbPrinters();
    lines.push(`\n[Resultado] listWindowsUsbPrinters(): [${usbPrinters.join(', ') || 'VACÍO'}]`);
    if (usbPrinters.length === 0) {
      lines.push('  ⚠ CAUSA DEL ERROR: Ninguna impresora Windows con puerto USB*');
      lines.push('  → Verifica que el driver Epson TM-T20II esté instalado');
      lines.push('  → Abre "Dispositivos e impresoras" en Windows y confirma que aparece');
      lines.push('  → Descarga driver: https://download.epson-biz.com/modules/pos/index.php?page=single_soft&cid=7007');
    } else {
      lines.push(`  Impresora seleccionada: "${pickBestPrinter(usbPrinters, vendorId ?? 0x04B8) ?? '(ninguna)'}"`);
    }
  }

  return lines.join('\n');
}
