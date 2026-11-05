'use client';

/**
 * Perfumería (solo dueño): importar el catálogo de fragancias en esta sede,
 * ajustar presentaciones (precio, ml, rellenos, 2x1/3x2), extras y packs,
 * ver el consumo y exportar el catálogo para otra sede.
 * El stock de esencias y envases se maneja en Inventario (ajustes y compras).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Droplets, Globe, Plus, Save, Upload } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import AuthLayout from '@/components/AuthLayout';
import { ExtrasPacksSection } from './ExtrasPacksSection';
import { ReportSection } from './ReportSection';

interface Presentation {
  id: string;
  name: string;
  essenceMl: number;
  price: number;
  listPrice: number | null;
  isRefill: boolean;
  requiresPriorPurchase: boolean;
  grantsRefill: boolean;
  promoBuy: number | null;
  promoPay: number | null;
  sortOrder: number;
  active: boolean;
  container: { storeProductId: string; name: string; stock: number | null; active: boolean } | null;
}

interface ParsedFile {
  name: string;
  fragrances?: unknown[];
  presentations?: unknown[];
  extras?: unknown[];
  packs?: unknown[];
  csv?: string;
  count: number;
}

const inputClass =
  'h-9 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 text-sm text-text-main dark:text-text-light';
const card = 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-5';

export default function PerfumeryPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Presentation>>>({});
  const [fragranceCount, setFragranceCount] = useState<number | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [file, setFile] = useState<ParsedFile | null>(null);
  const [useDefaults, setUseDefaults] = useState(true);
  const [stockMl, setStockMl] = useState('');
  const [containerStock, setContainerStock] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [newPresentation, setNewPresentation] = useState({ name: '', essenceMl: '', price: '', isRefill: false });
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const [presRes, fragRes] = await Promise.all([
      fetch('/api/perfumery/presentations?all=1'),
      fetch('/api/perfumery/fragrances'),
    ]);
    const presData = await presRes.json().catch(() => ({}));
    if (!presRes.ok) {
      setAccessError(presData.error || 'No se pudo cargar Perfumería');
      return;
    }
    const fragData = await fragRes.json().catch(() => ({}));
    setPresentations(presData.presentations ?? []);
    setFragranceCount(Array.isArray(fragData.fragrances) ? fragData.fragrances.length : null);
    setDrafts({});
  }, []);

  useEffect(() => { load(); }, [load]);

  const readFile = async (selected: File | undefined) => {
    setImportErrors([]);
    if (!selected) return setFile(null);
    const text = await selected.text();
    if (selected.name.toLowerCase().endsWith('.csv')) {
      const rows = text.split(/\r?\n/).filter((line) => line.trim()).length - 1;
      setFile({ name: selected.name, csv: text, count: Math.max(0, rows) });
      return;
    }
    try {
      const data = JSON.parse(text);
      const fragrances = Array.isArray(data.fragrances) ? data.fragrances : [];
      const filePresentations = Array.isArray(data.presentations) ? data.presentations : [];
      setFile({
        name: selected.name,
        fragrances,
        presentations: filePresentations,
        extras: Array.isArray(data.extras) ? data.extras : [],
        packs: Array.isArray(data.packs) ? data.packs : [],
        count: fragrances.length,
      });
      if (filePresentations.length) setUseDefaults(false);
    } catch {
      toast.error('El archivo no es un JSON válido');
      setFile(null);
    }
  };

  const runImport = async () => {
    if (!file && !useDefaults) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const res = await fetch('/api/perfumery/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fragrances: file?.fragrances ?? [],
          presentations: file?.presentations ?? [],
          extras: file?.extras ?? [],
          packs: file?.packs ?? [],
          csv: file?.csv,
          useDefaultPresentations: useDefaults,
          initialStockMl: stockMl === '' ? null : Number(stockMl),
          initialContainerStock: containerStock === '' ? null : Number(containerStock),
          updateExisting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportErrors(data.details ?? []);
        throw new Error(data.error || 'No se pudo importar');
      }
      const r = data.result;
      toast.success(
        `Fragancias: ${r.fragrancesCreated} nuevas, ${r.fragrancesUpdated} actualizadas, ${r.fragrancesSkipped} ya existían. ` +
        `Presentaciones: ${r.presentationsCreated} nuevas. Envases: ${r.containersCreated} nuevos. ` +
        `Extras: ${r.extrasCreated} nuevos. Packs: ${r.packsCreated} nuevos.`
      );
      setFile(null);
      setReloadKey((key) => key + 1);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/perfumery/presentations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
    setPresentations((prev) => prev.map((p) => (p.id === id ? data.presentation : p)));
    setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const saveDraft = async (id: string) => {
    try {
      const draft = { ...(drafts[id] ?? {}) };
      // La promo se guarda completa (lleva y paga) aunque se edite un solo campo.
      if (draft.promoBuy !== undefined || draft.promoPay !== undefined) {
        const current = presentations.find((p) => p.id === id);
        draft.promoBuy = draft.promoBuy ?? current?.promoBuy ?? null;
        draft.promoPay = draft.promoPay ?? current?.promoPay ?? null;
      }
      await patch(id, draft);
      toast.success('Presentación guardada');
    } catch (e) { toast.error((e as Error).message); }
  };

  const createPresentation = async () => {
    try {
      const res = await fetch('/api/perfumery/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPresentation.name,
          essenceMl: Number(newPresentation.essenceMl),
          price: Number(newPresentation.price),
          isRefill: newPresentation.isRefill,
          sortOrder: presentations.length + 100,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      setPresentations((prev) => [...prev, data.presentation]);
      setNewPresentation({ name: '', essenceMl: '', price: '', isRefill: false });
      toast.success('Presentación creada');
    } catch (e) { toast.error((e as Error).message); }
  };

  const publishInCatalog = async () => {
    try {
      const res = await fetch('/api/perfumery/catalog-publish', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo marcar');
      toast.success(`${data.count} fragancias marcadas. Publica el catálogo en Configuración → Catálogo Web.`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const draftValue = (p: Presentation, key: 'price' | 'listPrice' | 'essenceMl' | 'promoBuy' | 'promoPay') =>
    (drafts[p.id]?.[key] ?? p[key] ?? '') as number | string;
  const setDraft = (id: string, key: string, value: unknown) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  if (accessError) {
    return (
      <AuthLayout storeName="Perfumería">
        <div className="max-w-xl mx-auto p-8 text-center text-text-secondary">
          <Droplets className="w-12 h-12 mx-auto mb-3 text-primary" />
          <p className="font-semibold text-text-main dark:text-text-light">{accessError}</p>
          <p className="text-sm mt-1">Cambia el rubro de la tienda a Perfumería para usar este módulo.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout storeName="Perfumería">
      <Toaster position="top-right" richColors />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main dark:text-text-light">Perfumería</h1>
            <p className="text-sm text-text-secondary">
              Catálogo de esta sede · {fragranceCount ?? '…'} fragancias. El stock de esencias (ml) y envases se ajusta en{' '}
              <Link href="/inventory" className="text-primary underline">Inventario</Link>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={publishInCatalog}
              className="inline-flex items-center gap-2 rounded-xl border border-border-light dark:border-border-dark px-4 py-2 text-sm font-medium hover:border-primary"
              title="Marca todas las fragancias activas para el catálogo web; luego publica en Configuración → Catálogo Web"
            >
              <Globe className="w-4 h-4" /> Mostrar fragancias en el catálogo web
            </button>
            <a href="/api/perfumery/export" className="inline-flex items-center gap-2 rounded-xl border border-border-light dark:border-border-dark px-4 py-2 text-sm font-medium hover:border-primary">
              <Download className="w-4 h-4" /> Exportar catálogo para otra sede
            </a>
          </div>
        </div>

        <section className={card}>
          <h2 className="font-semibold text-text-main dark:text-text-light mb-1 flex items-center gap-2"><Upload className="w-4 h-4" /> Importar catálogo</h2>
          <p className="text-xs text-text-secondary mb-4">
            JSON exportado de otra sede o del catálogo web, o CSV con columnas: codigo, perfume, marca, genero, familia, aromas,
            temporadas, ocasiones, olor, stock_ml, costo_ml. Las fragancias que ya existen no cambian su stock.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-text-secondary">Archivo (.json o .csv)</span>
              <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => readFile(e.target.files?.[0])} className="block mt-1 text-sm" />
              {file && <span className="text-xs text-primary">{file.name}: {file.count} fragancias</span>}
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useDefaults} onChange={(e) => setUseDefaults(e.target.checked)} />
                Crear presentaciones, extras y packs de referencia (relleno, 50/100 ml por color, Black Stone, Teens, feromonas, packs)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Actualizar datos de fragancias y presentaciones existentes
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col">
                  <span className="text-xs text-text-secondary">Stock inicial por fragancia (ml)</span>
                  <input value={stockMl} onChange={(e) => setStockMl(e.target.value)} inputMode="decimal" placeholder="vacío = sin control" className={`${inputClass} w-40`} />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-text-secondary">Stock inicial por envase</span>
                  <input value={containerStock} onChange={(e) => setContainerStock(e.target.value)} inputMode="numeric" placeholder="vacío = sin control" className={`${inputClass} w-40`} />
                </label>
              </div>
            </div>
          </div>
          {importErrors.length > 0 && (
            <ul className="mt-3 text-xs text-red-600 list-disc pl-5 max-h-32 overflow-y-auto">
              {importErrors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          <button
            onClick={runImport}
            disabled={importing || (!file && !useDefaults)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> {importing ? 'Importando…' : 'Importar en esta sede'}
          </button>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-text-main dark:text-text-light mb-1">Presentaciones</h2>
          <p className="text-xs text-text-secondary mb-4">
            Precio final del frasco con la fragancia. Los ml son los que se descuentan de la esencia; el envase se descuenta de su stock.
            Promo: lleva × paga por presentación en toda la venta (2x1, 3x2); déjala vacía para quitarla. Rellenos: la presentación que
            exige compra previa solo se vende a clientes que compraron una que habilita relleno (el dueño puede autorizar la excepción).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th className="py-2 pr-2">Presentación</th>
                  <th className="py-2 pr-2">ml</th>
                  <th className="py-2 pr-2">Precio</th>
                  <th className="py-2 pr-2">Precio lista</th>
                  <th className="py-2 pr-2">Envase (stock)</th>
                  <th className="py-2 pr-2" title="Lleva / paga">Promo</th>
                  <th className="py-2 pr-2">Rellenos</th>
                  <th className="py-2 pr-2">Activa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {presentations.map((p) => (
                  <tr key={p.id} className={`border-t border-border-light dark:border-border-dark ${p.active ? '' : 'opacity-50'}`}>
                    <td className="py-2 pr-2 font-medium text-text-main dark:text-text-light">
                      {p.name}{p.isRefill && <span className="ml-1 text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">relleno</span>}
                    </td>
                    <td className="py-2 pr-2"><input value={draftValue(p, 'essenceMl')} onChange={(e) => setDraft(p.id, 'essenceMl', e.target.value)} className={`${inputClass} w-20`} inputMode="decimal" /></td>
                    <td className="py-2 pr-2"><input value={draftValue(p, 'price')} onChange={(e) => setDraft(p.id, 'price', e.target.value)} className={`${inputClass} w-24`} inputMode="decimal" /></td>
                    <td className="py-2 pr-2"><input value={draftValue(p, 'listPrice')} onChange={(e) => setDraft(p.id, 'listPrice', e.target.value)} className={`${inputClass} w-24`} inputMode="decimal" placeholder="—" /></td>
                    <td className="py-2 pr-2 text-xs text-text-secondary">
                      {p.container ? `${p.container.name} (${p.container.stock ?? 'sin control'})` : '—'}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <input value={draftValue(p, 'promoBuy')} onChange={(e) => setDraft(p.id, 'promoBuy', e.target.value)} className={`${inputClass} w-10`} inputMode="numeric" placeholder="—" aria-label="Lleva" />
                      <span className="mx-0.5 text-text-secondary">x</span>
                      <input value={draftValue(p, 'promoPay')} onChange={(e) => setDraft(p.id, 'promoPay', e.target.value)} className={`${inputClass} w-10`} inputMode="numeric" placeholder="—" aria-label="Paga" />
                    </td>
                    <td className="py-2 pr-2 text-xs text-text-secondary space-y-0.5">
                      <label className="flex items-center gap-1" title="Solo clientes con compra previa de un frasco que habilita rellenos">
                        <input
                          type="checkbox"
                          checked={p.requiresPriorPurchase}
                          onChange={(e) => patch(p.id, { requiresPriorPurchase: e.target.checked }).catch((err) => toast.error(err.message))}
                        /> Exige compra previa
                      </label>
                      <label className="flex items-center gap-1" title="Comprar esta presentación habilita rellenos">
                        <input
                          type="checkbox"
                          checked={p.grantsRefill}
                          onChange={(e) => patch(p.id, { grantsRefill: e.target.checked }).catch((err) => toast.error(err.message))}
                        /> Habilita relleno
                      </label>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e) => patch(p.id, { active: e.target.checked }).catch((err) => toast.error(err.message))}
                        aria-label={`Activar ${p.name}`}
                      />
                    </td>
                    <td className="py-2">
                      {drafts[p.id] && (
                        <button onClick={() => saveDraft(p.id)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white">
                          <Save className="w-3.5 h-3.5" /> Guardar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {presentations.length === 0 && (
                  <tr><td colSpan={9} className="py-6 text-center text-text-secondary">Sin presentaciones. Importa las de referencia o crea una.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-light dark:border-border-dark pt-4">
            <label className="flex flex-col text-xs text-text-secondary">Nueva presentación
              <input value={newPresentation.name} onChange={(e) => setNewPresentation({ ...newPresentation, name: e.target.value })} placeholder="Ej. 30 ml Viaje" className={`${inputClass} w-44`} />
            </label>
            <label className="flex flex-col text-xs text-text-secondary">ml
              <input value={newPresentation.essenceMl} onChange={(e) => setNewPresentation({ ...newPresentation, essenceMl: e.target.value })} className={`${inputClass} w-20`} inputMode="decimal" />
            </label>
            <label className="flex flex-col text-xs text-text-secondary">Precio
              <input value={newPresentation.price} onChange={(e) => setNewPresentation({ ...newPresentation, price: e.target.value })} className={`${inputClass} w-24`} inputMode="decimal" />
            </label>
            <label className="flex items-center gap-1 text-xs text-text-secondary h-9">
              <input type="checkbox" checked={newPresentation.isRefill} onChange={(e) => setNewPresentation({ ...newPresentation, isRefill: e.target.checked })} /> Relleno
            </label>
            <button
              onClick={createPresentation}
              disabled={!newPresentation.name || !newPresentation.essenceMl || !newPresentation.price}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 h-9 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Crear
            </button>
          </div>
        </section>

        <ExtrasPacksSection reloadKey={reloadKey} />

        <ReportSection />
      </div>
    </AuthLayout>
  );
}
