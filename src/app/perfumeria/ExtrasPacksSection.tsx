'use client';

/**
 * Perfumería (dueño): extras de la línea (feromonas, gramos adicionales) y
 * packs a precio cerrado. Se editan precio y estado; se crean nuevos.
 */
import { useCallback, useEffect, useState } from 'react';
import { Gift, Package, Plus, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface StockRef { storeProductId: string; name: string; stock: number | null }
interface Extra {
  id: string; name: string; price: number; extraEssenceMl: number | null; productQty: number;
  product: (StockRef & { active: boolean }) | null; active: boolean;
}
interface Pack {
  id: string; name: string; essenceMl: number; fragranceCount: number; price: number; listPrice: number | null;
  gift: (StockRef & { active: boolean }) | null; active: boolean;
}

const inputClass =
  'h-9 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 text-sm text-text-main dark:text-text-light';
const card = 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-5';

async function send(url: string, method: 'POST' | 'PATCH', body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
  return data;
}

export function ExtrasPacksSection({ reloadKey }: { reloadKey: number }) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [products, setProducts] = useState<StockRef[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [newExtra, setNewExtra] = useState({ name: '', price: '', kind: 'ml' as 'ml' | 'product', ml: '', productId: '' });
  const [newPack, setNewPack] = useState({ name: '', essenceMl: '', count: '2', price: '', giftId: '' });

  const load = useCallback(async () => {
    const [extrasRes, packsRes] = await Promise.all([
      fetch('/api/perfumery/extras?all=1&products=1'),
      fetch('/api/perfumery/packs?all=1'),
    ]);
    const extrasData = await extrasRes.json().catch(() => ({}));
    const packsData = await packsRes.json().catch(() => ({}));
    if (extrasRes.ok) {
      setExtras(extrasData.extras ?? []);
      setProducts(extrasData.products ?? []);
    }
    if (packsRes.ok) setPacks(packsData.packs ?? []);
    setPrices({});
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  const update = async (kind: 'extras' | 'packs', id: string, body: Record<string, unknown>) => {
    try {
      const data = await send(`/api/perfumery/${kind}/${id}`, 'PATCH', body);
      if (kind === 'extras') setExtras((prev) => prev.map((e) => (e.id === id ? data.extra : e)));
      else setPacks((prev) => prev.map((p) => (p.id === id ? data.pack : p)));
      setPrices((prev) => { const next = { ...prev }; delete next[id]; return next; });
      toast.success('Guardado');
    } catch (e) { toast.error((e as Error).message); }
  };

  const createExtra = async () => {
    try {
      const data = await send('/api/perfumery/extras', 'POST', {
        name: newExtra.name,
        price: Number(newExtra.price),
        extraEssenceMl: newExtra.kind === 'ml' ? Number(newExtra.ml) : null,
        storeProductId: newExtra.kind === 'product' ? newExtra.productId : null,
        sortOrder: extras.length + 100,
      });
      setExtras((prev) => [...prev, data.extra]);
      setNewExtra({ name: '', price: '', kind: 'ml', ml: '', productId: '' });
      toast.success('Extra creado');
    } catch (e) { toast.error((e as Error).message); }
  };

  const createPack = async () => {
    try {
      const data = await send('/api/perfumery/packs', 'POST', {
        name: newPack.name,
        essenceMl: Number(newPack.essenceMl),
        fragranceCount: Number(newPack.count),
        price: Number(newPack.price),
        giftStoreProductId: newPack.giftId || null,
        sortOrder: packs.length + 100,
      });
      setPacks((prev) => [...prev, data.pack]);
      setNewPack({ name: '', essenceMl: '', count: '2', price: '', giftId: '' });
      toast.success('Pack creado');
    } catch (e) { toast.error((e as Error).message); }
  };

  const priceInput = (id: string, current: number) => (
    <input
      value={prices[id] ?? String(current)}
      onChange={(e) => setPrices((prev) => ({ ...prev, [id]: e.target.value }))}
      className={`${inputClass} w-24`}
      inputMode="decimal"
    />
  );

  return (
    <>
      <section className={card}>
        <h2 className="font-semibold text-text-main dark:text-text-light mb-1 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Extras de la línea</h2>
        <p className="text-xs text-text-secondary mb-4">
          Se suman al frasco en la misma línea del ticket. Los gramos adicionales descuentan ml de la misma fragancia;
          las feromonas descuentan su producto.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th className="py-2 pr-2">Extra</th><th className="py-2 pr-2">Descuenta</th><th className="py-2 pr-2">Precio</th><th className="py-2 pr-2">Activo</th><th />
            </tr>
          </thead>
          <tbody>
            {extras.map((extra) => (
              <tr key={extra.id} className={`border-t border-border-light dark:border-border-dark ${extra.active ? '' : 'opacity-50'}`}>
                <td className="py-2 pr-2 font-medium text-text-main dark:text-text-light">{extra.name}</td>
                <td className="py-2 pr-2 text-xs text-text-secondary">
                  {extra.extraEssenceMl ? `${extra.extraEssenceMl} ml de la fragancia` : extra.product ? `${extra.productQty} × ${extra.product.name} (${extra.product.stock ?? 'sin control'})` : '—'}
                </td>
                <td className="py-2 pr-2">{priceInput(extra.id, extra.price)}</td>
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={extra.active} onChange={(e) => update('extras', extra.id, { active: e.target.checked })} aria-label={`Activar ${extra.name}`} />
                </td>
                <td className="py-2">
                  {prices[extra.id] !== undefined && (
                    <button onClick={() => update('extras', extra.id, { price: Number(prices[extra.id]) })} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white">
                      <Save className="w-3.5 h-3.5" /> Guardar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {extras.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-text-secondary">Sin extras.</td></tr>}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-light dark:border-border-dark pt-4">
          <label className="flex flex-col text-xs text-text-secondary">Nuevo extra
            <input value={newExtra.name} onChange={(e) => setNewExtra({ ...newExtra, name: e.target.value })} placeholder="Ej. Feromona Dama 10 g" className={`${inputClass} w-48`} />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Precio
            <input value={newExtra.price} onChange={(e) => setNewExtra({ ...newExtra, price: e.target.value })} className={`${inputClass} w-20`} inputMode="decimal" />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Descuenta
            <select value={newExtra.kind} onChange={(e) => setNewExtra({ ...newExtra, kind: e.target.value as 'ml' | 'product' })} className={inputClass}>
              <option value="ml">ml de la fragancia</option>
              <option value="product">un producto</option>
            </select>
          </label>
          {newExtra.kind === 'ml' ? (
            <label className="flex flex-col text-xs text-text-secondary">ml
              <input value={newExtra.ml} onChange={(e) => setNewExtra({ ...newExtra, ml: e.target.value })} className={`${inputClass} w-20`} inputMode="decimal" />
            </label>
          ) : (
            <label className="flex flex-col text-xs text-text-secondary">Producto
              <select value={newExtra.productId} onChange={(e) => setNewExtra({ ...newExtra, productId: e.target.value })} className={`${inputClass} w-56`}>
                <option value="">Elegir…</option>
                {products.map((p) => <option key={p.storeProductId} value={p.storeProductId}>{p.name}</option>)}
              </select>
            </label>
          )}
          <button
            onClick={createExtra}
            disabled={!newExtra.name || newExtra.price === '' || (newExtra.kind === 'ml' ? !newExtra.ml : !newExtra.productId)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 h-9 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Crear
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-text-main dark:text-text-light mb-1 flex items-center gap-2"><Package className="w-4 h-4" /> Packs</h2>
        <p className="text-xs text-text-secondary mb-4">
          Precio cerrado por N fragancias del mismo tamaño; el color del envase se elige al vender. En el ticket sale una línea
          por fragancia con el precio del pack repartido.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th className="py-2 pr-2">Pack</th><th className="py-2 pr-2">Frascos</th><th className="py-2 pr-2">Regalo</th><th className="py-2 pr-2">Precio</th><th className="py-2 pr-2">Activo</th><th />
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id} className={`border-t border-border-light dark:border-border-dark ${pack.active ? '' : 'opacity-50'}`}>
                <td className="py-2 pr-2 font-medium text-text-main dark:text-text-light">{pack.name}</td>
                <td className="py-2 pr-2 text-xs text-text-secondary">{pack.fragranceCount} × {pack.essenceMl} ml</td>
                <td className="py-2 pr-2 text-xs text-text-secondary">
                  {pack.gift ? <span className="inline-flex items-center gap-1"><Gift className="w-3 h-3" /> {pack.gift.name} ({pack.gift.stock ?? 'sin control'})</span> : '—'}
                </td>
                <td className="py-2 pr-2">{priceInput(pack.id, pack.price)}</td>
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={pack.active} onChange={(e) => update('packs', pack.id, { active: e.target.checked })} aria-label={`Activar ${pack.name}`} />
                </td>
                <td className="py-2">
                  {prices[pack.id] !== undefined && (
                    <button onClick={() => update('packs', pack.id, { price: Number(prices[pack.id]) })} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white">
                      <Save className="w-3.5 h-3.5" /> Guardar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {packs.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-text-secondary">Sin packs.</td></tr>}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-light dark:border-border-dark pt-4">
          <label className="flex flex-col text-xs text-text-secondary">Nuevo pack
            <input value={newPack.name} onChange={(e) => setNewPack({ ...newPack, name: e.target.value })} placeholder="Ej. Pack 2 x 60 ml Teens" className={`${inputClass} w-48`} />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">ml por frasco
            <input value={newPack.essenceMl} onChange={(e) => setNewPack({ ...newPack, essenceMl: e.target.value })} className={`${inputClass} w-20`} inputMode="decimal" />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Fragancias
            <input value={newPack.count} onChange={(e) => setNewPack({ ...newPack, count: e.target.value })} className={`${inputClass} w-16`} inputMode="numeric" />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Precio
            <input value={newPack.price} onChange={(e) => setNewPack({ ...newPack, price: e.target.value })} className={`${inputClass} w-24`} inputMode="decimal" />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Regalo (opcional)
            <select value={newPack.giftId} onChange={(e) => setNewPack({ ...newPack, giftId: e.target.value })} className={`${inputClass} w-48`}>
              <option value="">Sin regalo</option>
              {products.map((p) => <option key={p.storeProductId} value={p.storeProductId}>{p.name}</option>)}
            </select>
          </label>
          <button
            onClick={createPack}
            disabled={!newPack.name || !newPack.essenceMl || !newPack.count || !newPack.price}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 h-9 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Crear
          </button>
        </div>
      </section>
    </>
  );
}
