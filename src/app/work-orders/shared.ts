'use client';

import { useEffect, useState } from 'react';
import { workOrderStatusLabels, type WorkOrderStatusName } from '@/lib/workOrders/rules';
import { buildWorkOrderTicketHtml, printWorkOrderTicket } from '@/lib/workOrders/ticket';

export type { WorkOrderStatusName };

/** Orden tal como la devuelve la API (los Decimal llegan como texto). */
export interface ApiWorkOrder {
  id: string;
  orderNumber: number;
  status: WorkOrderStatusName;
  notes: string | null;
  subtotal: string | number;
  total: string | number;
  express: boolean;
  expressSurcharge: string | number;
  advancePaid: string | number;
  promisedAt: string | null;
  garments?: { name: string; qty: number }[] | null;
  saleId: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null } | null;
  items: {
    id: string;
    type: 'PRODUCT' | 'SERVICE';
    itemName: string;
    itemContent?: string | null;
    quantityBase: string | number;
    unitPrice: string | number;
    subtotal: string | number;
    notes: string | null;
    unitUsed?: { symbol: string | null; code: string } | null;
  }[];
  payments?: { id: string; kind: 'ADVANCE' | 'REFUND'; amount: string | number; method: string; createdAt: string }[];
  sale?: { id: string; saleNumber: number } | null;
}

/** Celular peruano a formato internacional para WhatsApp (51 + 9 dígitos). */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return `51${digits}`;
  if (/^519\d{8}$/.test(digits)) return digits;
  return null;
}

/** Enlace de WhatsApp con el aviso de que la orden está lista para recoger. */
export function readyWhatsappLink(order: ApiWorkOrder, storeName: string, isLaundry: boolean): string | null {
  const number = whatsappNumber(order.customer?.phone);
  if (!number) return null;
  const firstName = (order.customer?.name ?? '').split(' ')[0];
  const balance = balanceOf(order);
  const text = [
    `Hola${firstName ? ` ${firstName}` : ''}, ${isLaundry ? 'tu ropa' : 'tu pedido'} de la orden #${order.orderNumber} ya está ${isLaundry ? 'lista' : 'listo'} para recoger en ${storeName}.`,
    balance > 0 ? `Saldo a pagar: ${money(balance)}.` : 'Ya está pagado.',
    '¡Te esperamos!',
  ].join(' ');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Abre el aviso de WhatsApp y explica qué pasó si no se pudo abrir. */
export async function openWhatsappNotice(url: string, notify: { success: (m: string) => void; error: (m: string) => void }) {
  const { openExternalLink } = await import('@/lib/openExternalLink');
  const result = await openExternalLink(url);
  if (result.ok) return;
  if (result.copied) notify.error('No se pudo abrir WhatsApp en esta PC. El enlace se copió: pégalo en el navegador.');
  else notify.error(`No se pudo abrir WhatsApp${result.error ? `: ${result.error}` : ''}`);
}

export const OPEN_STATUSES: WorkOrderStatusName[] = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'READY'];

export const STATUS_STYLE: Record<WorkOrderStatusName, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-green-100 text-green-700',
  CLOSED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta', FIADO: 'Fiado' };

export const num = (value: string | number | null | undefined) => Number(value ?? 0);
export const money = (value: number) => `S/ ${value.toFixed(2)}`;
export const balanceOf = (order: ApiWorkOrder) => Math.max(0, Math.round((num(order.total) - num(order.advancePaid)) * 100) / 100);

export const isOverdue = (order: ApiWorkOrder) =>
  !!order.promisedAt && OPEN_STATUSES.includes(order.status) && new Date(order.promisedAt).getTime() < Date.now();

export const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export interface WorkOrderContext {
  profile: string | null;
  labels: Record<WorkOrderStatusName, string>;
  isOwner: boolean;
  isLaundry: boolean;
  expressPercent: number;
  /** Precio del kilo de ropa vigente (lavandería) */
  laundryKgPrice: number | null;
  store: { name: string; ruc?: string | null; address?: string | null; phone?: string | null };
}

/** Rubro, rol, tienda y porcentaje express para las pantallas de órdenes. */
export function useWorkOrderContext(): WorkOrderContext {
  const [ctx, setCtx] = useState<WorkOrderContext>({
    profile: null, labels: workOrderStatusLabels(), isOwner: false, isLaundry: false, expressPercent: 50, laundryKgPrice: null, store: { name: 'Mi Tienda' },
  });
  useEffect(() => {
    const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([json('/api/store'), json('/api/auth/me')]).then(([data, me]) => {
      const store = data?.store;
      const profile = store?.businessProfile ?? null;
      setCtx({
        profile,
        labels: workOrderStatusLabels(profile),
        isOwner: me?.user?.role === 'OWNER',
        isLaundry: profile === 'LAVANDERIA',
        expressPercent: store?.settings?.expressSurchargePercent ?? 50,
        laundryKgPrice: store?.settings?.laundryKgPrice != null ? Number(store.settings.laundryKgPrice) : null,
        store: store ? { name: store.name, ruc: store.ruc, address: store.address, phone: store.phone } : { name: 'Mi Tienda' },
      });
    });
  }, []);
  return ctx;
}

type EscposBridge = {
  desktop?: {
    isDesktop?: boolean;
    escpos?: {
      getConfig: () => Promise<{ mode: string }>;
      printWorkOrder?: (orderId: string, labels: { title: string; footer: string }) => Promise<{ success: boolean; error?: string }>;
    };
  };
};

export async function printReceptionTicket(order: ApiWorkOrder, ctx: WorkOrderContext) {
  const title = ctx.isLaundry ? 'RECEPCIÓN DE PRENDAS' : 'ORDEN DE TRABAJO';
  const footer = ctx.isLaundry ? 'Presente este ticket para recoger sus prendas' : 'Presente este ticket para retirar su equipo';

  // En el escritorio, la misma impresora térmica (ESC/POS) que imprime las ventas
  const escpos = (window as unknown as EscposBridge).desktop?.escpos;
  if (escpos?.printWorkOrder) {
    const config = await escpos.getConfig().catch(() => null);
    if (config && ['ESCPOS_USB', 'ESCPOS_NET', 'ESCPOS_BT'].includes(config.mode)) {
      const result = await escpos.printWorkOrder(order.id, { title, footer });
      return result.success ? { ok: true } : { ok: false, error: result.error || 'No se pudo imprimir' };
    }
  }

  const html = buildWorkOrderTicketHtml({
    store: ctx.store,
    title,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customer: order.customer,
    items: order.items.map((item) => ({
      name: item.itemName,
      detail: item.itemContent && item.itemContent !== '(Servicio)' ? item.itemContent : null,
      quantity: num(item.quantityBase),
      unit: item.unitUsed?.symbol ?? null,
      subtotal: num(item.subtotal),
    })),
    expressSurcharge: num(order.expressSurcharge),
    total: num(order.total),
    advancePaid: num(order.advancePaid),
    promisedAt: order.promisedAt,
    garments: order.garments ?? null,
    notes: order.notes,
    footer,
  });
  return printWorkOrderTicket(html);
}
