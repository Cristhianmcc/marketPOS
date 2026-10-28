/**
 * Prueba aislada de la representación impresa en el ticket.
 *
 * Verifica el importe en letras, el armado del bloque fiscal de boleta y
 * factura, y el ticket ESC/POS real que se envía a la ticketera en 80 mm y
 * 58 mm. No usa base de datos, red ni impresora.
 *
 * Uso: npx tsx scripts/test-fiscal-ticket-isolated.ts
 */
import assert from 'node:assert/strict';
import { amountToWordsPEN, buildFiscalTicket, type FiscalTicketSource } from '../src/lib/sunat/printedTicket';
import { TicketFormatter } from '../desktop/src/printing/escpos/formatTicket';
import { DEFAULT_ESCPOS_CONFIG, type PrintSaleData } from '../desktop/src/printing/escpos/types';
import { getCartIcbper, getCartTotal, nextBaseQuantityForDelta } from '../src/modules/pos/lib/posMath';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

// ── Importe en letras ──────────────────────────────────────────────────────
check('importe en letras', () => {
  const cases: Array<[number, string]> = [
    [7, 'SON: SIETE CON 00/100 SOLES'],
    [1, 'SON: UNO CON 00/100 SOLES'],
    [0.5, 'SON: CERO CON 50/100 SOLES'],
    [16.2, 'SON: DIECISEIS CON 20/100 SOLES'],
    [21.5, 'SON: VEINTIUNO CON 50/100 SOLES'],
    [100, 'SON: CIEN CON 00/100 SOLES'],
    [101, 'SON: CIENTO UNO CON 00/100 SOLES'],
    [116.45, 'SON: CIENTO DIECISEIS CON 45/100 SOLES'],
    [1000, 'SON: MIL CON 00/100 SOLES'],
    [21000.99, 'SON: VEINTIUN MIL CON 99/100 SOLES'],
    [31000, 'SON: TREINTA Y UN MIL CON 00/100 SOLES'],
    [100000, 'SON: CIEN MIL CON 00/100 SOLES'],
    [2000000, 'SON: DOS MILLONES CON 00/100 SOLES'],
    [1234567.89, 'SON: UN MILLON DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE CON 89/100 SOLES'],
    [4.005, 'SON: CUATRO CON 01/100 SOLES'],
  ];
  for (const [amount, expected] of cases) assert.equal(amountToWordsPEN(amount), expected, `importe ${amount}`);
});

// ── Bloque fiscal ──────────────────────────────────────────────────────────
const baseSource: FiscalTicketSource = {
  document: {
    docType: 'BOLETA', series: 'B001', number: 12, fullNumber: 'B001-00000012',
    issueDate: new Date('2026-10-27T16:05:00Z'),
    customerDocType: 'OTHER', customerDocNumber: '-', customerName: 'CLIENTES VARIOS', customerAddress: null,
    taxable: '5.93', igv: '1.07', total: '7.00', status: 'ACCEPTED',
    hash: 'aB3dE5fG7hI9jK1lM3nO5pQ7rS=', qrText: null,
  },
  settings: { env: 'BETA', ruc: '20123456789', razonSocial: 'COMERCIAL MONTERRIAL S.A.C.', address: 'Av. Los Alamos 123, Lima' },
  store: { name: 'Bodega Los Alamos', ruc: '20123456789', address: 'Av. Los Alamos 123' },
};

const boleta = buildFiscalTicket(baseSource)!;
const factura = buildFiscalTicket({
  ...baseSource,
  document: {
    ...baseSource.document,
    docType: 'FACTURA', series: 'F001', number: 3, fullNumber: 'F001-00000003',
    customerDocType: 'RUC', customerDocNumber: '20987654321', customerName: 'Ferreteria El Martillo E.I.R.L.',
    customerAddress: 'Jr. Union 456, Lima', taxable: '84.75', igv: '15.25', total: '100.00',
    qrText: '20123456789|01|F001|3|15.25|100.00|2026-10-27|6|20987654321|hash|',
  },
  settings: { ...baseSource.settings, env: 'PROD' },
})!;

check('boleta a consumidor final', () => {
  assert.equal(boleta.title, 'BOLETA DE VENTA ELECTRONICA');
  assert.equal(boleta.customer.documentNumber, null, 'sin número para consumidor final');
  assert.equal(boleta.customer.name, 'CLIENTES VARIOS');
  assert.equal(boleta.issuer.businessName, 'COMERCIAL MONTERRIAL S.A.C.');
  assert.equal(boleta.issuer.tradeName, 'Bodega Los Alamos', 'nombre comercial cuando difiere');
  const sameName = buildFiscalTicket({ ...baseSource, store: { ...baseSource.store, name: 'comercial monterrial s.a.c.' } })!;
  assert.equal(sameName.issuer.tradeName, null, 'no repite el nombre si solo cambia mayúsculas');
  assert.equal(boleta.amountInWords, 'SON: SIETE CON 00/100 SOLES');
  assert.equal(boleta.isBeta, true);
  assert.match(boleta.qrText, /^20123456789\|03\|B001\|12\|1\.07\|7\.00\|2026-10-27\|0\|/, 'QR reconstruido cuando falta');
  assert.match(boleta.legend, /Boleta de Venta Electronica/);
});

check('factura con RUC y dirección', () => {
  assert.equal(factura.title, 'FACTURA ELECTRONICA');
  assert.equal(factura.customer.documentLabel, 'RUC');
  assert.equal(factura.customer.documentNumber, '20987654321');
  assert.equal(factura.customer.address, 'Jr. Union 456, Lima');
  assert.equal(factura.isBeta, false);
  assert.equal(factura.qrText, '20123456789|01|F001|3|15.25|100.00|2026-10-27|6|20987654321|hash|', 'usa el QR persistido');
});

check('notas y comprobantes no válidos no se imprimen como comprobante', () => {
  assert.equal(buildFiscalTicket({ ...baseSource, document: { ...baseSource.document, docType: 'NOTA_CREDITO' } }), null);
  for (const status of ['REJECTED', 'ERROR', 'CANCELED'] as const) {
    assert.equal(buildFiscalTicket({ ...baseSource, document: { ...baseSource.document, status } }), null, status);
  }
  assert.ok(buildFiscalTicket({ ...baseSource, document: { ...baseSource.document, status: 'SIGNED' } }), 'firmado y pendiente sí se imprime');
});

// ── Ticket ESC/POS ─────────────────────────────────────────────────────────
function sale(fiscal: PrintSaleData['fiscal']): PrintSaleData {
  return {
    store: { name: 'Bodega Los Alamos', ruc: '20123456789', address: 'Av. Los Alamos 123', phone: '999111222', slogan: 'Gracias por su compra!' },
    saleNumber: '12',
    date: '27/10/2026',
    time: '11:05:32',
    items: [
      { name: 'Arroz Costeño 1kg', quantity: 1, unitPrice: 4.5, subtotal: 4.5 },
      { name: 'Esponja Scotch Brite multiuso pack familiar', quantity: 2, unitPrice: 1.25, subtotal: 2.5 },
    ],
    subtotal: 7,
    totalDiscount: 0,
    total: 7,
    payment: { method: 'CASH', amountPaid: 10, change: 3 },
    cashierName: 'cleo',
    fiscal,
  };
}

/** Texto imprimible del buffer, sin comandos ESC/POS ni los datos del QR. */
function printable(buffer: Buffer, qrText?: string): string {
  let text = buffer.toString('latin1');
  if (qrText) text = text.split(qrText).join('');
  return text
    .replace(/\x1d\(k[\s\S]{2}[\s\S]{3}/g, '')
    .replace(/\x1b[@]|\x1b[aEd][\s\S]|\x1d V[\s\S]|\x1dV[\s\S]|\x1bp[\s\S]{3}/g, '')
    .replace(/[\x00-\x09\x0b-\x1f]/g, '');
}

for (const [label, cols, fiscal] of [
  ['factura 80 mm', 48, factura],
  ['boleta 58 mm', 32, boleta],
] as const) {
  check(`ticket ${label}`, () => {
    const buffer = new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: cols }).formatSale(sale(fiscal));
    const text = printable(buffer, fiscal.qrText);
    const required = [
      fiscal.issuer.businessName.toUpperCase(), `RUC: ${fiscal.issuer.ruc}`, fiscal.title, fiscal.fullNumber,
      '27/10/2026 11:05', 'TICKET 00012', 'CAJERO: cleo', 'OP. GRAVADA:', 'IGV (18%):', 'IMPORTE TOTAL:', 'SON:',
      'EFECTIVO', 'VUELTO', 'Representacion impresa', 'DESCRIPCION', 'PRECIO',
    ];
    for (const fragment of required) assert.ok(text.includes(fragment), `falta "${fragment}"`);
    // Diseño compacto: sin hash aparte (va dentro del QR) ni línea de puntos.
    for (const fragment of ['Hash:', 'RECIBIDO', '.........']) assert.ok(!text.includes(fragment), `sobra "${fragment}"`);
    assert.ok(buffer.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 3])), 'QR de módulo 3');
    assert.ok(buffer.includes(Buffer.from([0x1b, 0x33, 26])), 'interlineado compacto');
    const printedLines = text.split('\n').length;
    assert.ok(printedLines <= (cols === 48 ? 30 : 34), `ticket demasiado largo: ${printedLines} líneas`);
    if (fiscal.docType === 'FACTURA') {
      assert.ok(text.includes('RUC: 20987654321'), 'RUC del cliente');
      assert.ok(text.includes('DIRECCION:'), 'dirección del cliente');
      assert.ok(text.includes('www.sunat.gob.pe'), 'consulta en producción');
    } else {
      assert.ok(text.includes('CLIENTES VARIOS'), 'consumidor final');
      assert.ok(text.includes('PRUEBA BETA') && text.includes('SIN VALOR'), 'marca BETA');
      assert.ok(!text.includes('www.sunat.gob.pe'), 'BETA no invita a consultar en SUNAT');
    }
    assert.ok(buffer.includes(Buffer.from([0x1d, 0x28, 0x6b])), 'comando QR presente');
    assert.ok(buffer.includes(Buffer.from(fiscal.qrText, 'utf8')), 'datos del QR presentes');
    const tooLong = text.split('\n').filter((line) => line.length > cols);
    assert.deepEqual(tooLong, [], `líneas más anchas que ${cols} columnas`);
  });
}

check('ticket sin comprobante no cambia', () => {
  const text = printable(new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: 42 }).formatSale(sale(undefined)));
  assert.ok(text.includes('BODEGA LOS ALAMOS') && text.includes('TOTAL:'), 'ticket normal');
  for (const fragment of ['OP. GRAVADA', 'IMPORTE TOTAL', 'SON:', 'Representacion impresa']) {
    assert.ok(!text.includes(fragment), `no debe incluir "${fragment}"`);
  }
});

// ── Operaciones sin IGV e ICBPER ───────────────────────────────────────────
const mixed = buildFiscalTicket({
  ...baseSource,
  document: { ...baseSource.document, taxable: '8.64', igv: '1.56', exempt: '5.00', unaffected: '20.00', icbper: '1.00', total: '36.20' },
})!;

for (const cols of [42, 32] as const) {
  check(`ticket mixto ${cols} col: exonerado, inafecto e ICBPER`, () => {
    const text = printable(new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: cols }).formatSale({ ...sale(mixed), total: 36.2, icbperTotal: 1 }), mixed.qrText);
    // El importe en letras puede ocupar varias líneas en 58 mm.
    const joined = text.replace(/\s+/g, ' ');
    for (const fragment of ['OP. GRAVADA:', 'OP. EXONERADA:', 'OP. INAFECTA:', 'IGV (18%):', 'ICBPER:', 'IMPORTE TOTAL:', 'SON: TREINTA Y SEIS CON 20/100 SOLES']) {
      assert.ok(joined.includes(fragment), `falta "${fragment}"`);
    }
    assert.match(text, /OP\. EXONERADA:\s+S\/5\.00/);
    assert.match(text, /OP\. INAFECTA:\s+S\/20\.00/);
    assert.match(text, /ICBPER:\s+S\/1\.00/);
    assert.deepEqual(text.split('\n').filter((line) => line.length > cols), [], `líneas más anchas que ${cols} columnas`);
  });
}

check('ticket exonerado puro no muestra op. gravada en cero', () => {
  const exemptOnly = buildFiscalTicket({
    ...baseSource,
    document: { ...baseSource.document, taxable: '0', igv: '0', exempt: '5.00', unaffected: '0', icbper: '0', total: '5.00' },
  })!;
  const text = printable(new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: 42 }).formatSale(sale(exemptOnly)), exemptOnly.qrText);
  assert.ok(text.includes('OP. EXONERADA:'), 'op. exonerada');
  assert.ok(!text.includes('OP. GRAVADA:'), 'sin op. gravada en cero');
});

check('ticket sin comprobante muestra el ICBPER de bolsas', () => {
  const text = printable(new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: 42 }).formatSale({ ...sale(undefined), icbperTotal: 0.5, total: 7.5 }));
  assert.match(text, /ICBPER BOLSAS:\s+S\/0\.50/);
});

check('venta de orden con adelanto muestra adelanto y saldo pagado', () => {
  const formatter = () => new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: 42 });
  const cash = printable(formatter().formatSale({ ...sale(undefined), total: 71.25, payment: { method: 'CASH', amountPaid: 60, change: 8.75, advanceApplied: 20 } }));
  assert.match(cash, /ADELANTO\s+-S\/20\.00/);
  assert.match(cash, /SALDO PAGADO\s+S\/51\.25/);
  assert.match(cash, /VUELTO:\s+S\/8\.75/);
  const withFiscal = { ...sale({ ...boleta, total: 71.25 }), total: 71.25 };
  const yape = printable(formatter().formatSale({ ...withFiscal, payment: { method: 'YAPE', advanceApplied: 20 } }), boleta.qrText);
  assert.match(yape, /YAPE\s+S\/51\.25/, 'lo pagado por Yape es el saldo, no el total');
});

check('ticket de recepción de lavandería por ESC/POS', () => {
  const text = printable(new TicketFormatter({ ...DEFAULT_ESCPOS_CONFIG, charsPerLine: 42 }).formatWorkOrder({
    store: { name: 'Lavanderia Prueba', ruc: '20123456789' },
    title: 'RECEPCION DE PRENDAS', orderNumber: 2, createdAt: '28/10/2026 10:00',
    customer: { name: 'Rosa Quispe', phone: '977555333' },
    items: [{ name: 'Lavado de ropa', detail: '5 kg', quantity: 1, subtotal: 25 }, { name: 'Terno al seco', quantity: 2, unit: 'und', subtotal: 30 }],
    expressSurcharge: 27.5, total: 82.5, advancePaid: 20, promisedAt: '29/10/2026 18:00', notes: 'Camisa con mancha',
    garments: [{ name: 'Camisa', qty: 5 }, { name: 'Pantalon', qty: 1 }],
    footer: 'Presente este ticket para recoger sus prendas',
  }));
  assert.ok(text.includes('000002'), 'número de orden');
  assert.match(text, /1 Lavado de ropa 5 kg\s+S\/25\.00/);
  assert.match(text, /2 und Terno al seco\s+S\/30\.00/);
  assert.match(text, /RECARGO EXPRESS\s+S\/27\.50/);
  assert.match(text, /TOTAL:\s+S\/82\.50/);
  assert.match(text, /ADELANTO:\s+S\/20\.00/);
  assert.match(text, /SALDO A PAGAR:\s+S\/62\.50/);
  assert.ok(text.includes('ENTREGA: 29/10/2026 18:00'), 'fecha de entrega');
  assert.ok(text.includes('PRENDAS (6)'), 'total de prendas');
  assert.match(text, /Camisa\s+5/);
});

// ── Total del POS (debe coincidir con el cobro del servidor) ────────────────
check('POS: total con ICBPER igual al servidor', () => {
  const product = (price: number, icbper = false) => ({ id: `p${price}`, price, stock: null, active: true, icbper, product: { id: 'x', name: 'x', brand: null, content: null, category: 'x', unitType: 'UNIT', barcode: null } });
  const cart = [
    { storeProduct: product(10), quantity: 1 },
    { storeProduct: product(0.1, true), quantity: 1 },
  ] as unknown as Parameters<typeof getCartTotal>[0];
  const saleDate = new Date('2026-10-27T15:00:00Z');
  assert.equal(getCartIcbper(cart, saleDate), 0.5);
  // Mismo caso que T4 del banco de cobro: arroz + bolsa − S/1 de descuento = 9.60
  assert.equal(Math.round(getCartTotal(cart, 1, null) * 100) / 100, 9.6);
  const twoBags = [{ storeProduct: product(0.1, true), quantity: 2 }] as unknown as Parameters<typeof getCartTotal>[0];
  assert.equal(getCartIcbper(twoBags, saleDate), 1);
  assert.equal(getCartIcbper(twoBags, new Date('2022-06-01T15:00:00Z')), 0.8, 'tarifa 2022: S/0.40');
});

// ── Botones +/− del carrito con unidad de venta ─────────────────────────────
check('POS: +/− suman una caja, un rollo o un centímetro', () => {
  // 1 rollo (100 m) + 1 = 2 rollos = 200 m (antes: 101 m = 1.01 rollos)
  assert.equal(nextBaseQuantityForDelta({ quantity: 100, unitIdUsed: 'BX', quantityOriginal: 1, conversionFactorUsed: 100 }, 1), 200);
  assert.equal(nextBaseQuantityForDelta({ quantity: 200, unitIdUsed: 'BX', quantityOriginal: 2, conversionFactorUsed: 100 }, -1), 100);
  // 150 cm (1.5 m) + 1 = 151 cm = 1.51 m
  assert.equal(nextBaseQuantityForDelta({ quantity: 1.5, unitIdUsed: 'CMT', quantityOriginal: 150, conversionFactorUsed: 0.01 }, 1), 1.51);
  // Sin unidad de venta: una unidad base
  assert.equal(nextBaseQuantityForDelta({ quantity: 3 }, 1), 4);
});

console.log(`\nTicket fiscal PASS: ${passed} comprobaciones.`);
