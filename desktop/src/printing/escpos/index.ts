/**
 * D6-USB / D6.1-NET - ESC/POS Printing Module
 * Main entry point for USB and Network thermal printing
 */

import { app, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { listUsbPrinters, printAndClose } from './usbPrinter';
import { printToNetworkPrinter, isValidIp, isValidPort } from './networkPrinter';
import { pingPrinter, PingResult } from './pingPrinter';
import { listBluetoothPorts, printViaBluetooth, BtPortInfo } from './btPrinter';
import { formatTicket, TicketFormatter } from './formatTicket';
import { generateTestPrint, generateMinimalTest } from './testPrint';
import { 
  UsbDevice, 
  EscposConfig, 
  PrintSaleData, 
  PrintResult,
  PrinterMode,
  DEFAULT_ESCPOS_CONFIG 
} from './types';

// ============== ESC/POS Manager ==============

class EscposPrintManager {
  private static instance: EscposPrintManager;
  private config: EscposConfig;
  private configPath: string;
  private serverUrl: string = 'http://localhost:3000';
  
  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'escpos-config.json');
    this.config = this.loadConfig();
  }
  
  static getInstance(): EscposPrintManager {
    if (!EscposPrintManager.instance) {
      EscposPrintManager.instance = new EscposPrintManager();
    }
    return EscposPrintManager.instance;
  }
  
  // ============== Config ==============
  
  private loadConfig(): EscposConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_ESCPOS_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[ESCPOS] Error loading config:', error);
    }
    return { ...DEFAULT_ESCPOS_CONFIG };
  }
  
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('[ESCPOS] Config saved to:', this.configPath);
      console.log('[ESCPOS] Config values:', JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[ESCPOS] Error saving config:', error);
    }
  }
  
  getConfig(): EscposConfig {
    return { ...this.config };
  }
  
  updateConfig(updates: Partial<EscposConfig>): EscposConfig {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    return this.config;
  }
  
  setServerUrl(url: string): void {
    this.serverUrl = url;
  }
  
  // ============== USB Device Discovery ==============
  
  listPrinters(): UsbDevice[] {
    try {
      return listUsbPrinters();
    } catch (error) {
      console.error('[ESCPOS] Error listing printers:', error);
      return [];
    }
  }

  // ============== Bluetooth Port Discovery ==============

  async listBtPorts(): Promise<BtPortInfo[]> {
    try {
      return await listBluetoothPorts();
    } catch (error) {
      console.error('[ESCPOS] Error listing BT ports:', error);
      return [];
    }
  }
  
  // ============== Test Print ==============
  
  async testPrint(full: boolean = true): Promise<PrintResult> {
    // Route to appropriate printer based on mode
    if (this.config.mode === 'ESCPOS_NET') {
      return this.testPrintNetwork(full);
    }
    if (this.config.mode === 'ESCPOS_BT') {
      return this.testPrintBt(full);
    }
    return this.testPrintUsb(full);
  }
  
  private async testPrintUsb(full: boolean): Promise<PrintResult> {
    if (this.config.vendorId === null || this.config.productId === null) {
      return { 
        success: false, 
        error: 'No hay impresora USB configurada',
        fallbackToHtml: true 
      };
    }
    
    try {
      const data = full 
        ? generateTestPrint(this.config)
        : generateMinimalTest(this.config);
      
      const success = await printAndClose(
        this.config.vendorId,
        this.config.productId,
        data
      );
      
      if (!success) {
        return { 
          success: false, 
          error: 'No se pudo conectar con la impresora USB',
          fallbackToHtml: true 
        };
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS] USB test print error:', error);
      return { 
        success: false, 
        error: message,
        fallbackToHtml: true 
      };
    }
  }
  
  private async testPrintBt(full: boolean): Promise<PrintResult> {
    if (!this.config.btPort) {
      return {
        success: false,
        error: 'No hay puerto Bluetooth configurado',
        fallbackToHtml: true,
      };
    }

    try {
      const data = full
        ? generateTestPrint(this.config)
        : generateMinimalTest(this.config);

      const result = await printViaBluetooth(
        this.config.btPort,
        data,
        this.config.btBaud,
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'No se pudo conectar con la impresora Bluetooth',
          fallbackToHtml: true,
        };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS] BT test print error:', error);
      return { success: false, error: message, fallbackToHtml: true };
    }
  }

  private async testPrintNetwork(full: boolean): Promise<PrintResult> {
    if (!this.config.netHost) {
      return { 
        success: false, 
        error: 'No hay IP de impresora configurada',
        fallbackToHtml: true 
      };
    }
    
    try {
      const data = full 
        ? generateTestPrint(this.config)
        : generateMinimalTest(this.config);
      
      const result = await printToNetworkPrinter(
        this.config.netHost,
        this.config.netPort,
        data,
        this.config.netTimeout
      );
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.error || 'No se pudo conectar con la impresora de red',
          fallbackToHtml: true 
        };
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS] Network test print error:', error);
      return { 
        success: false, 
        error: message,
        fallbackToHtml: true 
      };
    }
  }
  
  // ============== Print Sale ==============
  
  async printSale(saleId: string): Promise<PrintResult> {
    console.log('[ESCPOS] printSale called with saleId:', saleId);
    console.log('[ESCPOS] Current config mode:', this.config.mode);
    console.log('[ESCPOS] netHost:', this.config.netHost, 'netPort:', this.config.netPort);
    console.log('[ESCPOS] serverUrl:', this.serverUrl);
    
    // Route to appropriate printer based on mode
    if (this.config.mode === 'ESCPOS_NET') {
      console.log('[ESCPOS] Routing to Network printer...');
      return this.printSaleNetwork(saleId);
    } else if (this.config.mode === 'ESCPOS_USB') {
      console.log('[ESCPOS] Routing to USB printer...');
      return this.printSaleUsb(saleId);
    } else if (this.config.mode === 'ESCPOS_BT') {
      console.log('[ESCPOS] Routing to Bluetooth printer...');
      return this.printSaleBt(saleId);
    }
    
    console.log('[ESCPOS] Mode is HTML or unknown, returning fallback');
    return { 
      success: false, 
      error: 'Modo ESC/POS no habilitado',
      fallbackToHtml: true 
    };
  }
  
  private async printSaleUsb(saleId: string): Promise<PrintResult> {
    // Check printer is configured
    if (this.config.vendorId === null || this.config.productId === null) {
      return { 
        success: false, 
        error: 'No hay impresora USB configurada',
        fallbackToHtml: true 
      };
    }
    
    try {
      // Fetch sale data from API
      const saleData = await this.fetchSaleData(saleId);
      
      if (!saleData) {
        return { 
          success: false, 
          error: 'No se pudo obtener datos de la venta',
          fallbackToHtml: true 
        };
      }
      
      // Format ticket
      const ticketBuffer = formatTicket(saleData, this.config);
      
      // Print
      const success = await printAndClose(
        this.config.vendorId,
        this.config.productId,
        ticketBuffer
      );
      
      if (!success) {
        return { 
          success: false, 
          error: 'No se pudo conectar con la impresora USB',
          fallbackToHtml: true 
        };
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS] USB print sale error:', error);
      return { 
        success: false, 
        error: message,
        fallbackToHtml: true 
      };
    }
  }
  
  private async printSaleBt(saleId: string): Promise<PrintResult> {
    if (!this.config.btPort) {
      return {
        success: false,
        error: 'No hay puerto Bluetooth configurado',
        fallbackToHtml: true,
      };
    }

    try {
      const saleData = await this.fetchSaleData(saleId);
      if (!saleData) {
        return {
          success: false,
          error: 'No se pudo obtener datos de la venta',
          fallbackToHtml: true,
        };
      }

      const ticketBuffer = formatTicket(saleData, this.config);

      const result = await printViaBluetooth(
        this.config.btPort,
        ticketBuffer,
        this.config.btBaud,
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'No se pudo conectar con la impresora Bluetooth',
          fallbackToHtml: true,
        };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS] BT print sale error:', error);
      return { success: false, error: message, fallbackToHtml: true };
    }
  }

  private async printSaleNetwork(saleId: string): Promise<PrintResult> {
    console.log('[ESCPOS-NET] Starting printSaleNetwork for:', saleId);
    
    // Check printer is configured
    if (!this.config.netHost) {
      console.log('[ESCPOS-NET] ERROR: No netHost configured');
      return { 
        success: false, 
        error: 'No hay IP de impresora configurada',
        fallbackToHtml: true 
      };
    }
    
    try {
      // Fetch sale data from API
      console.log('[ESCPOS-NET] Fetching sale data from:', `${this.serverUrl}/api/print/sale/${saleId}`);
      const saleData = await this.fetchSaleData(saleId);
      
      if (!saleData) {
        console.log('[ESCPOS-NET] ERROR: No sale data returned');
        return { 
          success: false, 
          error: 'No se pudo obtener datos de la venta',
          fallbackToHtml: true 
        };
      }
      
      console.log('[ESCPOS-NET] Sale data received, formatting ticket...');
      // Format ticket
      const ticketBuffer = formatTicket(saleData, this.config);
      console.log('[ESCPOS-NET] Ticket formatted, buffer size:', ticketBuffer.length);
      
      // Print via network
      console.log('[ESCPOS-NET] Sending to printer:', this.config.netHost, ':', this.config.netPort);
      const result = await printToNetworkPrinter(
        this.config.netHost,
        this.config.netPort,
        ticketBuffer,
        this.config.netTimeout
      );
      
      console.log('[ESCPOS-NET] Print result:', result);
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.error || 'No se pudo conectar con la impresora de red',
          fallbackToHtml: true 
        };
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ESCPOS-NET] Print sale error:', error);
      return { 
        success: false, 
        error: message,
        fallbackToHtml: true 
      };
    }
  }
  
  // ============== Network Ping ==============
  
  async pingNetworkPrinter(host?: string, port?: number): Promise<PingResult> {
    const targetHost = host || this.config.netHost;
    const targetPort = port || this.config.netPort;
    
    if (!targetHost) {
      return { ok: false, reason: 'No hay IP configurada' };
    }
    
    if (!isValidIp(targetHost)) {
      return { ok: false, reason: 'IP inválida' };
    }
    
    if (!isValidPort(targetPort)) {
      return { ok: false, reason: 'Puerto inválido' };
    }
    
    return pingPrinter(targetHost, targetPort, 3000);
  }
  
  // ============== Fetch Sale Data ==============
  
  private async getAuthCookieHeader(baseUrl: string): Promise<string | null> {
    try {
      // Try cookies scoped to the base URL first
      let cookies = await session.defaultSession.cookies.get({ url: baseUrl });
      if (cookies.length === 0) {
        // Fallback: load all cookies and filter by domain/host
        const all = await session.defaultSession.cookies.get({});
        const host = new URL(baseUrl).hostname;
        cookies = all.filter(c => c.domain?.includes(host) || c.domain?.includes('localhost') || c.domain?.includes('127.0.0.1'));
      }
      if (cookies.length > 0) {
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
    } catch (cookieErr) {
      console.warn('[ESCPOS] Could not read session cookies:', cookieErr);
    }
    return null;
  }

  private mapSaleApiToPrintData(sale: any): PrintSaleData {
    const saleDate = new Date(sale.createdAt);
    const date = saleDate.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = saleDate.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const items = (sale.items || []).map((item: any) => ({
      name: item.productName || 'Producto',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      subtotal: Number(item.subtotal || 0),
      discount: Number(item.discountAmount || 0),
      unit: item.unitSymbol || item.unitCodeUsed || undefined,
    }));

    const discounts: Array<{ type: 'item' | 'order' | 'coupon' | 'promo'; description: string; amount: number }> = [];
    const itemDiscounts = items.reduce((sum: number, i: { discount?: number }) => sum + (i.discount || 0), 0);
    if (itemDiscounts > 0) {
      discounts.push({ type: 'item', description: 'Desc. por producto', amount: itemDiscounts });
    }
    const discountTotal = Number(sale.discountTotal || 0);
    if (discountTotal > 0) {
      discounts.push({ type: 'order', description: 'Descuento general', amount: discountTotal });
    }
    const couponDiscount = Number(sale.couponDiscount || 0);
    if (sale.couponCode && couponDiscount > 0) {
      discounts.push({ type: 'coupon', description: sale.couponCode, amount: couponDiscount });
    }

    const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);

    const validMethods = ['CASH', 'CARD', 'YAPE', 'PLIN', 'TRANSFER', 'FIADO', 'MIXED'] as const;
    const method = validMethods.includes(sale.paymentMethod) ? sale.paymentMethod : 'CASH';
    const payment: PrintSaleData['payment'] = { method };

    if (sale.paymentMethod === 'CASH') {
      payment.amountPaid = Number(sale.amountPaid || sale.total || 0);
      payment.change = Number(sale.changeAmount || 0);
    }

    return {
      store: {
        name: sale.store?.name || 'Tienda',
        ruc: sale.store?.ruc || undefined,
        address: sale.store?.address || undefined,
        phone: sale.store?.phone || undefined,
      },
      saleNumber: sale.saleNumber || sale.id?.substring(0, 8)?.toUpperCase(),
      date,
      time,
      items,
      subtotal: Number(sale.subtotal || 0),
      totalDiscount,
      total: Number(sale.total || 0),
      discounts: discounts.length > 0 ? discounts : undefined,
      payment,
      cashierName: sale.user?.name || undefined,
      footer: undefined,
    };
  }

  private async fetchSaleData(saleId: string): Promise<PrintSaleData | null> {
    try {
      const headers: Record<string, string> = {};
      const cookieHeader = await this.getAuthCookieHeader(this.serverUrl);
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      // Use /api/sales/[id] directly (snapshot fields) to avoid Prisma include mismatch
      const salesUrl = `${this.serverUrl}/api/sales/${saleId}`;
      const salesResp = await fetch(salesUrl, { headers });
      if (salesResp.ok) {
        const salesJson: any = await salesResp.json();
        if (salesJson && salesJson.sale) {
          return this.mapSaleApiToPrintData(salesJson.sale);
        }
      }
      return null;
    } catch (error) {
      console.error('[ESCPOS] Fetch error:', error);
      return null;
    }
  }
  
  // ============== Cleanup ==============
  
  destroy(): void {
    // Nothing to clean up for now
  }
}

// ============== Exports ==============

export function initEscposPrintManager(serverUrl: string): EscposPrintManager {
  const manager = EscposPrintManager.getInstance();
  manager.setServerUrl(serverUrl);
  return manager;
}

export function getEscposPrintManager(): EscposPrintManager | null {
  try {
    return EscposPrintManager.getInstance();
  } catch {
    return null;
  }
}

export { 
  EscposPrintManager,
  UsbDevice,
  EscposConfig,
  PrinterMode,
  PrintSaleData,
  PrintResult,
  PingResult,
  DEFAULT_ESCPOS_CONFIG,
  BtPortInfo,
};
