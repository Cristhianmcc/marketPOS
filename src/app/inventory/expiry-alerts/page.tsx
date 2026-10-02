'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Package,
  Search,
  RefreshCw,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useFlags } from '@/hooks/useFlags';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type BatchStatus = 'VENCIDO' | 'POR_VENCER' | 'OK';

interface ExpiryBatch {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  daysToExpiry: number;
  quantityAvailable: number;
  unitCost: number | null;
  status: BatchStatus;
  productName: string;
  productContent: string | null;
  barcode: string | null;
  storeProductId: string;
}

interface Summary {
  expired: number;
  expiring30: number;
  expiring60: number;
  total: number;
  alertDays: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function StatusChip({ status, days }: { status: BatchStatus; days: number }) {
  if (status === 'VENCIDO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Vencido
      </span>
    );
  }
  if (status === 'POR_VENCER') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <Clock className="h-3 w-3" />
        {days}d restantes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
      <CheckCircle className="h-3 w-3" />
      OK
    </span>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ExpiryAlertsPage() {
  const router = useRouter();
  const { isOn: isFlagOn, isLoading: flagsLoading } = useFlags();
  const batchExpiry = isFlagOn('ENABLE_BATCH_EXPIRY');

  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [rangeFilter, setRangeFilter] = useState<'all' | '30' | '60' | '90'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'EXPIRED' | 'WARNING' | 'OK'>('all');
  const [search, setSearch] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (rangeFilter !== 'all') params.set('range', rangeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/expiry-alerts?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al cargar alertas');
        return;
      }
      setBatches(data.batches ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [rangeFilter, statusFilter]);

  useEffect(() => {
    if (!flagsLoading && batchExpiry) {
      loadAlerts();
    } else if (!flagsLoading && !batchExpiry) {
      setLoading(false);
    }
  }, [flagsLoading, batchExpiry, loadAlerts]);

  // Filtro de búsqueda local (por nombre de producto o número de lote)
  const filtered = batches.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.productName.toLowerCase().includes(q) ||
      b.batchNumber.toLowerCase().includes(q) ||
      (b.barcode ?? '').toLowerCase().includes(q)
    );
  });

  // ── Render: flag OFF ─────────────────────────────────────────────────────────
  if (!flagsLoading && !batchExpiry) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="mb-4 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700">Módulo de Lotes no activo</h2>
          <p className="mt-1 text-sm text-gray-500">
            Activa el flag <code className="rounded bg-gray-100 px-1">ENABLE_BATCH_EXPIRY</code> para usar alertas de vencimiento.
          </p>
          <button
            onClick={() => router.push('/inventory')}
            className="mt-6 flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a inventario
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mx-auto max-w-6xl px-4 py-6">
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
              <h1 className="text-xl font-bold text-gray-900">Alertas de Vencimiento</h1>
              <p className="text-sm text-gray-500">
                Panel de riesgo de lotes próximos a vencer o vencidos
              </p>
            </div>
          </div>
          <button
            onClick={loadAlerts}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Cards de resumen */}
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <button
              onClick={() => setStatusFilter('EXPIRED')}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                statusFilter === 'EXPIRED'
                  ? 'border-red-400 bg-red-50'
                  : 'border-transparent bg-white shadow-sm hover:border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold text-red-600">{summary.expired}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">Vencidos</p>
              <p className="text-xs text-gray-500">Con stock disponible</p>
            </button>

            <button
              onClick={() => { setStatusFilter('WARNING'); setRangeFilter('30'); }}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                statusFilter === 'WARNING' && rangeFilter === '30'
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-transparent bg-white shadow-sm hover:border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <span className="text-2xl font-bold text-amber-600">{summary.expiring30}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">Vencen pronto</p>
              <p className="text-xs text-gray-500">En los próximos 30 días</p>
            </button>

            <button
              onClick={() => { setStatusFilter('WARNING'); setRangeFilter('60'); }}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                statusFilter === 'WARNING' && rangeFilter === '60'
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-transparent bg-white shadow-sm hover:border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-400" />
                <span className="text-2xl font-bold text-orange-500">{summary.expiring60}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">Vencen en 60d</p>
              <p className="text-xs text-gray-500">Umbral configurado: {summary.alertDays}d</p>
            </button>

            <button
              onClick={() => { setStatusFilter('all'); setRangeFilter('all'); }}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                statusFilter === 'all' && rangeFilter === 'all'
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-transparent bg-white shadow-sm hover:border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold text-blue-600">{summary.total}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">Total lotes</p>
              <p className="text-xs text-gray-500">Activos con stock</p>
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por producto o lote..."
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Filtro estado */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Todos los estados</option>
            <option value="EXPIRED">Vencidos</option>
            <option value="WARNING">Por vencer</option>
            <option value="OK">OK</option>
          </select>

          {/* Filtro rango */}
          <select
            value={rangeFilter}
            onChange={(e) => setRangeFilter(e.target.value as typeof rangeFilter)}
            className="rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Cualquier fecha</option>
            <option value="30">Vencen en 30 días</option>
            <option value="60">Vencen en 60 días</option>
            <option value="90">Vencen en 90 días</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Cargando alertas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-white py-16 text-center">
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-400" />
            <p className="font-medium text-gray-700">Sin alertas de vencimiento</p>
            <p className="mt-1 text-sm text-gray-500">
              No hay lotes con el filtro aplicado.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Lote</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Días rest.</th>
                  <th className="px-4 py-3 text-right">Cant. disp.</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((b) => (
                  <tr
                    key={b.batchId}
                    className={`transition-colors ${
                      b.status === 'VENCIDO'
                        ? 'bg-red-50 hover:bg-red-100'
                        : b.status === 'POR_VENCER'
                        ? 'bg-amber-50 hover:bg-amber-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{b.productName}</p>
                      {b.productContent && (
                        <p className="text-xs text-gray-500">{b.productContent}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-800">{b.batchNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(b.expiryDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          b.daysToExpiry <= 0
                            ? 'text-red-600'
                            : b.daysToExpiry <= 30
                            ? 'text-amber-600'
                            : 'text-gray-700'
                        }`}
                      >
                        {b.daysToExpiry <= 0
                          ? `${Math.abs(b.daysToExpiry)}d vencido`
                          : `${b.daysToExpiry}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {b.quantityAvailable}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={b.status} days={b.daysToExpiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
              Mostrando {filtered.length} de {batches.length} lotes
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
