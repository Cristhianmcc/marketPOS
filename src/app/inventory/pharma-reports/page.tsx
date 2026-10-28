'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Toaster, toast } from 'sonner';
import { useFlags } from '@/hooks/useFlags';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Package,
  AlertTriangle,
  Clock,
  FlaskConical,
  Loader2,
  FileText,
  ShieldAlert,
} from 'lucide-react';

// ── tipos ──────────────────────────────────────────────────────────────────────

type ReportType = 'stock-by-batch' | 'expiring' | 'expired' | 'sales-by-lab' | 'sales-by-generic' | 'rx-sold';

interface StockByBatchRow {
  productName: string; commercialName: string | null; genericName: string | null;
  concentration: string | null; pharmaceuticalForm: string | null; presentation: string | null;
  laboratory: string | null; category: string; barcode: string | null;
  requiresPrescription: boolean; batchNumber: string; expiryDate: string;
  daysToExpiry: number; quantityAvailable: number; quantityInitial: number; unitCost: number | null;
}

interface ExpiringRow {
  productName: string; commercialName: string | null; genericName: string | null;
  concentration: string | null; laboratory: string | null; category: string;
  barcode: string | null; requiresPrescription: boolean;
  batchNumber: string; expiryDate: string; daysToExpiry: number; quantityAvailable: number;
}

interface ExpiredRow extends Omit<ExpiringRow, 'daysToExpiry'> {
  daysExpired: number;
}

interface SalesByLabRow {
  laboratory: string; totalQty: number; totalAmount: number; productCount: number;
}

interface SalesByGenericRow {
  productName: string; genericName: string | null; commercialName: string | null;
  concentration: string | null; laboratory: string | null; totalQty: number; totalAmount: number;
}

interface RxSoldRow {
  date: string; saleId: string; productId: string | null; cashierId: string | null;
  patientName: string | null; prescriptionNumber: string | null; observation: string | null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const REPORTS: { id: ReportType; label: string; icon: React.ReactNode; needsBatch?: boolean }[] = [
  { id: 'stock-by-batch', label: 'Stock por lote', icon: <Package className="h-4 w-4" />, needsBatch: true },
  { id: 'expiring', label: 'Próximos a vencer', icon: <Clock className="h-4 w-4" />, needsBatch: true },
  { id: 'expired', label: 'Vencidos', icon: <AlertTriangle className="h-4 w-4" />, needsBatch: true },
  { id: 'sales-by-lab', label: 'Ventas por laboratorio', icon: <FlaskConical className="h-4 w-4" /> },
  { id: 'sales-by-generic', label: 'Ventas por genérico', icon: <FileText className="h-4 w-4" /> },
  { id: 'rx-sold', label: 'Productos Rx vendidos', icon: <ShieldAlert className="h-4 w-4" /> },
];

// ── componente principal ───────────────────────────────────────────────────────

export default function PharmaReportsPage() {
  const router = useRouter();
  const { isOn: isFlagOn, isLoading: flagsLoading } = useFlags();
  const batchEnabled = isFlagOn('ENABLE_BATCH_EXPIRY');
  const pharmaEnabled = isFlagOn('ENABLE_PHARMA_FIELDS') || isFlagOn('ENABLE_MEDICINE_SEARCH');

  const [activeReport, setActiveReport] = useState<ReportType>('stock-by-batch');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentMeta = REPORTS.find((r) => r.id === activeReport)!;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = new URLSearchParams({ report: activeReport, from, to });
      const res = await fetch(`/api/reports/pharma?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Error al cargar reporte');
        return;
      }
      setData(json);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [activeReport, from, to]);

  useEffect(() => {
    if (!flagsLoading) fetchReport();
  }, [flagsLoading, activeReport, fetchReport]);

  const downloadCSV = () => {
    const params = new URLSearchParams({ report: activeReport, from, to, format: 'csv' });
    window.location.href = `/api/reports/pharma?${params}`;
    toast.success('Descargando CSV…');
  };

  // ── guard flag ───────────────────────────────────────────────────────────────
  if (!flagsLoading && !pharmaEnabled && !batchEnabled) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="mb-4 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700">Módulo farmacéutico no activo</h2>
          <p className="mt-1 text-sm text-gray-500">Activa los flags de farmacia para usar estos reportes.</p>
          <button
            onClick={() => router.push('/inventory')}
            className="mt-6 flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a inventario
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/inventory')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Reportes Farmacéuticos</h1>
              <p className="text-sm text-gray-500">Análisis de lotes, vencimientos, ventas y Rx</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={downloadCSV}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar de reportes */}
          <aside className="w-52 flex-shrink-0">
            <nav className="space-y-1">
              {REPORTS.map((r) => {
                const disabled = r.needsBatch && !batchEnabled;
                return (
                  <button
                    key={r.id}
                    onClick={() => !disabled && setActiveReport(r.id)}
                    disabled={disabled}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      activeReport === r.id
                        ? 'bg-primary/10 text-primary'
                        : disabled
                        ? 'cursor-not-allowed text-gray-300'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {r.icon}
                    {r.label}
                    {disabled && (
                      <span className="ml-auto rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-400">OFF</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Contenido principal */}
          <div className="min-w-0 flex-1">
            {/* Filtro de fechas (solo aplica a reportes de ventas / Rx) */}
            {['sales-by-lab', 'sales-by-generic', 'rx-sold'].includes(activeReport) && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border bg-white p-3">
                <span className="text-sm font-medium text-gray-700">Desde</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-sm font-medium text-gray-700">Hasta</span>
                <input
                  type="date"
                  value={to}
                  max={today()}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generando reporte…
              </div>
            )}

            {/* Tablas */}
            {!loading && data && (
              <>
                {/* ── Stock por lote ─────────────────────────────────────────── */}
                {activeReport === 'stock-by-batch' && (
                  <ReportTable
                    title={`Stock por lote — ${data.total} lotes`}
                    headers={['Producto', 'Genérico', 'Concentración', 'Lab.', 'Lote', 'Vencimiento', 'Días', 'Disp.', 'Rx']}
                    rows={(data.rows as StockByBatchRow[]).map((r) => [
                      <span key="name"><span className="font-medium">{r.productName}</span>{r.commercialName && <span className="ml-1 text-xs text-gray-400">({r.commercialName})</span>}</span>,
                      r.genericName || '—',
                      r.concentration || '—',
                      r.laboratory || '—',
                      <code key="lot" className="text-xs">{r.batchNumber}</code>,
                      fmtDate(r.expiryDate),
                      <DaysChip key="days" days={r.daysToExpiry} />,
                      r.quantityAvailable,
                      r.requiresPrescription ? <RxBadge key="rx" /> : '—',
                    ])}
                  />
                )}

                {/* ── Próximos a vencer ─────────────────────────────────────── */}
                {activeReport === 'expiring' && (
                  <ReportTable
                    title={`Próximos a vencer — ${data.total} lotes (umbral: ${data.alertDays}d)`}
                    headers={['Producto', 'Genérico', 'Concentración', 'Lab.', 'Lote', 'Vencimiento', 'Días rest.', 'Disp.']}
                    rows={(data.rows as ExpiringRow[]).map((r) => [
                      r.productName,
                      r.genericName || '—',
                      r.concentration || '—',
                      r.laboratory || '—',
                      <code key="lot" className="text-xs">{r.batchNumber}</code>,
                      fmtDate(r.expiryDate),
                      <DaysChip key="days" days={r.daysToExpiry} />,
                      r.quantityAvailable,
                    ])}
                    rowClass={() => 'bg-amber-50'}
                  />
                )}

                {/* ── Vencidos ──────────────────────────────────────────────── */}
                {activeReport === 'expired' && (
                  <ReportTable
                    title={`Vencidos con stock — ${data.total} lotes`}
                    headers={['Producto', 'Genérico', 'Concentración', 'Lab.', 'Lote', 'Vencimiento', 'Días vencido', 'Disp.']}
                    rows={(data.rows as ExpiredRow[]).map((r) => [
                      r.productName,
                      r.genericName || '—',
                      r.concentration || '—',
                      r.laboratory || '—',
                      <code key="lot" className="text-xs">{r.batchNumber}</code>,
                      fmtDate(r.expiryDate),
                      <span key="exp" className="font-semibold text-red-600">{r.daysExpired}d</span>,
                      r.quantityAvailable,
                    ])}
                    rowClass={() => 'bg-red-50'}
                  />
                )}

                {/* ── Ventas por laboratorio ────────────────────────────────── */}
                {activeReport === 'sales-by-lab' && (
                  <ReportTable
                    title={`Ventas por laboratorio — ${data.total} laboratorios`}
                    headers={['Laboratorio', 'Productos distintos', 'Cantidad vendida', 'Monto total']}
                    rows={(data.rows as SalesByLabRow[]).map((r) => [
                      <span key="lab" className="font-medium">{r.laboratory}</span>,
                      r.productCount,
                      r.totalQty.toFixed(0),
                      <span key="amt" className="font-semibold text-green-700">{fmtMoney(r.totalAmount)}</span>,
                    ])}
                  />
                )}

                {/* ── Ventas por genérico ───────────────────────────────────── */}
                {activeReport === 'sales-by-generic' && (
                  <ReportTable
                    title={`Ventas por genérico/comercial — ${data.total} productos`}
                    headers={['Producto', 'Genérico (DCI)', 'Comercial', 'Concentración', 'Laboratorio', 'Qty', 'Monto']}
                    rows={(data.rows as SalesByGenericRow[]).map((r) => [
                      r.productName,
                      r.genericName || '—',
                      r.commercialName || '—',
                      r.concentration || '—',
                      r.laboratory || '—',
                      r.totalQty.toFixed(0),
                      <span key="amt" className="font-semibold text-green-700">{fmtMoney(r.totalAmount)}</span>,
                    ])}
                  />
                )}

                {/* ── Rx vendidos ───────────────────────────────────────────── */}
                {activeReport === 'rx-sold' && (
                  <ReportTable
                    title={`Productos Rx vendidos — ${data.total} registros`}
                    headers={['Fecha', 'ID Venta', 'Paciente', 'Nro Receta', 'Observación', 'Cajero']}
                    rows={(data.rows as RxSoldRow[]).map((r) => [
                      fmtDate(r.date),
                      <code key="sale" className="text-xs text-gray-600">{r.saleId?.slice(-8)}</code>,
                      r.patientName || '—',
                      r.prescriptionNumber || '—',
                      r.observation || '—',
                      <code key="cash" className="text-xs text-gray-600">{r.cashierId?.slice(-8)}</code>,
                    ])}
                  />
                )}

                {data.rows?.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16 text-center">
                    <Package className="mb-3 h-10 w-10 text-gray-300" />
                    <p className="font-medium text-gray-600">Sin datos para este reporte</p>
                    <p className="mt-1 text-sm text-gray-400">Ajusta el rango de fechas o verifica la configuración.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function ReportTable({
  title, headers, rows, rowClass,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
  rowClass?: (idx: number) => string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b bg-gray-50 px-4 py-3">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i} className={`transition-colors hover:bg-gray-50 ${rowClass ? rowClass(i) : ''}`}>
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2.5 text-gray-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DaysChip({ days }: { days: number }) {
  if (days <= 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Vencido</span>;
  if (days <= 30) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{days}d</span>;
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">{days}d</span>;
}

function RxBadge() {
  return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">Rx</span>;
}
