'use client';

/**
 * Perfumería en el POS: buscar la fragancia (código, perfume de referencia,
 * marca u olor), elegir la presentación (+ extras como feromonas) y agregarla
 * al carrito normal. En modo Packs se elige el pack, el color y N fragancias.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Droplets, Gift, Package, Search, X } from 'lucide-react';

export interface PerfumeFragrance {
  id: string;
  storeProductId: string;
  code: string;
  name: string;
  reference: string | null;
  referenceBrand: string | null;
  gender: string | null;
  family: string | null;
  scent: string | null;
  imageUrl: string | null;
  stockMl: number | null;
  minStockMl: number | null;
}

export interface PerfumePresentationOption {
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
  container: { storeProductId: string; name: string; stock: number | null; active: boolean } | null;
}

export interface PerfumeExtraOption {
  id: string;
  name: string;
  price: number;
  extraEssenceMl: number | null;
  productQty: number;
  product: { storeProductId: string; name: string; stock: number | null; active: boolean } | null;
}

export interface PerfumePackOption {
  id: string;
  name: string;
  essenceMl: number;
  fragranceCount: number;
  price: number;
  listPrice: number | null;
  gift: { storeProductId: string; name: string; stock: number | null; active: boolean } | null;
}

export interface PerfumePackSlot {
  fragrance: PerfumeFragrance;
  presentation: PerfumePresentationOption;
}

const GENDER_TABS = [
  { value: '', label: 'Todos' },
  { value: 'MUJER', label: 'Mujer' },
  { value: 'HOMBRE', label: 'Hombre' },
  { value: 'UNISEX', label: 'Unisex' },
];

const money = (value: number) => `S/ ${value.toFixed(2)}`;

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data as T;
}

export function PerfumeryPanel({
  onAdd,
  onAddPack,
  disabled,
  /** ml ya reservados en el carrito por esencia (para avisar antes de cobrar). */
  reservedMl,
  /** Texto de la barra de búsqueda principal del POS: si se pasa, el panel no muestra la suya. */
  externalQuery,
}: {
  onAdd: (fragrance: PerfumeFragrance, presentation: PerfumePresentationOption, extras: PerfumeExtraOption[]) => void;
  onAddPack: (pack: PerfumePackOption, slots: PerfumePackSlot[]) => void;
  disabled?: boolean;
  reservedMl: Record<string, number>;
  externalQuery?: string;
}) {
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState('');
  const [family, setFamily] = useState('');
  const [fragrances, setFragrances] = useState<PerfumeFragrance[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [presentations, setPresentations] = useState<PerfumePresentationOption[]>([]);
  const [extras, setExtras] = useState<PerfumeExtraOption[]>([]);
  const [packs, setPacks] = useState<PerfumePackOption[]>([]);
  const [selected, setSelected] = useState<PerfumeFragrance | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [mode, setMode] = useState<'single' | 'pack'>('single');
  const [pack, setPack] = useState<PerfumePackOption | null>(null);
  const [packColor, setPackColor] = useState<string>('');
  const [slots, setSlots] = useState<PerfumePackSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const useExternalSearch = externalQuery !== undefined;
  const searchTerm = (useExternalSearch ? externalQuery : query).trim();

  useEffect(() => {
    Promise.all([
      getJson<{ presentations: PerfumePresentationOption[] }>('/api/perfumery/presentations', 'No se pudieron cargar las presentaciones'),
      getJson<{ extras: PerfumeExtraOption[] }>('/api/perfumery/extras', 'No se pudieron cargar los extras'),
      getJson<{ packs: PerfumePackOption[] }>('/api/perfumery/packs', 'No se pudieron cargar los packs'),
    ])
      .then(([p, e, k]) => {
        setPresentations(p.presentations ?? []);
        setExtras(e.extras ?? []);
        setPacks(k.packs ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    const requestId = ++requestRef.current;
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    if (gender) params.set('gender', gender);
    if (family) params.set('family', family);
    setLoading(true);
    getJson<{ fragrances: PerfumeFragrance[]; families: string[] }>(`/api/perfumery/fragrances?${params}`, 'No se pudieron cargar las fragancias')
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setFragrances(data.fragrances ?? []);
        setFamilies(data.families ?? []);
        setError(null);
      })
      .catch((e: Error) => requestId === requestRef.current && setError(e.message))
      .finally(() => requestId === requestRef.current && setLoading(false));
  }, [searchTerm, gender, family]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  // Al cambiar el stock tras una venta, refresca la fragancia elegida.
  useEffect(() => {
    if (!selected) return;
    const fresh = fragrances.find((f) => f.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [fragrances, selected]);

  const slotMl = useMemo(() => {
    const map: Record<string, number> = {};
    for (const slot of slots) map[slot.fragrance.storeProductId] = (map[slot.fragrance.storeProductId] ?? 0) + slot.presentation.essenceMl;
    return map;
  }, [slots]);

  const available = (fragrance: PerfumeFragrance) =>
    fragrance.stockMl === null
      ? null
      : fragrance.stockMl - (reservedMl[fragrance.storeProductId] ?? 0) - (slotMl[fragrance.storeProductId] ?? 0);

  const usablePresentations = useMemo(
    () => presentations.filter((p) => !p.container || p.container.active),
    [presentations]
  );
  const activeExtras = useMemo(() => extras.filter((e) => !e.product || e.product.active), [extras]);
  const chosenExtras = activeExtras.filter((e) => selectedExtras.includes(e.id));
  const extrasMl = chosenExtras.reduce((sum, e) => sum + (e.extraEssenceMl ?? 0), 0);
  const extrasPrice = chosenExtras.reduce((sum, e) => sum + e.price, 0);

  const packColors = useMemo(
    () => (pack ? usablePresentations.filter((p) => !p.isRefill && p.essenceMl === pack.essenceMl) : []),
    [pack, usablePresentations]
  );

  const choosePack = (next: PerfumePackOption) => {
    setPack(next);
    setSlots([]);
    const colors = usablePresentations.filter((p) => !p.isRefill && p.essenceMl === next.essenceMl);
    setPackColor(colors[0]?.id ?? '');
  };

  const pickFragrance = (fragrance: PerfumeFragrance) => {
    if (mode === 'single') {
      if (selected?.id !== fragrance.id) setSelectedExtras([]);
      setSelected(fragrance);
      return;
    }
    if (!pack) return;
    const presentation = packColors.find((p) => p.id === packColor);
    if (!presentation || slots.length >= pack.fragranceCount) return;
    const left = available(fragrance);
    if (left !== null && left < presentation.essenceMl) {
      setError(`${fragrance.code}: no alcanza la esencia para otro frasco`);
      return;
    }
    setError(null);
    setSlots((prev) => [...prev, { fragrance, presentation }]);
  };

  const addPack = () => {
    if (!pack || slots.length !== pack.fragranceCount) return;
    onAddPack(pack, slots);
    setSlots([]);
  };

  const presentationBadges = (presentation: PerfumePresentationOption) => [
    presentation.requiresPriorPurchase ? 'Solo con compra previa' : null,
    presentation.promoBuy && presentation.promoPay ? `${presentation.promoBuy}x${presentation.promoPay}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-3 space-y-3">
        {packs.length > 0 && (
          <div className="flex gap-2">
            {(['single', 'pack'] as const).map((value) => (
              <button
                key={value}
                onClick={() => { setMode(value); setSlots([]); setSelected(null); }}
                className={`flex-1 h-9 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  mode === value ? 'bg-primary text-white' : 'bg-background-light dark:bg-background-dark text-text-secondary hover:text-primary'
                }`}
              >
                {value === 'single' ? <Droplets className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                {value === 'single' ? 'Frasco' : 'Packs'}
              </button>
            ))}
          </div>
        )}
        {/* Sin barra del POS (externalQuery undefined) el panel trae la suya. */}
        {!useExternalSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Código (F754), perfume, marca u olor…"
            className="w-full h-11 pl-10 pr-10 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-main dark:text-text-light focus:ring-2 focus:ring-primary outline-none"
            disabled={disabled}
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-label="Limpiar búsqueda">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {GENDER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setGender(tab.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                gender === tab.value ? 'bg-primary text-white' : 'bg-background-light dark:bg-background-dark text-text-secondary hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {families.length > 0 && (
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="ml-auto h-9 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-sm px-2 text-text-main dark:text-text-light"
              aria-label="Familia olfativa"
            >
              <option value="">Todas las familias</option>
              {families.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm p-3">{error}</div>}

      {mode === 'pack' && (
        <div className="bg-surface-light dark:bg-surface-dark border-2 border-primary rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {packs.map((option) => (
              <button
                key={option.id}
                onClick={() => choosePack(option)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  pack?.id === option.id ? 'border-primary bg-primary/5' : 'border-border-light dark:border-border-dark hover:border-primary'
                }`}
              >
                <p className="text-sm font-semibold text-text-main dark:text-text-light">{option.name}</p>
                <p className="text-base font-bold text-primary">{money(option.price)}</p>
                {option.gift && (
                  <p className="text-[11px] text-text-secondary flex items-center gap-1"><Gift className="w-3 h-3" /> {option.gift.name}</p>
                )}
              </button>
            ))}
          </div>
          {pack && (
            <>
              {packColors.length === 0 ? (
                <p className="text-sm text-red-600">No hay presentaciones de {pack.essenceMl} ml activas para este pack.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-secondary">Envase para el próximo frasco:</span>
                  {packColors.map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setPackColor(color.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        packColor === color.id ? 'bg-primary text-white' : 'bg-background-light dark:bg-background-dark text-text-secondary'
                      }`}
                    >
                      {color.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-sm text-text-secondary">
                Toca {pack.fragranceCount} fragancias de la lista ({slots.length}/{pack.fragranceCount}).
              </p>
              {slots.length > 0 && (
                <ul className="space-y-1">
                  {slots.map((slot, index) => (
                    <li key={`${slot.fragrance.id}-${index}`} className="flex items-center justify-between text-sm bg-background-light dark:bg-background-dark rounded-lg px-3 py-1.5">
                      <span className="min-w-0 truncate">
                        <b className="text-primary">{slot.fragrance.code}</b>
                        {' · '}
                        {[slot.fragrance.reference, slot.fragrance.referenceBrand].filter(Boolean).join(' · ') || slot.fragrance.name}
                        <span className="text-text-secondary"> — {slot.presentation.name}</span>
                      </span>
                      <button onClick={() => setSlots((prev) => prev.filter((_, i) => i !== index))} aria-label="Quitar" className="text-text-secondary hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={addPack}
                disabled={disabled || slots.length !== pack.fragranceCount}
                className="w-full h-11 rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
              >
                Agregar {pack.name} · {money(pack.price)}
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'single' && selected && (
        <div className="bg-surface-light dark:bg-surface-dark border-2 border-primary rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-primary">{selected.code}</p>
              <p className="font-semibold text-text-main dark:text-text-light">{selected.name}</p>
              <p className="text-xs text-text-secondary">
                {[selected.family, selected.scent].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {available(selected) === null ? 'Esencia sin control de stock' : `Esencia disponible: ${available(selected)} ml`}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-text-secondary hover:text-text-main" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
          {activeExtras.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {activeExtras.map((extra) => {
                const on = selectedExtras.includes(extra.id);
                const out = extra.product?.stock !== null && extra.product?.stock !== undefined && extra.product.stock < extra.productQty;
                return (
                  <button
                    key={extra.id}
                    disabled={out && !on}
                    onClick={() => setSelectedExtras((prev) => (on ? prev.filter((id) => id !== extra.id) : [...prev, extra.id]))}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 ${
                      on ? 'bg-primary text-white border-primary' : 'border-border-light dark:border-border-dark text-text-secondary hover:border-primary'
                    }`}
                    title={out ? 'Sin stock' : undefined}
                  >
                    + {extra.name} {money(extra.price)}
                  </button>
                );
              })}
            </div>
          )}
          {usablePresentations.length === 0 ? (
            <p className="text-sm text-text-secondary">No hay presentaciones. Créalas en Perfumería → Presentaciones.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {usablePresentations.map((presentation) => {
                const left = available(selected);
                const noEssence = left !== null && left < presentation.essenceMl + extrasMl;
                const noContainer = presentation.container?.stock !== null && presentation.container?.stock !== undefined && presentation.container.stock <= 0;
                const blocked = disabled || noEssence || noContainer;
                const badges = presentationBadges(presentation);
                return (
                  <button
                    key={presentation.id}
                    disabled={blocked}
                    onClick={() => {
                      onAdd(selected, presentation, chosenExtras);
                      // Los extras valen para este frasco, no para el siguiente.
                      setSelectedExtras([]);
                    }}
                    className="text-left rounded-xl border border-border-light dark:border-border-dark p-3 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={noEssence ? 'No alcanza la esencia' : noContainer ? 'Sin envases' : `Agregar ${presentation.name}`}
                  >
                    <p className="text-sm font-semibold text-text-main dark:text-text-light">{presentation.name}</p>
                    <p className="text-base font-bold text-primary">{money(presentation.price + extrasPrice)}</p>
                    {presentation.listPrice && presentation.listPrice > presentation.price && (
                      <p className="text-xs text-text-secondary line-through">{money(presentation.listPrice)}</p>
                    )}
                    <p className="text-[11px] text-text-secondary">
                      {presentation.isRefill ? 'Relleno · ' : ''}{presentation.essenceMl + extrasMl} ml
                      {noEssence ? ' · sin esencia' : noContainer ? ' · sin envase' : ''}
                    </p>
                    {badges && <p className="text-[11px] font-semibold text-amber-700">{badges}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && fragrances.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-secondary">Cargando fragancias…</div>
      ) : fragrances.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-secondary">
          {searchTerm || gender || family ? 'No hay fragancias con ese filtro.' : 'Aún no hay fragancias. Impórtalas en Perfumería.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {fragrances.map((fragrance) => {
            const left = available(fragrance);
            const low = left !== null && fragrance.minStockMl !== null && left <= fragrance.minStockMl;
            return (
              <button
                key={fragrance.id}
                onClick={() => pickFragrance(fragrance)}
                disabled={disabled || (mode === 'pack' && (!pack || slots.length >= (pack?.fragranceCount ?? 0)))}
                className={`text-left flex items-center gap-3 rounded-xl border p-2.5 transition-colors bg-surface-light dark:bg-surface-dark disabled:opacity-50 ${
                  selected?.id === fragrance.id && mode === 'single' ? 'border-primary' : 'border-border-light dark:border-border-dark hover:border-primary'
                }`}
              >
                {fragrance.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fragrance.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 bg-background-light" loading="lazy" />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Droplets className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary">{fragrance.code}</p>
                  <p className="text-sm font-medium text-text-main dark:text-text-light truncate">
                    {[fragrance.reference, fragrance.referenceBrand].filter(Boolean).join(' · ') || fragrance.name}
                  </p>
                  <p className={`text-[11px] ${low ? 'text-red-600 font-semibold' : 'text-text-secondary'}`}>
                    {left === null ? fragrance.family ?? '' : `${left} ml${low ? ' · reponer' : ''}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
