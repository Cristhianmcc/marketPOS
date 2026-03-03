/**
 * ESC/POS Ticket Formatter - Layout profesional 80mm / 58mm
 * Diseño compacto: DESCRIPCION al lado izquierdo, PRECIO al extremo derecho.
 */

import * as iconv from 'iconv-lite';
import { PrintSaleData, EscposConfig, PrintSaleItem, PrintDiscount } from './types';

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  INIT:         Buffer.from([ESC, 0x40]),
  ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  BOLD_ON:      Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:     Buffer.from([ESC, 0x45, 0x00]),
  FEED_LINE:    Buffer.from([LF]),
  FEED_LINES:   (n: number) => Buffer.from([ESC, 0x64, n]),
  CUT_PARTIAL:  Buffer.from([GS,  0x56, 0x01]),
  CUT_FULL:     Buffer.from([GS,  0x56, 0x00]),
  OPEN_DRAWER:  Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),
};

// Precio siempre en los últimos PRICE_W caracteres de cada línea.
// "S/999.99" = 8 chars → PRICE_W = 8
const PRICE_W = 8;

// ── Clase Formateadora ────────────────────────────────────────────────────────
export class TicketFormatter {
  private buffer: Buffer[] = [];
  private cols:   number;
  private descW:  number;          // ancho disponible para descripción
  private config: EscposConfig;

  constructor(config: EscposConfig) {
    this.config = config;
    this.cols   = config.charsPerLine;
    this.descW  = this.cols - PRICE_W;
  }

  // ── Buffer ───────────────────────────────────────────────────────────────────

  private push(...bufs: Buffer[]): void { this.buffer.push(...bufs); }
  private text(s: string): void { this.buffer.push(iconv.encode(s, this.config.encoding)); }
  private line(s = ''): void    { this.text(s); this.push(CMD.FEED_LINE); }
  getBuffer(): Buffer { return Buffer.concat(this.buffer); }

  // ── Helpers de Formato ────────────────────────────────────────────────────────

  private sep(c: string): string { return c.repeat(this.cols); }
  private dash():          string { return this.sep('-'); }
  private dots():          string { return this.sep('.'); }
  private equals():        string { return this.sep('='); }

  /**
   * Texto izquierda + texto derecha en la misma línea (total = cols chars).
   * El precio siempre queda pegado al extremo derecho.
   */
  private lr(left: string, right: string): string {
    // El precio ocupa exactamente PRICE_W chars sin espacios en blanco extra
    const r   = right.slice(0, PRICE_W).padStart(PRICE_W);
    const l   = left.slice(0, this.cols - PRICE_W);
    const pad = Math.max(0, this.cols - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  }

  /** Dinero formateado: "S/21.70" relleno a PRICE_W chars hacia la derecha */
  private money(n: number): string {
    return `S/${n.toFixed(2)}`.padStart(PRICE_W);
  }

  /** Centrar texto en cols caracteres */
  private center(s: string): string {
    const t   = s.slice(0, this.cols);
    const pad = Math.floor((this.cols - t.length) / 2);
    return ' '.repeat(pad) + t;
  }

  /** Word-wrap a (cols - indent) caracteres */
  private wrap(s: string, indent = 0): string[] {
    const maxW = this.cols - indent;
    const pre  = ' '.repeat(indent);
    const out: string[] = [];
    let rem = s.trim();
    while (rem.length > 0) {
      if (rem.length <= maxW) { out.push(pre + rem); break; }
      let bp = rem.lastIndexOf(' ', maxW);
      if (bp <= 0) bp = maxW;
      out.push(pre + rem.slice(0, bp).trimEnd());
      rem = rem.slice(bp).trimStart();
    }
    return out;
  }

  /** QR Code ESC/POS (GS ( k) — Epson Model 2 */
  private qrCode(data: string, sz = 5): void {
    const bytes = Buffer.from(data, 'utf8');
    const len   = bytes.length + 3;
    const pL    = len & 0xFF;
    const pH    = (len >> 8) & 0xFF;
    const s     = Math.max(1, Math.min(16, sz));
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00])); // Model 2
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, s]));           // Tamaño
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x33]));        // ECC H
    this.push(Buffer.from([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]));            // Datos
    this.push(bytes);
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));        // Imprimir
  }

  // ── Entrada principal ────────────────────────────────────────────────────────

  formatSale(data: PrintSaleData): Buffer {
    this.buffer = [];
    this.push(CMD.INIT);
    this.printHeader(data);
    this.printSaleInfo(data);
    this.printItems(data.items);
    if (data.discounts?.length) this.printDiscounts(data.discounts);
    this.printTotals(data);
    this.printPayment(data);
    this.printFooter(data);
    this.push(CMD.FEED_LINES(4));
    if (this.config.autoCut)        this.push(CMD.CUT_PARTIAL);
    if (this.config.openCashDrawer) this.push(CMD.OPEN_DRAWER);
    return this.getBuffer();
  }

  // ── Cabecera (Nombre tienda, RUC, dirección, teléfono) ──────────────────────

  private printHeader(data: PrintSaleData): void {
    const { store } = data;
    this.push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
    this.line(store.name.toUpperCase());
    this.push(CMD.BOLD_OFF);
    if (store.ruc)     this.line(`RUC: ${store.ruc}`);
    if (store.address) this.wrap(store.address).forEach(l => this.line(l));
    if (store.phone)   this.line(`Tel: ${store.phone}`);
    this.push(CMD.ALIGN_LEFT);
    this.line(this.dash());
  }

  // ── Info de la venta (número ticket, fecha, cajero) ─────────────────────────

  private printSaleInfo(data: PrintSaleData): void {
    const num      = String(data.saleNumber).padStart(5, '0');
    const datetime = `${data.date} ${data.time}`.trim();
    this.line(this.lr(`N° ${num}`, datetime.slice(-PRICE_W)));
    if (datetime.length > PRICE_W) {
      this.line(this.lr('', datetime));
    }
    this.line(this.dash());
  }

  // ── Productos ────────────────────────────────────────────────────────────────

  private printItems(items: PrintSaleItem[]): void {
    this.push(CMD.BOLD_ON);
    this.line(this.lr('DESCRIPCION', '  PRECIO'));
    this.push(CMD.BOLD_OFF);
    this.line(this.dots());

    for (const item of items) {
      const price = this.money(item.subtotal);

      // Si el nombre cabe en descW-1 → todo en una línea
      if (item.name.length <= this.descW - 1) {
        this.line(this.lr(item.name, price));
      } else {
        // Nombre largo: partir en líneas, el precio va en la última
        const lines = this.wrap(item.name);
        for (let i = 0; i < lines.length - 1; i++) {
          this.line(lines[i]);
        }
        this.line(this.lr(lines[lines.length - 1], price));
      }

      // Cantidad y precio unitario (solo si qty ≠ 1)
      if (item.quantity !== 1) {
        const qtyU = item.unit ? item.unit.charAt(0).toUpperCase() : 'u';
        this.line(`  ${item.quantity}${qtyU} x S/${item.unitPrice.toFixed(2)}`);
      }

      // Descuento por item
      if (item.discount && item.discount > 0) {
        this.line(this.lr('  Descuento:', `-S/${item.discount.toFixed(2)}`));
      }
    }
  }

  // ── Descuentos a nivel de orden ──────────────────────────────────────────────

  private printDiscounts(discounts: PrintDiscount[]): void {
    this.line(this.dots());
    for (const d of discounts) {
      const label = d.type === 'coupon' ? `CUPON: ${d.description}` : d.description;
      this.line(this.lr(label, `-S/${d.amount.toFixed(2)}`));
    }
  }

  // ── Totales ──────────────────────────────────────────────────────────────────

  private printTotals(data: PrintSaleData): void {
    this.line(this.equals());
    if (data.totalDiscount > 0) {
      this.line(this.lr('SUBTOTAL:', this.money(data.subtotal)));
      this.line(this.lr('DESCUENTO:', `-S/${data.totalDiscount.toFixed(2)}`));
    }
    this.push(CMD.BOLD_ON);
    this.line(this.lr('TOTAL:', this.money(data.total)));
    this.push(CMD.BOLD_OFF);
    this.line(this.equals());
  }

  // ── Pago ─────────────────────────────────────────────────────────────────────

  private printPayment(data: PrintSaleData): void {
    const { payment } = data;
    const METHOD: Record<string, string> = {
      CASH:     'EFECTIVO',
      CARD:     'TARJETA',
      YAPE:     'YAPE',
      PLIN:     'PLIN',
      TRANSFER: 'TRANSFER.',
      FIADO:    'CREDITO',
      MIXED:    'MIXTO',
    };
    this.line(`PAGO: ${METHOD[payment.method] ?? payment.method}`);
    if (payment.method === 'CASH' && payment.amountPaid !== undefined) {
      this.line(this.lr('RECIBIDO:', this.money(payment.amountPaid)));
      if (payment.change !== undefined && payment.change > 0) {
        this.push(CMD.BOLD_ON);
        this.line(this.lr('VUELTO:', this.money(payment.change)));
        this.push(CMD.BOLD_OFF);
      }
    }
    if (payment.method === 'FIADO') {
      if (payment.customerName)
        this.line(`CLIENTE: ${payment.customerName}`);
      if (payment.customerBalance !== undefined)
        this.line(this.lr('SALDO:', this.money(payment.customerBalance)));
    }
  }

  // ── Pie de ticket ────────────────────────────────────────────────────────────

  private printFooter(data: PrintSaleData): void {
    const { store } = data;
    this.line(this.equals());
    const slogan = store.slogan || data.footer || 'Gracias por su compra!';
    this.push(CMD.BOLD_ON);
    // Centrado por software: agrega espacios manualmente → funciona en cualquier impresora
    this.wrap(slogan).forEach(l => this.line(this.center(l.trim())));
    this.push(CMD.BOLD_OFF);
    if (store.website) {
      this.push(CMD.FEED_LINE);
      this.line(this.center(store.website));
    }
    if (store.showQr && store.website) {
      this.push(CMD.FEED_LINE);
      // QR necesita ALIGN_CENTER por hardware (no se puede centrar por software)
      this.push(CMD.ALIGN_CENTER);
      this.qrCode(store.website, 5);
      this.push(CMD.ALIGN_LEFT);
    }
  }
}

// ── Función de fábrica ───────────────────────────────────────────────────────
export function formatTicket(data: PrintSaleData, config: EscposConfig): Buffer {
  return new TicketFormatter(config).formatSale(data);
}
