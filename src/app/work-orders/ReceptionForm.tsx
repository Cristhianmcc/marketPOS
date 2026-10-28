'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2, Search, User, Package, Zap, CalendarClock, Wallet, Save, Printer, UserPlus, Scale, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { METHOD_LABEL, money, printReceptionTicket, useWorkOrderContext, type ApiWorkOrder } from './shared';

interface Customer { id: string; name: string; phone: string | null }
interface Service { id: string; name: string; price: number; allowDecimals: boolean; unitSymbol: string | null; unitId: string | null }
interface ProductHit { id: string; name: string; price: number }

interface Line {
  key: string;
  /** FREE = trabajo escrito a mano (descripción, kilos y total) */
  type: 'PRODUCT' | 'SERVICE' | 'FREE';
  refId: string | null;
  name: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  allowDecimals: boolean;
  unitSymbol: string | null;
  unitId: string | null;
  notes: string;
}

const ADVANCE_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD'] as const;
const COMMON_GARMENTS = ['Camisa', 'Polo', 'Pantalón', 'Casaca', 'Chompa', 'Vestido', 'Falda', 'Sábana', 'Frazada', 'Toalla', 'Cortina', 'Medias (pares)'];
const WORK_SUGGESTIONS = ['Lavado de ropa', 'Lavado al seco', 'Lavado y planchado', 'Planchado', 'Lavado de edredón'];

/** Fecha local para un input datetime-local (YYYY-MM-DDTHH:mm). */
const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const atHour = (daysFromToday: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
};

/**
 * Recepción de una orden (lavandería / taller). En `pos` queda en la misma
 * pantalla lista para la siguiente; en `page` abre la orden creada.
 */
export function ReceptionForm({ mode, onSaved }: { mode: 'pos' | 'page'; onSaved?: () => void }) {
  const router = useRouter();
  const ctx = useWorkOrderContext();
  const freeNameRef = useRef<HTMLInputElement>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [freeName, setFreeName] = useState('');
  const [freeKg, setFreeKg] = useState('');
  const [freeTotal, setFreeTotal] = useState('');
  // Precio del kilo de hoy: con él, el total se calcula al escribir los kilos
  const [kgPrice, setKgPrice] = useState<number | null>(null);
  const [editingKgPrice, setEditingKgPrice] = useState(false);
  const [kgPriceDraft, setKgPriceDraft] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  // Prendas recibidas (se imprimen en el ticket para evitar reclamos)
  const [garments, setGarments] = useState<Record<string, number>>({});
  const [customGarment, setCustomGarment] = useState('');
  const [express, setExpress] = useState(false);
  const [promisedAt, setPromisedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<(typeof ADVANCE_METHODS)[number]>('CASH');
  const [printAfter, setPrintAfter] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setKgPrice(ctx.laundryKgPrice); }, [ctx.laundryKgPrice]);

  const onKgChange = (value: string) => {
    setFreeKg(value);
    const kg = Number(value);
    if (kgPrice && !totalTouched) setFreeTotal(kg > 0 ? (Math.round(kg * kgPrice * 100) / 100).toFixed(2) : '');
  };

  const saveKgPrice = async () => {
    const price = kgPriceDraft.trim() === '' ? null : Number(kgPriceDraft);
    if (price !== null && !(price > 0)) { toast.error('Escribe un precio por kilo mayor a 0'); return; }
    const res = await fetch('/api/store/laundry-price', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'No se pudo guardar el precio'); return; }
    setKgPrice(data.laundryKgPrice ?? null);
    setEditingKgPrice(false);
    toast.success(data.laundryKgPrice ? `Precio del kilo: ${money(data.laundryKgPrice)}` : 'Precio por kilo quitado');
  };

  const loadCustomers = () =>
    fetch('/api/customers?activeOnly=true').then((r) => (r.ok ? r.json() : null)).then((data) => setCustomers(data?.customers ?? [])).catch(() => undefined);

  useEffect(() => {
    loadCustomers();
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
          id: p.id, name: p.product?.name ?? 'Producto', price: Number(p.price),
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

  const addLine = (line: Omit<Line, 'key' | 'notes' | 'detail' | 'quantity'> & { detail?: string; quantity?: number }) => {
    setLines((prev) => [...prev, { detail: '', quantity: 1, ...line, key: `${line.refId ?? 'free'}-${Date.now()}`, notes: '' }]);
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const addFreeWork = () => {
    const name = freeName.trim();
    const total = Number(freeTotal);
    const kg = Number(freeKg);
    if (name.length < 2) { toast.error('Escribe el trabajo, por ejemplo "Lavado de ropa"'); freeNameRef.current?.focus(); return; }
    if (!(total > 0)) { toast.error('Escribe el total a cobrar'); return; }
    addLine({
      type: 'FREE', refId: null, name, unitPrice: Math.round(total * 100) / 100,
      detail: kg > 0 ? `${String(Math.round(kg * 100) / 100).replace('.', ',')} kg` : '',
      allowDecimals: false, unitSymbol: null, unitId: null,
    });
    setFreeName(''); setFreeKg(''); setFreeTotal(''); setTotalTouched(false);
    freeNameRef.current?.focus();
  };

  const changeGarment = (name: string, delta: number) =>
    setGarments((prev) => {
      const next = { ...prev, [name]: Math.max(0, (prev[name] ?? 0) + delta) };
      if (next[name] === 0) delete next[name];
      return next;
    });
  const garmentCount = Object.values(garments).reduce((sum, qty) => sum + qty, 0);
  const garmentNames = [...COMMON_GARMENTS, ...Object.keys(garments).filter((name) => !COMMON_GARMENTS.includes(name))];

  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100) / 100;
  const surcharge = express ? Math.round(subtotal * ctx.expressPercent + 1e-6) / 100 : 0;
  const total = Math.round((subtotal + surcharge) * 100) / 100;
  const advanceAmount = Math.max(0, Number(advance) || 0);
  const invalidQuantity = lines.some((l) => !(l.quantity > 0) || (!l.allowDecimals && !Number.isInteger(l.quantity)));

  const reset = () => {
    setLines([]); setGarments({}); setCustomGarment(''); setCustomerId(''); setCustomerQuery(''); setNewCustomer(null); setExpress(false);
    setPromisedAt(''); setNotes(''); setAdvance(''); setAdvanceMethod('CASH');
  };

  const ensureCustomer = async (): Promise<string | null> => {
    if (!newCustomer) return customerId || null;
    const name = newCustomer.name.trim();
    if (!name) return customerId || null;
    const res = await fetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone: newCustomer.phone.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'No se pudo crear el cliente');
    loadCustomers();
    return data.customer?.id ?? null;
  };

  const save = async (receive: boolean) => {
    if (lines.length === 0) { toast.error('Agrega al menos un trabajo'); return; }
    if (invalidQuantity) { toast.error('Revisa las cantidades: las prendas o unidades van en números enteros'); return; }
    if (receive && advanceAmount > total) { toast.error('El adelanto no puede superar el total'); return; }

    setSaving(true);
    try {
      const orderCustomerId = await ensureCustomer();
      const created = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: orderCustomerId,
          notes: notes.trim() || null,
          express,
          promisedAt: promisedAt ? new Date(promisedAt).toISOString() : null,
          garments: Object.entries(garments).map(([name, qty]) => ({ name, qty })),
          items: lines.map((l) => (l.type === 'FREE'
            ? { type: 'SERVICE', itemName: l.name, itemContent: l.detail || undefined, quantityBase: 1, unitPrice: l.unitPrice, notes: l.notes.trim() || undefined }
            : {
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
      if (mode === 'pos') {
        reset();
        onSaved?.();
        freeNameRef.current?.focus();
      } else {
        router.push(`/work-orders/${orderId}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la orden');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-surface-dark focus:ring-2 focus:ring-primary/40 focus:border-primary';
  const quickDates = [
    { label: 'Hoy 6 pm', value: atHour(0, 18) },
    { label: 'Mañana', value: atHour(1, 18) },
    { label: 'En 2 días', value: atHour(2, 18) },
    { label: 'En 3 días', value: atHour(3, 18) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {/* Trabajo escrito a mano: lo que se pesa o se recibe en el momento */}
        <section className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><Scale className="w-5 h-5 text-primary" />{ctx.isLaundry ? 'Ropa recibida' : 'Trabajo'}</h2>
          {ctx.isLaundry && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
              {editingKgPrice ? (
                <>
                  <span>Precio del kilo hoy S/</span>
                  <input type="number" min="0" step="0.1" value={kgPriceDraft} onChange={(e) => setKgPriceDraft(e.target.value)}
                    className={`${inputClass} w-28 py-1`} autoFocus aria-label="Precio del kilo" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveKgPrice(); } }} />
                  <button type="button" onClick={saveKgPrice} className="px-3 py-1 rounded-lg bg-primary text-white">Guardar</button>
                  <button type="button" onClick={() => setEditingKgPrice(false)} className="px-2 py-1 text-gray-600">Cancelar</button>
                </>
              ) : (
                <>
                  <span>{kgPrice ? <>Precio del kilo hoy: <strong>{money(kgPrice)}</strong> · el total se calcula con los kilos</> : 'Sin precio por kilo: escribe el total a mano'}</span>
                  {ctx.isOwner && (
                    <button type="button" onClick={() => { setKgPriceDraft(kgPrice ? String(kgPrice) : ''); setEditingKgPrice(true); }} className="text-primary underline">
                      {kgPrice ? 'Cambiar' : 'Poner precio por kilo'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); addFreeWork(); }} className="grid grid-cols-12 gap-2 items-end">
            <label className="col-span-12 sm:col-span-6 text-xs text-gray-500">Trabajo
              <input ref={freeNameRef} value={freeName} onChange={(e) => setFreeName(e.target.value)} list="work-suggestions"
                placeholder={ctx.isLaundry ? 'Lavado de ropa' : 'Descripción del trabajo'} className={`${inputClass} mt-1`} autoFocus={mode === 'pos'} />
              <datalist id="work-suggestions">{WORK_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            {ctx.isLaundry && (
              <label className="col-span-4 sm:col-span-2 text-xs text-gray-500">Kilos
                <input type="number" min="0" step="0.1" value={freeKg} onChange={(e) => onKgChange(e.target.value)} placeholder="0" className={`${inputClass} mt-1`} />
              </label>
            )}
            <label className={`${ctx.isLaundry ? 'col-span-5 sm:col-span-2' : 'col-span-9 sm:col-span-4'} text-xs text-gray-500`}>Total S/
              <input type="number" min="0" step="0.1" value={freeTotal} onChange={(e) => { setFreeTotal(e.target.value); setTotalTouched(e.target.value !== ''); }} placeholder="0.00" className={`${inputClass} mt-1`} />
            </label>
            <button type="submit" className="col-span-3 sm:col-span-2 h-[42px] bg-primary text-white rounded-lg font-semibold hover:opacity-90" aria-label="Agregar trabajo">
              <Plus className="inline w-4 h-4" /> Agregar
            </button>
          </form>

          {services.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Servicios de precio fijo</div>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <button key={s.id} type="button"
                    onClick={() => addLine({ type: 'SERVICE', refId: s.id, name: s.name, unitPrice: s.price, allowDecimals: s.allowDecimals, unitSymbol: s.unitSymbol, unitId: s.unitId })}
                    className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm">
                    <Plus className="inline w-4 h-4 mr-1" />{s.name} · {money(s.price)}{s.unitSymbol ? `/${s.unitSymbol}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Agregar producto (detergente, bolsa...)" className={`${inputClass} pl-9`} />
            {productHits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-dark border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                {productHits.map((p) => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm flex justify-between"
                    onClick={() => { addLine({ type: 'PRODUCT', refId: p.id, name: p.name, unitPrice: p.price, allowDecimals: true, unitSymbol: null, unitId: null }); setProductQuery(''); setProductHits([]); }}>
                    <span><Package className="inline w-4 h-4 mr-1 text-gray-400" />{p.name}</span><span>{money(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-2 mt-4">
              {lines.map((l) => {
                const badQty = !(l.quantity > 0) || (!l.allowDecimals && !Number.isInteger(l.quantity));
                return (
                  <div key={l.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{l.name}{l.detail && <span className="ml-2 text-sm font-normal text-gray-500">· {l.detail}</span>}</div>
                      <div className="flex items-center gap-2">
                        {l.type === 'FREE' && <span className="font-semibold">{money(l.unitPrice)}</span>}
                        <button onClick={() => removeLine(l.key)} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label={`Quitar ${l.name}`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {l.type !== 'FREE' && (
                      <div className="grid grid-cols-3 gap-2 mt-2 items-end">
                        <label className="text-xs text-gray-500">Cantidad{l.unitSymbol ? ` (${l.unitSymbol})` : ''}
                          <input type="number" min={l.allowDecimals ? '0.1' : '1'} step={l.allowDecimals ? '0.1' : '1'} value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                            className={`${inputClass} mt-1 ${badQty ? 'border-red-400' : ''}`} />
                        </label>
                        <label className="text-xs text-gray-500">Precio
                          <input type="number" min="0" step="0.1" value={l.unitPrice} disabled={!ctx.isOwner}
                            onChange={(e) => updateLine(l.key, { unitPrice: Number(e.target.value) })}
                            className={`${inputClass} mt-1 disabled:bg-gray-100 dark:disabled:bg-white/5`} />
                        </label>
                        <div className="text-right font-semibold text-gray-900 dark:text-gray-100 pb-2">{money(Math.round(l.quantity * l.unitPrice * 100) / 100)}</div>
                      </div>
                    )}
                    {badQty && l.type !== 'FREE' && <p className="text-xs text-red-600 mt-1">{l.allowDecimals ? 'La cantidad debe ser mayor a 0' : 'Se cobra por unidad entera'}</p>}
                    <input value={l.notes} onChange={(e) => updateLine(l.key, { notes: e.target.value })} placeholder={ctx.isLaundry ? 'Detalle: color, manchas, prendas delicadas...' : 'Detalle del trabajo'} className={`${inputClass} mt-2 text-sm`} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {ctx.isLaundry && (
          <section className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Shirt className="w-5 h-5 text-primary" />Prendas{garmentCount > 0 && <span className="text-sm font-normal text-gray-500">· {garmentCount} en total</span>}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {garmentNames.map((name) => {
                const qty = garments[name] ?? 0;
                return (
                  <div key={name} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${qty > 0 ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700'}`}>
                    <button type="button" onClick={() => changeGarment(name, 1)} className="flex-1 text-left text-sm truncate" title={`Sumar 1 a ${name}`}>{name}</button>
                    <div className="flex items-center gap-1">
                      {qty > 0 && (
                        <button type="button" onClick={() => changeGarment(name, -1)} className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center" aria-label={`Restar 1 a ${name}`}><Minus className="w-3 h-3" /></button>
                      )}
                      <span className="w-6 text-center text-sm font-semibold">{qty || ''}</span>
                      <button type="button" onClick={() => changeGarment(name, 1)} className="w-7 h-7 rounded-md bg-primary text-white flex items-center justify-center" aria-label={`Sumar 1 a ${name}`}><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); const name = customGarment.trim(); if (name) { changeGarment(name.slice(0, 40), 1); setCustomGarment(''); } }} className="mt-2 flex gap-2">
              <input value={customGarment} onChange={(e) => setCustomGarment(e.target.value)} placeholder="Otra prenda (terno, mantel, peluche...)" className={inputClass} />
              <button type="submit" className="px-3 rounded-lg border border-primary text-primary text-sm">Agregar</button>
            </form>
          </section>
        )}

        <section className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><User className="w-5 h-5 text-primary" />Cliente</h2>
          {newCustomer ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Nombre del cliente" className={inputClass} autoFocus />
              <input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="Celular" inputMode="tel" className={inputClass} />
              <button type="button" onClick={() => setNewCustomer(null)} className="text-sm text-gray-600 underline text-left">Elegir un cliente existente</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Buscar por nombre o celular" className={inputClass} />
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass} aria-label="Cliente">
                <option value="">Sin cliente</option>
                {filteredCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
              <button type="button" onClick={() => setNewCustomer({ name: customerQuery, phone: '' })} className="text-sm text-primary text-left"><UserPlus className="inline w-4 h-4 mr-1" />Cliente nuevo</button>
            </div>
          )}

          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1"><CalendarClock className="inline w-4 h-4 mr-1 text-primary" />Fecha de recojo</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {quickDates.map((d) => (
                <button key={d.label} type="button" onClick={() => setPromisedAt(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${promisedAt === d.value ? 'bg-primary text-white border-primary' : 'border-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{d.label}</button>
              ))}
            </div>
            <input type="datetime-local" value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} className={inputClass} aria-label="Fecha y hora de recojo" />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="w-5 h-5 accent-orange-500" />
            <span className="flex items-center gap-1 font-medium text-gray-900 dark:text-gray-100"><Zap className="w-4 h-4 text-orange-500" />Servicio express (+{ctx.expressPercent} %)</span>
          </label>
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">Observaciones
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} mt-1`} />
          </label>
        </section>
      </div>

      <aside>
        <section className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 lg:sticky lg:top-4">
          <h2 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Resumen</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{money(subtotal)}</dd></div>
            {express && <div className="flex justify-between text-orange-700"><dt>Recargo express</dt><dd>{money(surcharge)}</dd></div>}
            <div className="flex justify-between text-lg font-bold border-t pt-2"><dt>Total</dt><dd>{money(total)}</dd></div>
          </dl>

          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1"><Wallet className="w-4 h-4 text-primary" />Adelanto</h3>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.1" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0.00" className={inputClass} aria-label="Monto del adelanto" />
              <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as typeof advanceMethod)} className={inputClass} aria-label="Medio de pago del adelanto">
                {ADVANCE_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setAdvance(total.toFixed(2))} className="mt-2 text-xs text-primary">Paga todo ahora</button>
            <div className="flex justify-between text-sm mt-2"><span className="text-gray-600">Saldo al recoger</span><strong>{money(Math.max(0, total - advanceAmount))}</strong></div>
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
              {saving ? 'Guardando...' : ctx.isLaundry ? 'Guardar orden' : 'Crear y aprobar'}
            </button>
            {mode === 'page' && (
              <button onClick={() => save(false)} disabled={saving || lines.length === 0}
                className="w-full py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                <Save className="inline w-4 h-4 mr-1" />Guardar como borrador
              </button>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
