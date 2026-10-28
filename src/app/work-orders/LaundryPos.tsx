'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, MessageCircle, PackageCheck, ShoppingCart } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { ReceptionForm } from './ReceptionForm';
import { balanceOf, formatDateTime, money, openWhatsappNotice, readyWhatsappLink, useWorkOrderContext, type ApiWorkOrder } from './shared';

/**
 * Punto de venta de lavandería: la pantalla principal es la recepción de ropa.
 * Arriba quedan las órdenes listas para entregar; la venta directa de
 * productos sigue disponible en el POS normal.
 */
export function LaundryPos({ onDirectSale }: { onDirectSale: () => void }) {
  const ctx = useWorkOrderContext();
  const [ready, setReady] = useState<ApiWorkOrder[]>([]);
  const [pending, setPending] = useState(0);

  const loadReady = useCallback(() => {
    fetch('/api/work-orders?status=READY&limit=30').then((r) => (r.ok ? r.json() : null)).then((data) => setReady(data?.data ?? [])).catch(() => undefined);
    Promise.all(['APPROVED', 'IN_PROGRESS'].map((status) =>
      fetch(`/api/work-orders?status=${status}&limit=1`).then((r) => (r.ok ? r.json() : null)).then((data) => data?.total ?? 0).catch(() => 0),
    )).then((totals) => setPending(totals.reduce((a, b) => a + b, 0)));
  }, []);

  useEffect(() => {
    loadReady();
    const timer = setInterval(loadReady, 60_000);
    return () => clearInterval(timer);
  }, [loadReady]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <Toaster position="top-right" richColors />
      <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-text-main dark:text-text-light">Recepción de ropa</h1>
          <Link href="/work-orders" className="ml-auto px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-white dark:hover:bg-white/5">
            <ClipboardList className="inline w-4 h-4 mr-1" />Órdenes{pending > 0 ? ` · ${pending} en lavandería` : ''}
          </Link>
          <button onClick={onDirectSale} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-white dark:hover:bg-white/5">
            <ShoppingCart className="inline w-4 h-4 mr-1" />Venta directa
          </button>
        </div>

        {ready.length > 0 && (
          <section className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="text-sm font-medium text-green-800 dark:text-green-300 mb-2"><PackageCheck className="inline w-4 h-4 mr-1" />Listas para entregar ({ready.length})</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ready.map((order) => {
                const whatsapp = readyWhatsappLink(order, ctx.store.name, true);
                return (
                  <div key={order.id} className="shrink-0 flex items-stretch bg-white dark:bg-surface-dark rounded-lg border border-green-200 dark:border-green-800 text-sm hover:shadow-sm">
                    <Link href={`/work-orders/${order.id}`} className="px-3 py-2">
                      <div className="font-semibold">#{order.orderNumber} · {order.customer?.name ?? 'Sin cliente'}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Saldo {money(balanceOf(order))}{order.promisedAt ? ` · ${formatDateTime(order.promisedAt)}` : ''}
                      </div>
                    </Link>
                    {whatsapp && (
                      <button type="button" onClick={() => openWhatsappNotice(whatsapp, toast)} title="Avisar por WhatsApp" aria-label={`Avisar a ${order.customer?.name ?? 'cliente'} por WhatsApp`}
                        className="flex items-center px-2 border-l border-green-200 text-green-600 hover:bg-green-50">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <ReceptionForm mode="pos" onSaved={loadReady} />
      </div>
    </div>
  );
}
