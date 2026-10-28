/**
 * Ticket de recepción de una orden de trabajo (lavandería / taller).
 * HTML de ancho térmico; se imprime por la impresora del escritorio
 * (`window.desktop.printer.printHtml`) o, si no existe, por el navegador.
 */

export interface WorkOrderTicketData {
  store: { name: string; ruc?: string | null; address?: string | null; phone?: string | null };
  title: string;
  orderNumber: number;
  createdAt: string | Date;
  customer?: { name: string; phone?: string | null } | null;
  items: { name: string; detail?: string | null; quantity: number; unit?: string | null; subtotal: number }[];
  expressSurcharge: number;
  total: number;
  advancePaid: number;
  promisedAt?: string | Date | null;
  garments?: { name: string; qty: number }[] | null;
  notes?: string | null;
  footer: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const money = (value: number) => `S/ ${value.toFixed(2)}`;

const formatDate = (value: string | Date) =>
  new Date(value).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''));

export function buildWorkOrderTicketHtml(data: WorkOrderTicketData): string {
  const balance = Math.max(0, Math.round((data.total - data.advancePaid) * 100) / 100);
  const row = (left: string, right: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${left}</td><td class="r">${right}</td></tr>`;
  const items = data.items.map((item) =>
    row(`${escapeHtml(qty(item.quantity))}${item.unit ? ` ${escapeHtml(item.unit)}` : ''} ${escapeHtml(item.name)}${item.detail ? ` ${escapeHtml(item.detail)}` : ''}`, money(item.subtotal))
  ).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>OT ${data.orderNumber}</title><style>
    @page { size: 80mm auto; margin: 3mm; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
    .big { font-size: 20px; font-weight: bold; text-align: center; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    .strong td { font-weight: bold; } hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .box { border: 1px solid #000; padding: 3px; margin: 4px 0; text-align: center; font-weight: bold; }
  </style></head><body>
    <h1>${escapeHtml(data.store.name)}</h1>
    ${data.store.ruc ? `<div class="c">RUC ${escapeHtml(data.store.ruc)}</div>` : ''}
    ${data.store.address ? `<div class="c">${escapeHtml(data.store.address)}</div>` : ''}
    ${data.store.phone ? `<div class="c">Tel. ${escapeHtml(data.store.phone)}</div>` : ''}
    <hr><div class="c"><strong>${escapeHtml(data.title)}</strong></div>
    <div class="big">N° ${String(data.orderNumber).padStart(6, '0')}</div>
    <div>Recibido: ${formatDate(data.createdAt)}</div>
    ${data.customer ? `<div>Cliente: ${escapeHtml(data.customer.name)}</div>${data.customer.phone ? `<div>Teléfono: ${escapeHtml(data.customer.phone)}</div>` : ''}` : ''}
    ${data.promisedAt ? `<div class="box">ENTREGA: ${formatDate(data.promisedAt)}</div>` : ''}
    <hr><table>${items}
    ${data.expressSurcharge > 0 ? row('Recargo express', money(data.expressSurcharge)) : ''}
    </table><hr><table>
    ${row('TOTAL', money(data.total), true)}
    ${data.advancePaid > 0 ? row('Adelanto', money(data.advancePaid)) : ''}
    ${row('SALDO A PAGAR', money(balance), true)}
    </table>
    ${data.garments && data.garments.length > 0 ? `<hr><div><strong>PRENDAS (${data.garments.reduce((t, g) => t + g.qty, 0)})</strong></div><table>${data.garments.map((g) => row(escapeHtml(g.name), String(g.qty))).join('')}</table>` : ''}
    ${data.notes ? `<hr><div>Obs.: ${escapeHtml(data.notes)}</div>` : ''}
    <hr><div class="c">${escapeHtml(data.footer)}</div>
  </body></html>`;
}

type DesktopBridge = { desktop?: { isDesktop?: boolean; printer?: { printHtml?: (html: string, options?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }> } } };

/** Imprime por la impresora configurada en el escritorio o por el navegador. */
export async function printWorkOrderTicket(html: string): Promise<{ ok: boolean; error?: string }> {
  const bridge = (typeof window !== 'undefined' ? (window as unknown as DesktopBridge) : {}).desktop;
  if (bridge?.isDesktop && bridge.printer?.printHtml) {
    const result = await bridge.printer.printHtml(html, {});
    return result.success ? { ok: true } : { ok: false, error: result.error || 'No se pudo imprimir' };
  }
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return { ok: false, error: 'No se pudo preparar la impresión' };
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 200));
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 1000);
  return { ok: true };
}
