'use client';

/**
 * Perfumería (dueño): reporte de consumo y margen de la sede y lista de
 * reposición (esencias y envases), por rango de fechas.
 */
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';

interface Row { key: string; name: string; bottles: number; ml: number; revenue: number; cost: number | null; margin: number | null }
interface Report {
  days: number;
  totals: {
    sales: number; bottles: number; ml: number; revenue: number; cost: number | null; margin: number | null;
    refills: number; refillOverrides: number; promoBottles: number;
  };
  fragrances: Array<Row & { reference: string | null; stockMl: number | null }>;
  presentations: Row[];
  containers: Array<{ key: string; name: string; quantity: number }>;
  extras: Array<{ key: string; name: string; quantity: number; revenue: number }>;
  packs: Array<{ key: string; name: string; quantity: number; revenue: number }>;
  restock: {
    essences: Array<{ code: string; stockMl: number; minStockMl: number | null; mlPerDay: number; daysLeft: number | null }>;
    items: Array<{ name: string; stock: number; minStock: number }>;
  };
}

const card = 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-5';
const inputClass =
  'h-9 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 text-sm text-text-main dark:text-text-light';
const money = (value: number | null) => (value === null ? '—' : `S/ ${value.toFixed(2)}`);
const limaDate = (date: Date) => new Date(date.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

function Table({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-secondary">
            {head.map((h, i) => <th key={h} className={`py-1.5 pr-3 ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-border-light dark:border-border-dark">
              {row.map((cell, i) => (
                <td key={i} className={`py-1.5 pr-3 ${i > 0 ? 'text-right tabular-nums' : 'text-text-main dark:text-text-light'}`}>{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={head.length} className="py-3 text-center text-text-secondary">Sin datos.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ReportSection() {
  const [from, setFrom] = useState(() => limaDate(new Date(Date.now() - 29 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => limaDate(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/perfumery/report?from=${from}&to=${to}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el reporte');
      setReport(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const t = report?.totals;
  const stats: Array<[string, string]> = t
    ? [
        ['Ventas con perfume', String(t.sales)],
        ['Frascos', String(t.bottles)],
        ['Esencia usada', `${t.ml.toLocaleString('es-PE')} ml`],
        ['Ingresos', money(t.revenue)],
        ['Margen', t.margin === null ? 'Falta costo' : money(t.margin)],
        ['Rellenos', `${t.refills}${t.refillOverrides ? ` (${t.refillOverrides} autorizados)` : ''}`],
      ]
    : [];

  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="font-semibold text-text-main dark:text-text-light flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Consumo y reposición</h2>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-text-secondary">Desde
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-text-secondary">Hasta
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <button onClick={load} className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark" aria-label="Actualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {report && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-background-light dark:bg-background-dark p-3">
                <p className="text-[11px] text-text-secondary">{label}</p>
                <p className="text-base font-bold text-text-main dark:text-text-light">{value}</p>
              </div>
            ))}
          </div>

          {(report.restock.essences.length > 0 || report.restock.items.length > 0) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800 mb-2">Reponer</p>
              <Table
                head={['Esencia', 'Stock (ml)', 'Mínimo', 'ml/día', 'Días']}
                rows={report.restock.essences.map((r) => [r.code, r.stockMl, r.minStockMl ?? '—', r.mlPerDay, r.daysLeft ?? '—'])}
              />
              {report.restock.items.length > 0 && (
                <div className="mt-3">
                  <Table head={['Envase / accesorio', 'Stock', 'Mínimo']} rows={report.restock.items.map((r) => [r.name, r.stock, r.minStock])} />
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-text-main dark:text-text-light mb-1">Fragancias más vendidas</p>
            <Table
              head={['Fragancia', 'Frascos', 'ml', 'Ingresos', 'Margen', 'Stock ml']}
              rows={report.fragrances.slice(0, 30).map((r) => [
                `${r.name}${r.reference ? ` · ${r.reference}` : ''}`, r.bottles, r.ml, money(r.revenue), money(r.margin), r.stockMl ?? '—',
              ])}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <p className="text-sm font-semibold text-text-main dark:text-text-light mb-1">Por presentación</p>
              <Table
                head={['Presentación', 'Frascos', 'Ingresos', 'Margen']}
                rows={report.presentations.map((r) => [r.name, r.bottles, money(r.revenue), money(r.margin)])}
              />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-text-main dark:text-text-light mb-1">Envases usados</p>
                <Table head={['Envase', 'Unidades']} rows={report.containers.map((r) => [r.name, r.quantity])} />
              </div>
              {report.extras.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-text-main dark:text-text-light mb-1">Extras</p>
                  <Table head={['Extra', 'Unidades', 'Ingresos']} rows={report.extras.map((r) => [r.name, r.quantity, money(r.revenue)])} />
                </div>
              )}
              {report.packs.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-text-main dark:text-text-light mb-1">Packs</p>
                  <Table head={['Pack', 'Vendidos', 'Ingresos']} rows={report.packs.map((r) => [r.name, r.quantity, money(r.revenue)])} />
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-text-secondary">
            Margen = ingreso de la línea − costo de esencia, envase, extras y regalo al momento de la venta. Sin costo cargado se muestra “—”.
            {t && t.promoBottles > 0 ? ` ${t.promoBottles} frascos vendidos con promo 2x1/3x2.` : ''}
          </p>
        </div>
      )}
    </section>
  );
}
