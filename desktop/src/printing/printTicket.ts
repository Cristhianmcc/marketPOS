/**
 * MÓDULO D6: Thermal Printer Desktop
 * 
 * Impresión de tickets 80mm desde Electron.
 * Usa webContents.print() para impresión nativa estable en Windows.
 */

import { BrowserWindow, PrinterInfo } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// ============================================================================
// TIPOS
// ============================================================================

export interface PrinterConfig {
  defaultPrinter: string | null;
  paperWidth: '58mm' | '80mm';
  silentPrint: boolean;
  copies: number;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface PrintResult {
  success: boolean;
  error?: string;
  printerName?: string;
}

export interface PrintOptions {
  printerName?: string;
  silent?: boolean;
  copies?: number;
  preview?: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: PrinterConfig = {
  defaultPrinter: null,
  paperWidth: '80mm',
  silentPrint: true,
  copies: 1,
  margins: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
};

// Paper width in pixels (assuming 203 DPI for thermal printers)
const PAPER_WIDTHS = {
  '58mm': 164,  // ~58mm at 72 DPI
  '80mm': 226,  // ~80mm at 72 DPI
};

// ============================================================================
// PRINTER MANAGER CLASS
// ============================================================================

export class PrinterManager {
  private config: PrinterConfig;
  private configPath: string;
  private serverUrl: string;
  private printWindow: BrowserWindow | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.configPath = path.join(app.getPath('userData'), 'printer-config.json');
    this.config = this.loadConfig();
  }

  // --------------------------------------------------------------------------
  // CONFIG MANAGEMENT
  // --------------------------------------------------------------------------

  private loadConfig(): PrinterConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[PrinterManager] Error loading config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[PrinterManager] Error saving config:', error);
    }
  }

  getConfig(): PrinterConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PrinterConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  // --------------------------------------------------------------------------
  // PRINTER DISCOVERY
  // --------------------------------------------------------------------------

  async getPrinters(): Promise<PrinterInfo[]> {
    // Create a hidden window to get printer list
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      // Electron 28+ uses getPrintersAsync
      const printers = await win.webContents.getPrintersAsync();
      return printers;
    } finally {
      win.destroy();
    }
  }

  async getDefaultPrinter(): Promise<string | null> {
    const printers = await this.getPrinters();
    const defaultPrinter = printers.find(p => p.isDefault);
    return defaultPrinter?.name || null;
  }

  // --------------------------------------------------------------------------
  // PRINT WINDOW
  // --------------------------------------------------------------------------

  private createPrintWindow(): BrowserWindow {
    if (this.printWindow && !this.printWindow.isDestroyed()) {
      return this.printWindow;
    }

    this.printWindow = new BrowserWindow({
      show: false,
      width: PAPER_WIDTHS[this.config.paperWidth],
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
      },
    });

    return this.printWindow;
  }

  private destroyPrintWindow(): void {
    if (this.printWindow && !this.printWindow.isDestroyed()) {
      this.printWindow.destroy();
      this.printWindow = null;
    }
  }

  // --------------------------------------------------------------------------
  // PRINT TICKET
  // --------------------------------------------------------------------------

  async printTicket(saleId: string, options: PrintOptions = {}): Promise<PrintResult> {
    const printerName = options.printerName || this.config.defaultPrinter;
    const silent = options.silent ?? this.config.silentPrint;
    const copies = options.copies ?? this.config.copies;

    if (!printerName && silent) {
      return { 
        success: false, 
        error: 'No hay impresora configurada. Configure una impresora en Ajustes.' 
      };
    }

    try {
      console.log(`[PrinterManager] Printing ticket for sale: ${saleId}`);

      // Create print window
      const win = this.createPrintWindow();

      // Load receipt page
      const receiptUrl = `${this.serverUrl}/receipt/${saleId}?print=true&thermal=true`;
      await win.loadURL(receiptUrl);

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Print options
      const printOptions: Electron.WebContentsPrintOptions = {
        silent,
        printBackground: true,
        deviceName: printerName || undefined,
        copies,
        margins: {
          marginType: 'custom',
          top: this.config.margins.top,
          bottom: this.config.margins.bottom,
          left: this.config.margins.left,
          right: this.config.margins.right,
        },
        pageSize: {
          width: PAPER_WIDTHS[this.config.paperWidth] * 1000, // microns
          height: 297000, // A4 height in microns (will auto-cut)
        },
        scaleFactor: 100,
      };

      // Show preview if requested
      if (options.preview) {
        win.show();
        win.webContents.openDevTools({ mode: 'detach' });
        return { success: true, printerName: printerName || 'preview' };
      }

      // Print
      return new Promise((resolve) => {
        win.webContents.print(printOptions, (success, failureReason) => {
          this.destroyPrintWindow();
          
          if (success) {
            console.log(`[PrinterManager] Print successful: ${printerName}`);
            resolve({ success: true, printerName: printerName || undefined });
          } else {
            console.error(`[PrinterManager] Print failed: ${failureReason}`);
            resolve({ 
              success: false, 
              error: failureReason || 'Error de impresión desconocido',
              printerName: printerName || undefined,
            });
          }
        });
      });
    } catch (error) {
      this.destroyPrintWindow();
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[PrinterManager] Print error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // --------------------------------------------------------------------------
  // PRINT HTML DIRECTLY
  // --------------------------------------------------------------------------

  async printHtml(html: string, options: PrintOptions = {}): Promise<PrintResult> {
    const printerName = options.printerName || this.config.defaultPrinter;
    const silent = options.silent ?? this.config.silentPrint;
    const copies = options.copies ?? this.config.copies;

    if (!printerName && silent) {
      return { 
        success: false, 
        error: 'No hay impresora configurada' 
      };
    }

    try {
      const win = this.createPrintWindow();

      // Load HTML content
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 300));

      const printOptions: Electron.WebContentsPrintOptions = {
        silent,
        printBackground: true,
        deviceName: printerName || undefined,
        copies,
        margins: {
          marginType: 'custom',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      };

      return new Promise((resolve) => {
        win.webContents.print(printOptions, (success, failureReason) => {
          this.destroyPrintWindow();
          
          if (success) {
            resolve({ success: true, printerName: printerName || undefined });
          } else {
            resolve({ 
              success: false, 
              error: failureReason || 'Error de impresión',
              printerName: printerName || undefined,
            });
          }
        });
      });
    } catch (error) {
      this.destroyPrintWindow();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  // --------------------------------------------------------------------------
  // TEST PRINT
  // --------------------------------------------------------------------------

  async printTest(printerName?: string): Promise<PrintResult> {
    const printer = printerName || this.config.defaultPrinter;
    
    if (!printer) {
      return { success: false, error: 'Seleccione una impresora' };
    }

    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: ${this.config.paperWidth === '80mm' ? '72mm' : '54mm'};
            padding: 2mm;
          }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          h1 { font-size: 14px; margin-bottom: 4px; }
          p { margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <h1>PRUEBA DE IMPRESIÓN</h1>
          <p>Monterrial POS Desktop</p>
          <div class="line"></div>
          <p>Impresora: ${printer}</p>
          <p>Ancho: ${this.config.paperWidth}</p>
          <p>Fecha: ${new Date().toLocaleString('es-PE')}</p>
          <div class="line"></div>
          <p>1234567890123456789012</p>
          <p>ABCDEFGHIJKLMNOPQRSTUV</p>
          <div class="line"></div>
          <p>✓ Impresión exitosa</p>
        </div>
      </body>
      </html>
    `;

    return this.printHtml(testHtml, { 
      printerName: printer, 
      silent: true,
      copies: 1,
    });
  }

  // --------------------------------------------------------------------------
  // PRINT FROM HISTORY
  // --------------------------------------------------------------------------

  async reprintFromHistory(saleId: string, options?: PrintOptions): Promise<PrintResult> {
    // Reimpresión simplemente llama a printTicket con el saleId histórico
    return this.printTicket(saleId, options);
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  destroy(): void {
    this.destroyPrintWindow();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let printerManagerInstance: PrinterManager | null = null;

export function initPrinterManager(serverUrl: string): PrinterManager {
  if (!printerManagerInstance) {
    printerManagerInstance = new PrinterManager(serverUrl);
  }
  return printerManagerInstance;
}

export function getPrinterManager(): PrinterManager | null {
  return printerManagerInstance;
}
