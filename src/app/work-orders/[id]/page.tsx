'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { ArrowLeft, Printer, Zap, CalendarClock, Wallet, Receipt, XCircle, AlertTriangle, Shirt, MessageCircle } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import {
  METHOD_LABEL, OPEN_STATUSES, STATUS_STYLE, balanceOf, formatDateTime, isOverdue, money, num,
  printReceptionTicket, readyWhatsappLink, useWorkOrderContext, type ApiWorkOrder, type WorkOrderStatusName,
} from '../shared';

const PAY_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD', 'FIADO'] as const;
const ADVANCE_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD'] as const;

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const ctx = useWorkOrderContext();
  const [order, setOrder] = useState<ApiWorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [payMethod, setPayMethod] = useState<(typeof PAY_METHODS)[number]>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<(typeof ADVANCE_METHODS)[number]>('CASH');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Orden no encontrada');
      setOrder(data.data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const call = async (url: string, method: string, body: unknown, success: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción');
      toast.success(success);
      await load();
      return data;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <AuthLayout><div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></AuthLayout>;
  }
  if (!order) {
    return <AuthLayout><div className="p-8 text-center text-gray-600">Orden no encontrada. <button className="text-primary underline" onClick={() => router.push('/work-orders')}>Volver</button></div></AuthLayout>;
  }

  const total = num(order.total);
  const advance = num(order.advancePaid);
  const balance = balanceOf(order);
  const open = OPEN_STATUSES.includes(order.status);
  const overdue = isOverdue(order);
  const label = ctx.labels;
  // Aviso de "lista para recoger" (solo cuando la orden está lista y hay celular)
  const whatsapp = order.status === 'READY' ? readyWhatsappLink(order, ctx.store.name, ctx.isLaundry) : null;

  const setStatus = (status: WorkOrderStatusName) =>
    call('/api/work-orders', 'PATCH', { id: order.id, status }, `Estado: ${label[status]}`);

  const charge = async () => {
    if (payMethod === 'CASH' && !(Number(amountPaid) >= balance)) { toast.error('El monto recibido no cubre el saldo'); return; }
    if (payMethod === 'FIADO' && !order.customer) { toast.error('Para fiar, la orden debe tener cliente'); return; }
    const data = await call(`/api/work-orders/${order.id}/convert-to-sale`, 'POST',
      { paymentMethod: payMethod, ...(payMethod === 'CASH' ? { amountPaid: Number(amountPaid) } : {}) },
      ctx.isLaundry ? 'Orden entregada y cobrada' : 'Orden cobrada');
    if (data?.data?.saleId) {
      setShowCharge(false);
      router.push(`/receipt/${data.data.saleId}`);
    }
  };

  const addAdvance = async () => {
    const amount = Number(advanceAmount);
    if (!(amount > 0) || amount > balance) { toast.error(`El adelanto debe ser mayor a 0 y hasta ${money(balance)}`); return; }
    const data = await call(`/api/work-orders/${order.id}/payments`, 'POST', { amount, method: advanceMethod }, 'Adelanto registrado');
    if (data) { setShowAdvance(false); setAdvanceAmount(''); }
  };

  const cancelOrder = async () => {
    const msg = advance > 0
      ? `¿Cancelar la orden #${order.orderNumber}? Se registrará la devolución del adelanto de ${money(advance)} en tu turno.`
      : `¿Cancelar la orden #${order.orderNumber}?`;
    if (!window.confirm(msg)) return;
    const data = await call('/api/work-orders', 'DELETE', { id: order.id }, advance > 0 ? 'Orden cancelada y adelanto devuelto' : 'Orden cancelada');
    if (data && order.status === 'DRAFT' && advance === 0) router.push('/work-orders');
  };

  const toggleExpress = () => call('/api/work-orders', 'PATCH', { id: order.id, express: !order.express }, order.express ? 'Express quitado' : 'Express aplicado');

  const print = async () => {
    const result = await printReceptionTicket(order, ctx);
    if (!result.ok) toast.error(`No se pudo imprimir: ${result.error}`);
  };

  const nextActions: { status: WorkOrderStatusName; text: string }[] = {
    DRAFT: [{ status: 'APPROVED' as const, text: ctx.isLaundry ? 'Marcar como recibido' : 'Aprobar' }],
    APPROVED: [{ status: 'IN_PROGRESS' as const, text: 'Pasar a En proceso' }, { status: 'READY' as const, text: 'Marcar Listo' }],
    IN_PROGRESS: [{ status: 'READY' as const, text: 'Marcar Listo' }],
    READY: [{ status: 'IN_PROGRESS' as const, text: 'Volver a En proceso' }],
    CLOSED: [],
    CANCELLED: [],
  }[order.status];

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary';
  const change = payMethod === 'CASH' && Number(amountPaid) >= balance ? Math.round((Number(amountPaid) - balance) * 100) / 100 : null;

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => router.push('/work-orders')} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Volver"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-2xl font-bold text-gray-900">Orden #{order.orderNumber}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[order.status]}`}>{label[order.status]}</span>
            {order.express && <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700"><Zap className="inline w-3 h-3" /> Express</span>}
            {overdue && <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle className="inline w-3 h-3" /> Atrasada</span>}
            <button onClick={print} className="ml-auto px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-white"><Printer className="inline w-4 h-4 mr-1" />Ticket</button>
          </div>

          <section className="bg-white rounded-lg border border-gray-200 p-4 grid sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-gray-500">Cliente</div><div className="font-medium">{order.customer ? `${order.customer.name}${order.customer.phone ? ` · ${order.customer.phone}` : ''}` : 'Sin cliente'}</div></div>
            <div><div className="text-gray-500">Recibido</div><div className="font-medium">{formatDateTime(order.createdAt)}</div></div>
            <div><div className="text-gray-500"><CalendarClock className="inline w-4 h-4" /> Entrega</div><div className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{order.promisedAt ? formatDateTime(order.promisedAt) : 'Sin fecha'}</div></div>
            {order.notes && <div className="sm:col-span-3"><div className="text-gray-500">Observaciones</div><div>{order.notes}</div></div>}
          </section>

          {(order.garments?.length ?? 0) > 0 && (
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-medium text-gray-900 mb-2"><Shirt className="inline w-4 h-4 mr-1 text-primary" />Prendas recibidas · {order.garments!.reduce((sum, g) => sum + g.qty, 0)}</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                {order.garments!.map((g) => <span key={g.name} className="px-2 py-1 rounded-lg bg-gray-100">{g.qty} × {g.name}</span>)}
              </div>
              {order.status === 'READY' && <p className="text-xs text-gray-500 mt-2">Revisa las prendas con el cliente antes de entregar.</p>}
            </section>
          )}

          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Detalle</th><th className="py-2 text-right">Cant.</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">Importe</th></tr></thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2">{item.itemName}{item.itemContent && item.itemContent !== '(Servicio)' && <span className="text-gray-500"> · {item.itemContent}</span>}{item.notes && <div className="text-xs text-gray-500">{item.notes}</div>}</td>
                    <td className="py-2 text-right">{num(item.quantityBase)}{item.unitUsed?.symbol ? ` ${item.unitUsed.symbol}` : ''}</td>
                    <td className="py-2 text-right">{money(num(item.unitPrice))}</td>
                    <td className="py-2 text-right">{money(num(item.subtotal))}</td>
                  </tr>
                ))}
                {num(order.expressSurcharge) > 0 && (
                  <tr className="text-orange-700"><td className="py-2" colSpan={3}>Recargo express</td><td className="py-2 text-right">{money(num(order.expressSurcharge))}</td></tr>
                )}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">Adelanto</dt><dd>{money(advance)}</dd></div>
              {order.status === 'CLOSED'
                ? <div className="flex justify-between text-base font-bold text-primary"><dt>Pagado al entregar</dt><dd>{money(balance)}</dd></div>
                : order.status !== 'CANCELLED' && <div className="flex justify-between text-base font-bold text-primary"><dt>Saldo</dt><dd>{money(balance)}</dd></div>}
            </dl>
          </section>

          {(order.payments?.length ?? 0) > 0 && (
            <section className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-medium text-gray-900 mb-2"><Wallet className="inline w-4 h-4 mr-1 text-primary" />Pagos a cuenta</h2>
              <ul className="text-sm divide-y">
                {order.payments!.map((p) => (
                  <li key={p.id} className="py-1 flex justify-between">
                    <span>{p.kind === 'REFUND' ? 'Devolución' : 'Adelanto'} · {METHOD_LABEL[p.method] ?? p.method} · {formatDateTime(p.createdAt)}</span>
                    <span className={p.kind === 'REFUND' ? 'text-red-600' : ''}>{p.kind === 'REFUND' ? '−' : ''}{money(num(p.amount))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open && (
            <section className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-2">
              {nextActions.map((a) => (
                <button key={a.status} disabled={busy} onClick={() => setStatus(a.status)} className="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 disabled:opacity-50">{a.text}</button>
              ))}
              {order.status !== 'DRAFT' && (
                <button disabled={busy} onClick={() => { setAmountPaid(balance.toFixed(2)); setShowCharge(true); }} className="px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
                  <Receipt className="inline w-4 h-4 mr-1" />{ctx.isLaundry ? 'Entregar y cobrar' : 'Cobrar'} {money(balance)}
                </button>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="px-4 py-2 border border-green-500 text-green-700 rounded-lg hover:bg-green-50">
                  <MessageCircle className="inline w-4 h-4 mr-1" />Avisar por WhatsApp
                </a>
              )}
              {balance > 0 && <button disabled={busy} onClick={() => setShowAdvance(true)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"><Wallet className="inline w-4 h-4 mr-1" />Adelanto</button>}
              <button disabled={busy} onClick={toggleExpress} className="px-4 py-2 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50"><Zap className="inline w-4 h-4 mr-1" />{order.express ? 'Quitar express' : 'Hacer express'}</button>
              {ctx.isOwner && <button disabled={busy} onClick={cancelOrder} className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 ml-auto"><XCircle className="inline w-4 h-4 mr-1" />Cancelar orden</button>}
            </section>
          )}

          {order.status === 'CLOSED' && order.saleId && (
            <section className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between text-sm">
              <span>{label.CLOSED}{order.sale ? ` con la venta #${order.sale.saleNumber}` : ''}.</span>
              <button onClick={() => router.push(`/receipt/${order.saleId}`)} className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"><Receipt className="inline w-4 h-4 mr-1" />Ver comprobante</button>
            </section>
          )}
        </div>
      </div>

      {showCharge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg max-w-sm w-full p-5 space-y-3">
            <h2 className="text-lg font-semibold">{ctx.isLaundry ? 'Entregar y cobrar' : 'Cobrar orden'} #{order.orderNumber}</h2>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt>Total</dt><dd>{money(total)}</dd></div>
              <div className="flex justify-between"><dt>Adelanto</dt><dd>− {money(advance)}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>A cobrar</dt><dd>{money(balance)}</dd></div>
            </dl>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)} className={inputClass} aria-label="Medio de pago">
              {PAY_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
            {payMethod === 'CASH' && (
              <label className="block text-sm">Recibido
                <input type="number" min="0" step="0.1" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={`${inputClass} mt-1`} autoFocus />
                {change !== null && <span className="block mt-1 text-gray-600">Vuelto: <strong>{money(change)}</strong></span>}
              </label>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCharge(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">Cancelar</button>
              <button onClick={charge} disabled={busy} className="flex-1 py-2 bg-primary text-white rounded-lg font-semibold disabled:opacity-50">{busy ? 'Cobrando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {showAdvance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg max-w-sm w-full p-5 space-y-3">
            <h2 className="text-lg font-semibold">Registrar adelanto</h2>
            <p className="text-sm text-gray-600">Saldo pendiente: {money(balance)}</p>
            <input type="number" min="0" step="0.1" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={inputClass} placeholder="Monto" autoFocus aria-label="Monto del adelanto" />
            <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as typeof advanceMethod)} className={inputClass} aria-label="Medio de pago del adelanto">
              {ADVANCE_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAdvance(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">Cancelar</button>
              <button onClick={addAdvance} disabled={busy} className="flex-1 py-2 bg-primary text-white rounded-lg font-semibold disabled:opacity-50">Registrar</button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
