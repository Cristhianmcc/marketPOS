/**
 * D6-USB / D6.1-NET - ESC/POS Types
 * Type definitions for USB and Network thermal printing
 */

// ============== USB Device ==============

export interface UsbDevice {
  vendorId: number;
  productId: number;
  name: string;
  manufacturer?: string;
  serialNumber?: string;
  path?: string;
}

// ============== Printer Config ==============

export type PrinterMode = 'HTML' | 'ESCPOS_USB' | 'ESCPOS_NET' | 'ESCPOS_RASTER' | 'ESCPOS_BT';

export type RasterTransport = 'USB' | 'NET';
export type RasterWidth = 512 | 576 | 640;

export interface EscposConfig {
  mode: PrinterMode;
  // USB settings
  vendorId: number | null;
  productId: number | null;
  // Network settings
  netHost: string | null;
  netPort: number;
  netTimeout: number;
  // Bluetooth settings
  btPort: string | null;
  btBaud: number;
  // Common settings
  charsPerLine: 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: 'CP437' | 'CP850' | 'CP858' | 'ISO8859_15';
  // Raster settings (D6.2)
  rasterTransport: RasterTransport;
  rasterWidthPx: RasterWidth;
  rasterDither: boolean;
  rasterCut: boolean;
  rasterOpenDrawer: boolean;
  rasterMarginTopPx: number;
  rasterMarginLeftPx: number;
}

export const DEFAULT_ESCPOS_CONFIG: EscposConfig = {
  mode: 'HTML',
  vendorId: null,
  productId: null,
  netHost: null,
  netPort: 9100,
  netTimeout: 5000,
  btPort: null,
  btBaud: 9600,
  charsPerLine: 42,
  autoCut: true,
  openCashDrawer: false,
  encoding: 'CP858', // Supports € symbol
  // Raster defaults (D6.2)
  rasterTransport: 'USB',
  rasterWidthPx: 576,
  rasterDither: true,
  rasterCut: true,
  rasterOpenDrawer: false,
  rasterMarginTopPx: 0,
  rasterMarginLeftPx: 0,
};

// ============== Print Data ==============

export interface PrintStoreInfo {
  name: string;
  ruc?: string;
  address?: string;
  phone?: string;
}

export interface PrintSaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount?: number;
  unit?: string;
}

export interface PrintDiscount {
  type: 'item' | 'order' | 'coupon' | 'promo';
  description: string;
  amount: number;
}

export interface PrintPayment {
  method: 'CASH' | 'CARD' | 'YAPE' | 'PLIN' | 'TRANSFER' | 'FIADO' | 'MIXED';
  amountPaid?: number;
  change?: number;
  customerName?: string;   // For FIADO
  customerBalance?: number; // For FIADO
}

export interface PrintSaleData {
  store: PrintStoreInfo;
  saleNumber: string;
  date: string;
  time: string;
  items: PrintSaleItem[];
  subtotal: number;
  totalDiscount: number;
  total: number;
  discounts?: PrintDiscount[];
  payment: PrintPayment;
  cashierName?: string;
  footer?: string;
}

// ============== Print Result ==============

export interface PrintResult {
  success: boolean;
  error?: string;
  fallbackToHtml?: boolean;
}

// ============== Common VendorIds ==============

export const KNOWN_PRINTER_VENDORS: Record<number, string> = {
  // Major thermal printer brands
  0x04b8: 'EPSON',
  0x0519: 'Star Micronics / Sewoo',
  0x0dd4: 'Custom Engineering',
  0x2730: 'Citizen',
  0x04f9: 'Brother',
  0x1504: 'NCR',
  0x0416: 'Winbond',
  0x0fe6: 'ICS / Desire2',
  0x0483: 'STMicroelectronics',
  0x0471: 'Philips',
  0x0a5f: 'Zebra Technologies',
  // Chinese / generic thermal printers (most common in Peru/LatAm)
  0x28e9: 'GD32 (Xprinter / Rongta / Gprinter / HPRT)',
  0x154f: 'POS-X / HPRT',
  0x20d1: 'Handheld Group',
  0x1659: 'DASCOM',
  0x6868: 'Generic Thermal POS',
  0x1b5f: 'Bixolon',
  0x0525: 'Netchip (Generic POS)',
  0x1a61: 'Pertech Industries',
  // USB-Serial bridges (many cheap printers use these)
  0x067b: 'Prolific PL2303 (USB-Serial)',
  0x1a86: 'CH340/CH341 (USB-Serial)',
  0x0403: 'FTDI FT232 (USB-Serial)',
  0x10c4: 'Silicon Labs CP210x (USB-Serial)',
};

export function getVendorName(vendorId: number): string {
  return KNOWN_PRINTER_VENDORS[vendorId] || `Unknown (0x${vendorId.toString(16)})`;
}
