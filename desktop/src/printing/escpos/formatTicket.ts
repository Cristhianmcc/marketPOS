/**
 * D6-USB - ESC/POS Ticket Formatter
 * Generates ESC/POS commands for thermal ticket printing
 */

import * as iconv from 'iconv-lite';
import { PrintSaleData, EscposConfig, PrintSaleItem, PrintDiscount } from './types';

// ============== ESC/POS Commands ==============

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  // Initialization
  INIT: Buffer.from([ESC, 0x40]),                    // ESC @
  
  // Text formatting
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),        // ESC a 0
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),      // ESC a 1
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),       // ESC a 2
  
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),           // ESC E 1
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),          // ESC E 0
  
  DOUBLE_WIDTH: Buffer.from([GS, 0x21, 0x10]),       // GS ! 0x10
  DOUBLE_HEIGHT: Buffer.from([GS, 0x21, 0x01]),      // GS ! 0x01
  DOUBLE_SIZE: Buffer.from([GS, 0x21, 0x11]),        // GS ! 0x11
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),        // GS ! 0x00
  
  // Paper
  FEED_LINE: Buffer.from([LF]),
  FEED_LINES: (n: number) => Buffer.from([ESC, 0x64, n]), // ESC d n
  
  // Cut
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]),        // GS V 1
  CUT_FULL: Buffer.from([GS, 0x56, 0x00]),           // GS V 0
  
  // Cash drawer
  OPEN_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]), // ESC p 0 25 250
  
  // Underline
  UNDERLINE_ON: Buffer.from([ESC, 0x2D, 0x01]),      // ESC - 1
  UNDERLINE_OFF: Buffer.from([ESC, 0x2D, 0x00]),     // ESC - 0
};

// ============== Formatter Class ==============

export class TicketFormatter {
  private buffer: Buffer[] = [];
  private config: EscposConfig;
  private cols: number;
  
  constructor(config: EscposConfig) {
    this.config = config;
    this.cols = config.charsPerLine;
  }
  
  // ============== Buffer Management ==============
  
  private push(...buffers: Buffer[]): void {
    this.buffer.push(...buffers);
  }
  
  private text(str: string): void {
    const encoded = iconv.encode(str, this.config.encoding);
    this.buffer.push(encoded);
  }
  
  private line(str: string = ''): void {
    this.text(str);
    this.push(CMD.FEED_LINE);
  }
  
  getBuffer(): Buffer {
    return Buffer.concat(this.buffer);
  }
  
  // ============== Formatting Helpers ==============
  
  /**
   * Center text within column width
   */
  center(str: string): string {
    const trimmed = str.substring(0, this.cols);
    const padding = Math.floor((this.cols - trimmed.length) / 2);
    return ' '.repeat(padding) + trimmed;
  }
  
  /**
   * Right-align text
   */
  right(str: string): string {
    const trimmed = str.substring(0, this.cols);
    return str.padStart(this.cols);
  }
  
  /**
   * Left-right alignment (e.g., "ITEM          $10.00")
   */
  leftRight(left: string, right: string): string {
    const maxLeft = this.cols - right.length - 1;
    const leftTrimmed = left.substring(0, maxLeft);
    const spaces = this.cols - leftTrimmed.length - right.length;
    return leftTrimmed + ' '.repeat(Math.max(1, spaces)) + right;
  }
  
  /**
   * Three-column alignment (QTY, NAME, PRICE)
   */
  threeCol(left: string, middle: string, right: string): string {
    const leftWidth = 4;  // "99x "
    const rightWidth = 8; // "9999.99"
    const middleWidth = this.cols - leftWidth - rightWidth - 2;
    
    const leftPart = left.padEnd(leftWidth);
    const rightPart = right.padStart(rightWidth);
    const middlePart = middle.substring(0, middleWidth).padEnd(middleWidth);
    
    return leftPart + middlePart + rightPart;
  }
  
  /**
   * Wrap long text to multiple lines
   */
  wrap(str: string, indent: number = 0): string[] {
    const lines: string[] = [];
    const maxWidth = this.cols - indent;
    const prefix = ' '.repeat(indent);
    
    let remaining = str;
    while (remaining.length > 0) {
      if (remaining.length <= maxWidth) {
        lines.push(prefix + remaining);
        break;
      }
      
      // Find last space within maxWidth
      let breakPoint = remaining.lastIndexOf(' ', maxWidth);
      if (breakPoint <= 0) breakPoint = maxWidth;
      
      lines.push(prefix + remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }
    
    return lines;
  }
  
  /**
   * Divider line
   */
  divider(char: string = '-'): string {
    return char.repeat(this.cols);
  }
  
  /**
   * Double divider
   */
  doubleDivider(): string {
    return '='.repeat(this.cols);
  }
  
  // ============== Ticket Building ==============
  
  /**
   * Generate complete ticket from sale data
   */
  formatSale(data: PrintSaleData): Buffer {
    this.buffer = [];
    
    // Initialize printer
    this.push(CMD.INIT);
    
    // Header
    this.printHeader(data);
    
    // Sale info
    this.printSaleInfo(data);
    
    // Items
    this.printItems(data.items);
    
    // Discounts
    if (data.discounts && data.discounts.length > 0) {
      this.printDiscounts(data.discounts);
    }
    
    // Totals
    this.printTotals(data);
    
    // Payment
    this.printPayment(data);
    
    // Footer
    this.printFooter(data);
    
    // Feed and cut
    this.push(CMD.FEED_LINES(4));
    
    if (this.config.autoCut) {
      this.push(CMD.CUT_PARTIAL);
    }
    
    if (this.config.openCashDrawer) {
      this.push(CMD.OPEN_DRAWER);
    }
    
    return this.getBuffer();
  }
  
  private printHeader(data: PrintSaleData): void {
    const { store } = data;
    
    this.push(CMD.ALIGN_CENTER);
    this.push(CMD.BOLD_ON);
    this.push(CMD.DOUBLE_WIDTH);
    this.line(store.name);
    this.push(CMD.NORMAL_SIZE);
    this.push(CMD.BOLD_OFF);
    
    if (store.ruc) {
      this.line(`RUC: ${store.ruc}`);
    }
    if (store.address) {
      this.wrap(store.address).forEach(l => this.line(l));
    }
    if (store.phone) {
      this.line(`Tel: ${store.phone}`);
    }
    
    this.push(CMD.ALIGN_LEFT);
    this.line(this.divider());
  }
  
  private printSaleInfo(data: PrintSaleData): void {
    this.line(this.leftRight(`TICKET: ${data.saleNumber}`, data.date));
    this.line(this.leftRight('', data.time));
    if (data.cashierName) {
      this.line(`Cajero: ${data.cashierName}`);
    }
    this.line(this.divider());
  }
  
  private printItems(items: PrintSaleItem[]): void {
    this.push(CMD.BOLD_ON);
    this.line(this.threeCol('CANT', 'DESCRIPCION', 'IMPORTE'));
    this.push(CMD.BOLD_OFF);
    this.line(this.divider('-'));
    
    for (const item of items) {
      const qty = `${item.quantity}${item.unit ? item.unit.charAt(0) : 'x'}`;
      const price = this.formatMoney(item.subtotal);
      
      // First line: qty + name (truncated) + subtotal
      this.line(this.threeCol(qty, item.name, price));
      
      // If name is too long, continue on next line
      const middleWidth = this.cols - 4 - 8 - 2;
      if (item.name.length > middleWidth) {
        const remaining = item.name.substring(middleWidth);
        this.wrap(remaining, 4).forEach(l => this.line(l));
      }
      
      // Show unit price if different from subtotal
      if (item.quantity > 1) {
        const unitPrice = `  @${this.formatMoney(item.unitPrice)}`;
        this.line(unitPrice);
      }
      
      // Item discount
      if (item.discount && item.discount > 0) {
        this.line(`  Desc: -${this.formatMoney(item.discount)}`);
      }
    }
  }
  
  private printDiscounts(discounts: PrintDiscount[]): void {
    this.line(this.divider('-'));
    
    for (const disc of discounts) {
      const desc = disc.type === 'coupon' 
        ? `CUPON: ${disc.description}`
        : disc.description;
      this.line(this.leftRight(desc, `-${this.formatMoney(disc.amount)}`));
    }
  }
  
  private printTotals(data: PrintSaleData): void {
    this.line(this.doubleDivider());
    
    if (data.totalDiscount > 0) {
      this.line(this.leftRight('SUBTOTAL:', this.formatMoney(data.subtotal)));
      this.line(this.leftRight('DESCUENTO:', `-${this.formatMoney(data.totalDiscount)}`));
    }
    
    this.push(CMD.BOLD_ON);
    this.push(CMD.DOUBLE_HEIGHT);
    this.line(this.leftRight('TOTAL:', this.formatMoney(data.total)));
    this.push(CMD.NORMAL_SIZE);
    this.push(CMD.BOLD_OFF);
  }
  
  private printPayment(data: PrintSaleData): void {
    const { payment } = data;
    
    this.line(this.divider('-'));
    
    const methodNames: Record<string, string> = {
      CASH: 'EFECTIVO',
      CARD: 'TARJETA',
      YAPE: 'YAPE',
      PLIN: 'PLIN',
      TRANSFER: 'TRANSFERENCIA',
      FIADO: 'CREDITO',
      MIXED: 'MIXTO',
    };
    
    this.line(`PAGO: ${methodNames[payment.method] || payment.method}`);
    
    if (payment.method === 'CASH' && payment.amountPaid !== undefined) {
      this.line(this.leftRight('RECIBIDO:', this.formatMoney(payment.amountPaid)));
      if (payment.change !== undefined && payment.change > 0) {
        this.push(CMD.BOLD_ON);
        this.line(this.leftRight('VUELTO:', this.formatMoney(payment.change)));
        this.push(CMD.BOLD_OFF);
      }
    }
    
    if (payment.method === 'FIADO') {
      if (payment.customerName) {
        this.line(`CLIENTE: ${payment.customerName}`);
      }
      if (payment.customerBalance !== undefined) {
        this.line(this.leftRight('SALDO PENDIENTE:', this.formatMoney(payment.customerBalance)));
      }
    }
  }
  
  private printFooter(data: PrintSaleData): void {
    this.line(this.doubleDivider());
    
    this.push(CMD.ALIGN_CENTER);
    
    if (data.footer) {
      this.wrap(data.footer).forEach(l => this.line(l));
    } else {
      this.line('Gracias por su compra!');
    }
    
    this.push(CMD.ALIGN_LEFT);
  }
  
  // ============== Utilities ==============
  
  private formatMoney(amount: number): string {
    return `S/${amount.toFixed(2)}`;
  }
}

// ============== Factory Function ==============

export function formatTicket(data: PrintSaleData, config: EscposConfig): Buffer {
  const formatter = new TicketFormatter(config);
  return formatter.formatSale(data);
}
