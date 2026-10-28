'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { ArrowLeft, Plus, Trash2, Search, User, Package, Zap, CalendarClock, Wallet, Save, Printer } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { METHOD_LABEL, money, printReceptionTicket, useWorkOrderContext, type ApiWorkOrder } from '../shared';

interface Customer { id: string; name: string; phone: string | null }
interface Service { id: string; name: string; price: number; allowDecimals: boolean; unitSymbol: string | null; unitId: string | null }
interface ProductHit { id: string; name: string; price: number; allowDecimals: boolean; unitSymbol: string | null }

interface Line {
  key: string;
  type: 'PRODUCT' | 'SERVICE';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  allowDecimals: boolean;
  unitSymbol: string | null;
  unitId: string | null;
  notes: string;
}

const ADVANCE_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD'] as const;

export default function NewWorkOrderPage() {
  const router = useRouter();
  const ctx = useWorkOrderContext();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [express, setExpress] = useState(false);
  const [promisedAt, setPromisedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<(typeof ADVANCE_METHODS)[number]>('CASH');
  const [printAfter, setPrintAfter] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/customers?activeOnly=true').then((r) => (r.ok ? r.json() : null)).then((data) => setCustomers(data?.customers ?? [])).catch(() => undefined);
    fetch('/api/services').then((r) => (r.ok ? r.json() : null)).then((data) => {
      setServices((data?.services ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        // Un servicio sin unidad admite decimales (horas de mano de obra)
        allowDecimals: s.baseUnit ? !!s.baseUnit.allowDecimals : true,
        unitSymbol: s.baseUnit?.symbol ?? null,
        unitId: s.baseUnit?.id ?? s.baseUnitId ?? null,
      })));
    }).catch(() => undefined);
  }, []);

  // Búsqueda de productos (detergente, bolsas, repuestos...)
  useEffect(() => {
    if (productQuery.trim().length < 2) { setProductHits([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/inventory?query=${encodeURIComponent(productQuery.trim())}&active=true`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setProductHits((data?.products ?? []).slice(0, 8).map((p: any) => ({
          id: p.id,
          name: p.product?.name ?? 'Producto',
          price: Number(p.price),
          // La unidad del producto la valida el servidor (enteros o decimales)
          allowDecimals: true,
          unitSymbol: null,
        }))))
        .catch(() => setProductHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)).slice(0, 50);
  }, [customers, customerQuery]);

  const addLine = (line: Omit<Line, 'key' | 'quantity' | 'notes'>) => {
    setLines((prev) => [...prev, { ...line, key: `${line.refId}-${Date.now()}`, quantity: 1, notes: '' }]);
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100) / 100;
  const surcharge = express ? Math.round(subtotal * ctx.expressPercent + 1e-6) / 100 : 0;
  const total = Math.round((subtotal + surcharge) * 100) / 100;
  const advanceAmount = Math.max(0, Number(advance) || 0);
  const invalidQuantity = lines.some((l) => !(l.quantity > 0) || (!l.allowDecimals && !Number.isInteger(l.quantity)));

  const save = async (receive: boolean) => {
    if (lines.length === 0) { toast.error('Agrega al menos un servicio o producto'); return; }
    if (invalidQuantity) { toast.error('Revisa las cantidades: las prendas o unidades van en números enteros'); return; }
    if (receive && advanceAmount > total) { toast.error('El adelanto no puede superar el total'); return; }

    setSaving(true);
    try {
      const created = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || null,
          notes: notes.trim() || null,
          express,
          promisedAt: promisedAt ? new Date(promisedAt).toISOString() : null,
          items: lines.map((l) => ({
            type: l.type,
            storeProductId: l.type === 'PRODUCT' ? l.refId : undefined,
            serviceId: l.type === 'SERVICE' ? l.refId : undefined,
            unitIdUsed: l.unitId || undefined,
            quantityBase: l.quantity,
            unitPrice: l.unitPrice,
            notes: l.notes.trim() || undefined,
          })),
        }),
      });
      const createdBody = await created.json();
      if (!created.ok) throw new Error(createdBody.error || 'No se pudo crear la orden');
      const orderId: string = createdBody.data.id;
      const number: number = createdBody.data.orderNumber;

      if (receive) {
        const approved = await fetch('/api/work-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: orderId, status: 'APPROVED' }),
        });
        if (!approved.ok) throw new Error((await approved.json()).error || 'La orden se creó pero no se pudo marcar como recibida');

        if (advanceAmount > 0) {
          const paid = await fetch(`/api/work-orders/${orderId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: advanceAmount, method: advanceMethod }),
          });
          if (!paid.ok) {
            toast.error(`Orden #${number} creada, pero el adelanto no se registró: ${(await paid.json()).error || 'error'}`);
            router.push(`/work-orders/${orderId}`);
            return;
          }
        }

        if (printAfter) {
          const detail = await fetch(`/api/work-orders/${orderId}`).then((r) => r.json());
          const printed = await printReceptionTicket(detail.data as ApiWorkOrder, ctx);
          if (!printed.ok) toast.error(`No se pudo imprimir: ${printed.error}`);
        }
      }

      toast.success(receive ? `Orden #${number} ${ctx.labels.APPROVED.toLowerCase()}` : `Borrador #${number} guardado`);
      router.push(`/work-orders/${orderId}`);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la orden');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary';

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => router.push('/work-orders')} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Volver">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{ctx.isLaundry ? 'Recibir prendas' : 'Nueva orden de trabajo'}</h1>
              <p className="text-gray-500 text-sm">{ctx.isLaundry ? 'Registra lo que deja el cliente, la fecha de entrega y el adelanto' : 'Registra el trabajo, la fecha de entrega y el adelanto'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Cliente */}
              <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><User className="w-5 h-5 text-primary" />Cliente</h2>
                <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Buscar por nombre o teléfono" className={`${inputClass} mb-2`} />
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
                  <option value="">Sin cliente</option>
                  {filteredCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
              </section>

              {/* Servicios y productos */}
              <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3">{ctx.isLaundry ? 'Servicios y prendas' : 'Servicios y productos'}</h2>
                {services.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {services.map((s) => (
                      <button key={s.id} type="button"
                        onClick={() => addLine({ type: 'SERVICE', refId: s.id, name: s.name, unitPrice: s.price, allowDecimals: s.allowDecimals, unitSymbol: s.unitSymbol, unitId: s.unitId })}
                        className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm">
                        <Plus className="inline w-4 h-4 mr-1" />{s.name} · {money(s.price)}{s.unitSymbol ? `/${s.unitSymbol}` : ''}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-4">No hay servicios. Créalos en Servicios (por ejemplo “Lavado por kilo” con unidad kg o “Terno al seco” por unidad).</p>
                )}

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Agregar producto (detergente, bolsa, repuesto...)" className={`${inputClass} pl-9`} />
                  {productHits.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                      {productHits.map((p) => (
                        <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between"
                          onClick={() => { addLine({ type: 'PRODUCT', refId: p.id, name: p.name, unitPrice: p.price, allowDecimals: p.allowDecimals, unitSymbol: p.unitSymbol, unitId: null }); setProductQuery(''); setProductHits([]); }}>
                          <span><Package className="inline w-4 h-4 mr-1 text-gray-400" />{p.name}</span><span>{money(p.price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {lines.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">Toca un servicio para agregarlo</p>
                ) : (
                  <div className="space-y-3">
                    {lines.map((l) => {
                      const badQty = !(l.quantity > 0) || (!l.allowDecimals && !Number.isInteger(l.quantity));
                      return (
                        <div key={l.key} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-gray-900">{l.name}</div>
                            <button onClick={() => removeLine(l.key)} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label={`Quitar ${l.name}`}><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-2 items-end">
                            <label className="text-xs text-gray-500">Cantidad{l.unitSymbol ? ` (${l.unitSymbol})` : ''}
                              <input type="number" min={l.allowDecimals ? '0.1' : '1'} step={l.allowDecimals ? '0.1' : '1'} value={l.quantity}
                                onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                                className={`${inputClass} mt-1 ${badQty ? 'border-red-400' : ''}`} />
                            </label>
                            <label className="text-xs text-gray-500">Precio
                              <input type="number" min="0" step="0.1" value={l.unitPrice} disabled={!ctx.isOwner}
                                onChange={(e) => updateLine(l.key, { unitPrice: Number(e.target.value) })}
                                className={`${inputClass} mt-1 disabled:bg-gray-100`} />
                            </label>
                            <div className="text-right font-semibold text-gray-900 pb-2">{money(Math.round(l.quantity * l.unitPrice * 100) / 100)}</div>
                          </div>
                          {badQty && <p className="text-xs text-red-600 mt-1">{l.allowDecimals ? 'La cantidad debe ser mayor a 0' : 'Se cobra por unidad entera'}</p>}
                          <input value={l.notes} onChange={(e) => updateLine(l.key, { notes: e.target.value })} placeholder={ctx.isLaundry ? 'Detalle: color, manchas, botones faltantes...' : 'Detalle del trabajo'} className={`${inputClass} mt-2 text-sm`} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="w-5 h-5 accent-orange-500" />
                  <span className="flex items-center gap-1 font-medium text-gray-900"><Zap className="w-4 h-4 text-orange-500" />Servicio express (+{ctx.expressPercent} %)</span>
                </label>
                <label className="block text-sm font-medium text-gray-900"><CalendarClock className="inline w-4 h-4 mr-1 text-primary" />Fecha y hora de entrega
                  <input type="datetime-local" value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-gray-900">Observaciones
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} mt-1`} />
                </label>
              </section>
            </div>

            {/* Resumen */}
            <aside className="space-y-4">
              <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:sticky lg:top-4">
                <h2 className="font-medium text-gray-900 mb-3">Resumen</h2>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{money(subtotal)}</dd></div>
                  {express && <div className="flex justify-between text-orange-700"><dt>Recargo express</dt><dd>{money(surcharge)}</dd></div>}
                  <div className="flex justify-between text-lg font-bold border-t pt-2"><dt>Total</dt><dd>{money(total)}</dd></div>
                </dl>

                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1"><Wallet className="w-4 h-4 text-primary" />Adelanto</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" step="0.1" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0.00" className={inputClass} aria-label="Monto del adelanto" />
                    <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as typeof advanceMethod)} className={inputClass} aria-label="Medio de pago del adelanto">
                      {ADVANCE_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-between text-sm mt-2"><span className="text-gray-600">Saldo al entregar</span><strong>{money(Math.max(0, total - advanceAmount))}</strong></div>
                  {advanceAmount > total && <p className="text-xs text-red-600 mt-1">El adelanto supera el total</p>}
                  <p className="text-xs text-gray-500 mt-1">El adelanto entra a la caja del turno abierto.</p>
                </div>

                <label className="flex items-center gap-2 text-sm mt-4">
                  <input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />
                  <Printer className="w-4 h-4 text-gray-500" />Imprimir ticket para el cliente
                </label>

                <div className="mt-4 space-y-2">
                  <button onClick={() => save(true)} disabled={saving || lines.length === 0}
                    className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
                    {saving ? 'Guardando...' : ctx.isLaundry ? 'Recibir prendas' : 'Crear y aprobar'}
                  </button>
                  <button onClick={() => save(false)} disabled={saving || lines.length === 0}
                    className="w-full py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    <Save className="inline w-4 h-4 mr-1" />Guardar como borrador
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
