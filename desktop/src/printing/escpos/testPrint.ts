/**
 * D6-USB - Test Print Module
 * Generates a test ticket for printer verification
 */

import * as iconv from 'iconv-lite';
import { EscposConfig } from './types';

// ============== ESC/POS Commands ==============

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_SIZE: Buffer.from([GS, 0x21, 0x11]),
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),
  FEED_LINE: Buffer.from([LF]),
  FEED_LINES: (n: number) => Buffer.from([ESC, 0x64, n]),
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]),
  OPEN_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),
};

// ============== Test Print Generator ==============

export function generateTestPrint(config: EscposConfig): Buffer {
  const cols = config.charsPerLine;
  const buffers: Buffer[] = [];
  
  const push = (...bufs: Buffer[]) => buffers.push(...bufs);
  const text = (str: string) => buffers.push(iconv.encode(str, config.encoding));
  const line = (str: string = '') => { text(str); push(CMD.FEED_LINE); };
  const divider = () => line('='.repeat(cols));
  const center = (str: string) => {
    const padding = Math.floor((cols - str.length) / 2);
    return ' '.repeat(Math.max(0, padding)) + str;
  };
  
  // Initialize
  push(CMD.INIT);
  
  // Header
  push(CMD.ALIGN_CENTER);
  push(CMD.BOLD_ON);
  push(CMD.DOUBLE_SIZE);
  line('PRUEBA DE IMPRESION');
  push(CMD.NORMAL_SIZE);
  push(CMD.BOLD_OFF);
  
  push(CMD.ALIGN_LEFT);
  line('');
  divider();
  
  // Printer info
  line(`Ancho: ${cols} columnas`);
  line(`Codificacion: ${config.encoding}`);
  line(`Corte automatico: ${config.autoCut ? 'SI' : 'NO'}`);
  line(`Abrir gaveta: ${config.openCashDrawer ? 'SI' : 'NO'}`);
  
  divider();
  
  // Character test
  line('CARACTERES ESPECIALES:');
  line('Numeros: 0123456789');
  line('Simbolos: !@#$%^&*()');
  line('Moneda: S/ $ EUR');
  line('Acentos: aeiou AEIOU');
  line('Enhe: n N');
  
  divider();
  
  // Alignment test
  push(CMD.ALIGN_LEFT);
  line('<- IZQUIERDA');
  
  push(CMD.ALIGN_CENTER);
  line('CENTRO');
  
  push(CMD.ALIGN_RIGHT);
  line('DERECHA ->');
  
  push(CMD.ALIGN_LEFT);
  divider();
  
  // Column test
  line('PRUEBA DE COLUMNAS:');
  const colTest = '1234567890'.repeat(Math.ceil(cols / 10)).substring(0, cols);
  line(colTest);
  line('|' + '-'.repeat(cols - 2) + '|');
  
  divider();
  
  // Date/time
  const now = new Date();
  line(`Fecha: ${now.toLocaleDateString('es-PE')}`);
  line(`Hora: ${now.toLocaleTimeString('es-PE')}`);
  
  divider();
  
  // Footer
  push(CMD.ALIGN_CENTER);
  line('');
  push(CMD.BOLD_ON);
  line('IMPRESION EXITOSA!');
  push(CMD.BOLD_OFF);
  line('');
  line('Monterrial POS Desktop');
  line('www.monterrial.com');
  
  push(CMD.ALIGN_LEFT);
  
  // Feed and cut
  push(CMD.FEED_LINES(4));
  
  if (config.autoCut) {
    push(CMD.CUT_PARTIAL);
  }
  
  if (config.openCashDrawer) {
    push(CMD.OPEN_DRAWER);
  }
  
  return Buffer.concat(buffers);
}

// ============== Minimal Test ==============

/**
 * Generate a minimal test print (just a few lines)
 */
export function generateMinimalTest(config: EscposConfig): Buffer {
  const buffers: Buffer[] = [];
  
  const push = (...bufs: Buffer[]) => buffers.push(...bufs);
  const text = (str: string) => buffers.push(iconv.encode(str, config.encoding));
  const line = (str: string = '') => { text(str); push(CMD.FEED_LINE); };
  
  push(CMD.INIT);
  push(CMD.ALIGN_CENTER);
  
  line('TEST PRINT OK');
  line(new Date().toLocaleString('es-PE'));
  
  push(CMD.FEED_LINES(3));
  
  if (config.autoCut) {
    push(CMD.CUT_PARTIAL);
  }
  
  return Buffer.concat(buffers);
}
