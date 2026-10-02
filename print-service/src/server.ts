/**
 * MarketPOS Print Service - Servicio local de impresión directa
 * 
 * Se instala en la PC de la tienda. La app web envía los datos del ticket
 * a localhost:12121 y este servicio imprime directo en la ticketera.
 * 
 * Soporta: USB (Windows port file) y Red (TCP/9100)
 */

import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as iconv from 'iconv-lite';

// ════════════════════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════════════════════

interface PrintSaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount?: number;
  unit?: string;
}

interface PrintDiscount {
  type: 'item' | 'order' | 'coupon' | 'promo';
  description: string;
  amount: number;
}

interface PrintPayment {
  method: 'CASH' | 'CARD' | 'YAPE' | 'PLIN' | 'TRANSFER' | 'FIADO' | 'MIXED';
  amountPaid?: number;
  change?: number;
  customerName?: string;
  customerBalance?: number;
}

interface PrintStoreInfo {
  name: string;
  ruc?: string;
  address?: string;
  phone?: string;
  website?: string;
  slogan?: string;
  showQr?: boolean;
}

interface PrintSaleData {
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

interface PrintServiceConfig {
  mode: 'USB' | 'NET';
  // USB (Windows port)
  usbPort: string; // "USB001", "USB002", etc.
  // Network
  netHost: string;
  netPort: number;
  netTimeout: number;
  // Ticket format
  charsPerLine: 32 | 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: string;
  ticketSlogan: string;
  ticketWebsite: string;
  ticketShowQr: boolean;
  // Allowed origins (web app URLs)
  allowedOrigins: string[];
}

const DEFAULT_CONFIG: PrintServiceConfig = {
  mode: 'USB',
  usbPort: 'USB001',
  netHost: '',
  netPort: 9100,
  netTimeout: 5000,
  charsPerLine: 42,
  autoCut: true,
  openCashDrawer: false,
  encoding: 'CP858',
  ticketSlogan: 'Gracias por su compra!',
  ticketWebsite: '',
  ticketShowQr: false,
  allowedOrigins: ['http://localhost:3000'],
};

// ════════════════════════════════════════════════════════════════════════════
// ESC/POS FORMATTER (copiado de desktop/src/printing/escpos/formatTicket.ts)
// ════════════════════════════════════════════════════════════════════════════

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
  CUT_PARTIAL:  Buffer.from([GS, 0x56, 0x01]),
  CUT_FULL:     Buffer.from([GS, 0x56, 0x00]),
  OPEN_DRAWER:  Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),
};

const PRICE_W = 8;

class TicketFormatter {
  private buffer: Buffer[] = [];
  private cols: number;
  private descW: number;
  private encoding: string;
  private autoCut: boolean;
  private openCashDrawer: boolean;

  constructor(config: PrintServiceConfig) {
    this.cols = config.charsPerLine;
    this.descW = this.cols - PRICE_W;
    this.encoding = config.encoding;
    this.autoCut = config.autoCut;
    this.openCashDrawer = config.openCashDrawer;
  }

  private push(...bufs: Buffer[]): void { this.buffer.push(...bufs); }
  private text(s: string): void { this.buffer.push(iconv.encode(s, this.encoding)); }
  private line(s = ''): void { this.text(s); this.push(CMD.FEED_LINE); }
  getBuffer(): Buffer { return Buffer.concat(this.buffer); }

  private sep(c: string): string { return c.repeat(this.cols); }
  private dash(): string { return this.sep('-'); }
  private dots(): string { return this.sep('.'); }
  private equals(): string { return this.sep('='); }

  private lr(left: string, right: string): string {
    const r = right.slice(0, PRICE_W).padStart(PRICE_W);
    const l = left.slice(0, this.cols - PRICE_W);
    const pad = Math.max(0, this.cols - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  }

  private money(n: number): string {
    return `S/${n.toFixed(2)}`.padStart(PRICE_W);
  }

  private center(s: string): string {
    const t = s.slice(0, this.cols);
    const pad = Math.floor((this.cols - t.length) / 2);
    return ' '.repeat(pad) + t;
  }

  private wrap(s: string, indent = 0): string[] {
    const maxW = this.cols - indent;
    const pre = ' '.repeat(indent);
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

  private qrCode(data: string, sz = 5): void {
    const bytes = Buffer.from(data, 'utf8');
    const len = bytes.length + 3;
    const pL = len & 0xFF;
    const pH = (len >> 8) & 0xFF;
    const s = Math.max(1, Math.min(16, sz));
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, s]));
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x33]));
    this.push(Buffer.from([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]));
    this.push(bytes);
    this.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));
  }

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
    if (this.autoCut) this.push(CMD.CUT_PARTIAL);
    if (this.openCashDrawer) this.push(CMD.OPEN_DRAWER);
    return this.getBuffer();
  }

  private printHeader(data: PrintSaleData): void {
    const { store } = data;
    this.push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
    this.line(store.name.toUpperCase());
    this.push(CMD.BOLD_OFF);
    if (store.ruc) this.line(`RUC: ${store.ruc}`);
    if (store.address) this.wrap(store.address).forEach(l => this.line(l));
    if (store.phone) this.line(`Tel: ${store.phone}`);
    this.push(CMD.ALIGN_LEFT);
    this.line(this.dash());
  }

  private printSaleInfo(data: PrintSaleData): void {
    const num = String(data.saleNumber).padStart(5, '0');
    const datetime = `${data.date} ${data.time}`.trim();
    this.line(this.lr(`N° ${num}`, datetime.slice(-PRICE_W)));
    if (datetime.length > PRICE_W) {
      this.line(this.lr('', datetime));
    }
    this.line(this.dash());
  }

  private printItems(items: PrintSaleItem[]): void {
    this.push(CMD.BOLD_ON);
    this.line(this.lr('DESCRIPCION', '  PRECIO'));
    this.push(CMD.BOLD_OFF);
    this.line(this.dots());

    for (const item of items) {
      const price = this.money(item.subtotal);
      if (item.name.length <= this.descW - 1) {
        this.line(this.lr(item.name, price));
      } else {
        const lines = this.wrap(item.name);
        for (let i = 0; i < lines.length - 1; i++) this.line(lines[i]);
        this.line(this.lr(lines[lines.length - 1], price));
      }
      if (item.quantity !== 1) {
        const qtyU = item.unit ? item.unit.charAt(0).toUpperCase() : 'u';
        this.line(`  ${item.quantity}${qtyU} x S/${item.unitPrice.toFixed(2)}`);
      }
      if (item.discount && item.discount > 0) {
        this.line(this.lr('  Descuento:', `-S/${item.discount.toFixed(2)}`));
      }
    }
  }

  private printDiscounts(discounts: PrintDiscount[]): void {
    this.line(this.dots());
    for (const d of discounts) {
      const label = d.type === 'coupon' ? `CUPON: ${d.description}` : d.description;
      this.line(this.lr(label, `-S/${d.amount.toFixed(2)}`));
    }
  }

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

  private printPayment(data: PrintSaleData): void {
    const { payment } = data;
    const METHOD: Record<string, string> = {
      CASH: 'EFECTIVO', CARD: 'TARJETA', YAPE: 'YAPE',
      PLIN: 'PLIN', TRANSFER: 'TRANSFER.', FIADO: 'CREDITO', MIXED: 'MIXTO',
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
      if (payment.customerName) this.line(`CLIENTE: ${payment.customerName}`);
      if (payment.customerBalance !== undefined)
        this.line(this.lr('SALDO:', this.money(payment.customerBalance)));
    }
  }

  private printFooter(data: PrintSaleData): void {
    const { store } = data;
    this.line(this.equals());
    const slogan = store.slogan || data.footer || 'Gracias por su compra!';
    this.push(CMD.BOLD_ON);
    this.wrap(slogan).forEach(l => this.line(this.center(l.trim())));
    this.push(CMD.BOLD_OFF);
    if (store.website) {
      this.push(CMD.FEED_LINE);
      this.line(this.center(store.website));
    }
    if (store.showQr && store.website) {
      this.push(CMD.FEED_LINE);
      this.push(CMD.ALIGN_CENTER);
      this.qrCode(store.website, 5);
      this.push(CMD.ALIGN_LEFT);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// IMPRESIÓN USB (Windows: port-file o RAW copy)
// ════════════════════════════════════════════════════════════════════════════

const RAWPRINT_PS1 = `
param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$FilePath)
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential)] public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string p,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr h,int l,ref DOCINFOA di);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
  public static bool SendRawData(string printerName,byte[] data){
    IntPtr hPrinter;DOCINFOA di=new DOCINFOA();
    di.pDocName="MarketPOS Ticket";di.pDataType="RAW";
    if(!OpenPrinter(printerName,out hPrinter,IntPtr.Zero))return false;
    try{
      if(!StartDocPrinter(hPrinter,1,ref di))return false;
      if(!StartPagePrinter(hPrinter))return false;
      IntPtr buf=Marshal.AllocCoTaskMem(data.Length);
      Marshal.Copy(data,0,buf,data.Length);
      int written;bool ok=WritePrinter(hPrinter,buf,data.Length,out written);
      Marshal.FreeCoTaskMem(buf);EndPagePrinter(hPrinter);EndDocPrinter(hPrinter);
      return ok&&(written==data.Length);
    }finally{ClosePrinter(hPrinter);}
  }
}
'@
$bytes=[System.IO.File]::ReadAllBytes($FilePath)
$result=[RawPrinterHelper]::SendRawData($PrinterName,$bytes)
Write-Output $result
`;

function printUsb(portName: string, data: Buffer): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Escribir buffer a archivo temporal
    const tmpFile = path.join(os.tmpdir(), `marketpos_ticket_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmpFile, data);
    } catch (err: any) {
      resolve({ success: false, error: `Error creando archivo temporal: ${err.message}` });
      return;
    }

    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch {} };
    const portPath = `\\\\.\\${portName}`;

    // Método 1: port-file directo
    try {
      const fd = fs.openSync(portPath, 'w');
      fs.writeSync(fd, data);
      fs.closeSync(fd);
      cleanup();
      resolve({ success: true });
      return;
    } catch (err: any) {
      console.log(`[USB] Port-file falló (${portPath}): ${err.message}`);
    }

    // Método 2: copy /b al puerto via cmd.exe
    try {
      execSync(`copy /b "${tmpFile}" "${portPath}"`, {
        shell: 'cmd.exe',
        windowsHide: true,
        timeout: 10000,
      });
      cleanup();
      resolve({ success: true });
      return;
    } catch (err: any) {
      console.log(`[USB] copy /b falló: ${err.message}`);
    }

    // Método 3: Windows RAW Printer API via PowerShell
    try {
      const printerName = findPrinterByPort(portName);
      if (printerName) {
        console.log(`[USB] Usando RawPrinter: "${printerName}"`);
        // Generar script PS1 temporal (auto-contenido, no depende de archivo externo)
        const psScript = path.join(os.tmpdir(), `marketpos_rawprint_${Date.now()}.ps1`);
        fs.writeFileSync(psScript, RAWPRINT_PS1);
        const output = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -PrinterName "${printerName}" -FilePath "${tmpFile}"`,
          { windowsHide: true, timeout: 15000 }
        ).toString().trim();
        try { fs.unlinkSync(psScript); } catch {}
        cleanup();
        if (output === 'True') {
          resolve({ success: true });
          return;
        }
        console.log(`[USB] RawPrinter returned: ${output}`);
      }
    } catch (err: any) {
      console.error('[USB] RawPrinter error:', err.message);
    }

    cleanup();
    resolve({ success: false, error: `No se pudo imprimir en puerto ${portName}. Verifique la conexión.` });
  });
}

// Buscar nombre de impresora por puerto
function findPrinterByPort(portName: string): string | null {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-WmiObject Win32_Printer | Where-Object { $_.PortName -eq '${portName.replace(/'/g, "''")}' } | Select-Object -ExpandProperty Name"`,
      { windowsHide: true, timeout: 5000 }
    ).toString().trim();
    return output || null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
// IMPRESIÓN RED (TCP Socket → puerto 9100)
// ════════════════════════════════════════════════════════════════════════════

function printNetwork(host: string, port: number, data: Buffer, timeout: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;

    const timer = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        resolve({ success: false, error: 'Tiempo agotado conectando a impresora de red' });
      }
    }, timeout);

    socket.on('error', (err) => {
      clearTimeout(timer);
      if (!connected) resolve({ success: false, error: err.message });
    });

    socket.connect(port, host, () => {
      connected = true;
      clearTimeout(timer);
      socket.write(data, () => {
        setTimeout(() => {
          socket.end();
          socket.destroy();
          resolve({ success: true });
        }, 300);
      });
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// DETECCIÓN DE PUERTOS USB (Windows)
// ════════════════════════════════════════════════════════════════════════════

interface DetectedPrinter {
  name: string;
  port: string;
  driver: string;
}

function detectPrinters(): DetectedPrinter[] {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-WmiObject Win32_Printer | Select-Object Name, PortName, DriverName | ConvertTo-Json"`,
      { windowsHide: true, timeout: 5000 }
    ).toString().trim();
    if (!output) return [];
    const raw = JSON.parse(output);
    const list = Array.isArray(raw) ? raw : [raw];
    return list
      .filter((p: any) => p.Name && p.PortName)
      .map((p: any) => ({ name: p.Name, port: p.PortName, driver: p.DriverName || '' }));
  } catch {
    return [];
  }
}

// Auto-detectar impresora térmica (Epson, Star, Bixolon, etc.)
function autoDetectThermalPrinter(): DetectedPrinter | null {
  const printers = detectPrinters();
  // Filtrar impresoras virtuales y PDF
  const physical = printers.filter(p => {
    const n = (p.name + ' ' + p.port).toLowerCase();
    return !n.includes('virtual') && !n.includes('pdf') && !n.includes('onenote')
      && !n.includes('fax') && !n.includes('xps') && p.port !== 'nul:'
      && p.port !== 'PORTPROMPT:';
  });
  // Priorizar por nombre de driver/impresora
  const thermal = physical.find(p => {
    const n = (p.name + ' ' + p.driver).toLowerCase();
    return n.includes('epson') || n.includes('tm-t') || n.includes('tm-m')
      || n.includes('star') || n.includes('bixolon') || n.includes('receipt')
      || n.includes('thermal') || n.includes('ticket');
  });
  return thermal || physical[0] || null;
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENTE
// ════════════════════════════════════════════════════════════════════════════

const CONFIG_DIR = path.join(os.homedir(), '.marketpos-print');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig(): PrintServiceConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('[Config] Error loading:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: PrintServiceConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('[Config] Saved to', CONFIG_FILE);
  } catch (e) {
    console.error('[Config] Error saving:', e);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SERVIDOR HTTP
// ════════════════════════════════════════════════════════════════════════════

const PORT = 12121;
let config = loadConfig();

// Auto-detectar impresora al iniciar si el puerto configurado es el default
if (config.mode === 'USB' && config.usbPort === 'USB001') {
  const thermal = autoDetectThermalPrinter();
  if (thermal) {
    console.log(`[Auto] Impresora detectada: ${thermal.name} en puerto ${thermal.port}`);
    config.usbPort = thermal.port;
    saveConfig(config);
  }
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch { return false; }
}

function getCorsHeaders(origin: string | undefined): Record<string, string> {
  // Permitir cualquier localhost + orígenes configurados
  const allowed = isLocalOrigin(origin) || config.allowedOrigins.some(o => origin === o);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_SIZE = 1024 * 1024; // 1MB max
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const headers = getCorsHeaders(origin);
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  try {
    // ── GET /status ─────────────────────────────────────────
    if (url === '/status' && method === 'GET') {
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        ok: true,
        service: 'MarketPOS Print Service',
        version: '1.0.0',
        mode: config.mode,
        usbPort: config.mode === 'USB' ? config.usbPort : undefined,
        netHost: config.mode === 'NET' ? config.netHost : undefined,
      }));
      return;
    }

    // ── GET /printers ────────────────────────────────────────
    if ((url === '/printers' || url === '/detect-usb') && method === 'GET') {
      const printers = detectPrinters();
      const thermal = autoDetectThermalPrinter();
      res.writeHead(200, headers);
      res.end(JSON.stringify({ printers, thermal }));
      return;
    }

    // ── GET /config ─────────────────────────────────────────
    if (url === '/config' && method === 'GET') {
      res.writeHead(200, headers);
      res.end(JSON.stringify(config));
      return;
    }

    // ── PUT /config ─────────────────────────────────────────
    if (url === '/config' && method === 'PUT') {
      const body = await readBody(req);
      const updates = JSON.parse(body);
      // Solo permitir campos conocidos
      const allowed = ['mode', 'usbPort', 'netHost', 'netPort', 'netTimeout',
        'charsPerLine', 'autoCut', 'openCashDrawer', 'encoding',
        'ticketSlogan', 'ticketWebsite', 'ticketShowQr', 'allowedOrigins'];
      for (const key of Object.keys(updates)) {
        if (allowed.includes(key)) {
          (config as any)[key] = updates[key];
        }
      }
      saveConfig(config);
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, config }));
      return;
    }

    // ── POST /print ─────────────────────────────────────────
    if (url === '/print' && method === 'POST') {
      const body = await readBody(req);
      const saleData: PrintSaleData = JSON.parse(body);

      // Generar ESC/POS
      const formatter = new TicketFormatter(config);
      const escposBuffer = formatter.formatSale(saleData);

      // Enviar a impresora
      let result: { success: boolean; error?: string };
      if (config.mode === 'NET' && config.netHost) {
        result = await printNetwork(config.netHost, config.netPort, escposBuffer, config.netTimeout);
      } else {
        result = await printUsb(config.usbPort, escposBuffer);
      }

      console.log(`[Print] ${result.success ? 'OK' : 'ERROR'} - Sale: ${saleData.saleNumber}${result.error ? ` (${result.error})` : ''}`);

      res.writeHead(result.success ? 200 : 500, headers);
      res.end(JSON.stringify(result));
      return;
    }

    // ── POST /test ──────────────────────────────────────────
    if (url === '/test' && method === 'POST') {
      const testData: PrintSaleData = {
        store: { name: 'TEST IMPRESION', slogan: 'Servicio funcionando correctamente' },
        saleNumber: '00000',
        date: new Date().toLocaleDateString('es-PE'),
        time: new Date().toLocaleTimeString('es-PE'),
        items: [
          { name: 'Producto de prueba', quantity: 2, unitPrice: 5.00, subtotal: 10.00 },
          { name: 'Otro producto', quantity: 1, unitPrice: 3.50, subtotal: 3.50 },
        ],
        subtotal: 13.50,
        totalDiscount: 0,
        total: 13.50,
        payment: { method: 'CASH', amountPaid: 20.00, change: 6.50 },
      };

      const formatter = new TicketFormatter(config);
      const escposBuffer = formatter.formatSale(testData);

      let result: { success: boolean; error?: string };
      if (config.mode === 'NET' && config.netHost) {
        result = await printNetwork(config.netHost, config.netPort, escposBuffer, config.netTimeout);
      } else {
        result = await printUsb(config.usbPort, escposBuffer);
      }

      console.log(`[Test] ${result.success ? 'OK' : 'ERROR'}${result.error ? ` (${result.error})` : ''}`);

      res.writeHead(result.success ? 200 : 500, headers);
      res.end(JSON.stringify(result));
      return;
    }

    // ── 404 ─────────────────────────────────────────────────
    res.writeHead(404, headers);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (err: any) {
    console.error('[Server] Error:', err.message);
    res.writeHead(500, headers);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  MarketPOS Print Service v1.0.0          ║');
  console.log(`║  Escuchando en http://127.0.0.1:${PORT}   ║`);
  console.log(`║  Modo: ${config.mode.padEnd(33)}║`);
  if (config.mode === 'USB') {
    console.log(`║  Puerto USB: ${config.usbPort.padEnd(27)}║`);
  } else {
    console.log(`║  Impresora: ${(config.netHost + ':' + config.netPort).padEnd(28)}║`);
  }
  console.log('║  Orígenes: ' + config.allowedOrigins.join(', ').substring(0, 28).padEnd(29) + '║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /status      - Estado del servicio');
  console.log('  GET  /printers    - Detectar impresoras');
  console.log('  GET  /config      - Ver configuración');
  console.log('  PUT  /config      - Actualizar configuración');
  console.log('  POST /print       - Imprimir ticket (enviar PrintSaleData)');
  console.log('  POST /test        - Imprimir ticket de prueba');
  console.log('');
});
