// /admin/system - Panel de Observabilidad del Sistema
// ✅ MÓDULO 16.2: UI de Observabilidad (OWNER y SUPERADMIN)

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface HealthStatus {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  appVersion: string;
  environment: string;
  database: {
    status: string;
    latencyMs: number;
  };
  uptime?: number;
}

interface StoreStatus {
  store_id: string;
  storeName: string;
  storeStatus: string;
  currentShift: {
    open: boolean;
    openedAt?: string;
    openedBy?: string;
  };
  today: {
    salesCount: number;
    salesTotal: number;
    expectedCash?: number;
  };
}

interface ConfigSnapshot {
  store_id: string;
  featureFlags: Record<string, boolean>;
  operationalLimits: {
    maxDiscountPercent: number | null;
    maxManualDiscountAmount: number | null;
    maxSaleTotal: number | null;
    maxItemsPerSale: number | null;
    maxReceivableBalance: number | null;
  } | null;
}

interface BackupStatus {
  totalBackups: number;
  lastBackup: {
    timestamp: string | null;
    size: number | null;
  };
  canRestore: boolean;
}

export default function SystemPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [config, setConfig] = useState<ConfigSnapshot | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSystemData();
    // Recargar health cada 30 segundos
    const interval = setInterval(() => {
      loadHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadSystemData() {
    setLoading(true);
    try {
      await Promise.all([
        loadHealth(),
        loadStoreStatus(),
        loadConfig(),
        loadBackups(),
      ]);
    } catch (error) {
      console.error('Error loading system data:', error);
      toast.error('Error al cargar datos del sistema');
    } finally {
      setLoading(false);
    }
  }

  async function loadHealth() {
    const res = await fetch('/api/system/health');
    if (res.ok) {
      const data = await res.json();
      setHealth(data);
    }
  }

  async function loadStoreStatus() {
    const res = await fetch('/api/system/store-status');
    if (res.ok) {
      const data = await res.json();
      setStoreStatus(data);
    }
  }

  async function loadConfig() {
    const res = await fetch('/api/system/config-snapshot');
    if (res.ok) {
      const data = await res.json();
      setConfig(data);
    }
  }

  async function loadBackups() {
    const res = await fetch('/api/system/backups/status');
    if (res.ok) {
      const data = await res.json();
      setBackups(data);
    }
  }

  async function handleExportDiagnostic() {
    if (exporting) return;
    
    setExporting(true);
    try {
      const res = await fetch('/api/system/diagnostic/export');
      
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 403) {
          toast.error('Solo SUPERADMIN puede exportar diagnóstico');
        } else {
          toast.error(data.message || 'Error al exportar');
        }
        return;
      }

      // Descargar archivo ZIP
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Obtener nombre del archivo del header Content-Disposition
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'diagnostic-export.zip';
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Diagnóstico exportado correctamente');
    } catch (error) {
      console.error('Error exporting diagnostic:', error);
      toast.error('Error al exportar diagnóstico');
    } finally {
      setExporting(false);
    }
  }

  function getHealthColor(status?: string) {
    if (!status) return 'bg-gray-400';
    if (status === 'OK') return 'bg-green-500';
    if (status === 'DEGRADED') return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function formatUptime(seconds?: number) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatCurrency(amount?: number | null) {
    if (amount === null || amount === undefined) return 'N/A';
    return `$${amount.toFixed(2)}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="text-gray-600">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🔍 Observabilidad del Sistema
            </h1>
            <p className="text-sm text-gray-600">
              Monitoreo en tiempo real del estado operativo
            </p>
          </div>
          <button
            onClick={handleExportDiagnostic}
            disabled={exporting}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exportando...' : '📦 Exportar Diagnóstico'}
          </button>
        </div>

        {/* Health Status Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Estado del Sistema
            </h2>
            <div className={`w-4 h-4 rounded-full ${getHealthColor(health?.status)}`}></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Estado</p>
              <p className="text-lg font-semibold text-gray-900">
                {health?.status || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Base de Datos</p>
              <p className="text-lg font-semibold text-gray-900">
                {health?.database.status || 'N/A'}
              </p>
              <p className="text-xs text-gray-500">
                {health?.database.latencyMs}ms
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Uptime</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatUptime(health?.uptime)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Versión</p>
              <p className="text-lg font-semibold text-gray-900">
                {health?.appVersion || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Store Status Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Estado de la Tienda
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Tienda</p>
              <p className="text-lg font-semibold text-gray-900">
                {storeStatus?.storeName || 'N/A'}
              </p>
              <p className="text-xs text-gray-500">
                {storeStatus?.storeStatus}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Turno</p>
              <p className="text-lg font-semibold text-gray-900">
                {storeStatus?.currentShift.open ? '🟢 Abierto' : '🔴 Cerrado'}
              </p>
              {storeStatus?.currentShift.open && (
                <p className="text-xs text-gray-500">
                  {storeStatus.currentShift.openedBy}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Ventas Hoy</p>
              <p className="text-lg font-semibold text-gray-900">
                {storeStatus?.today.salesCount || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Hoy</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(storeStatus?.today.salesTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Config Snapshot Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Configuración Activa
          </h2>
          
          {/* Feature Flags */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Feature Flags
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {config?.featureFlags && Object.entries(config.featureFlags).map(([key, enabled]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className={enabled ? 'text-green-600' : 'text-gray-400'}>
                    {enabled ? '✓' : '✗'}
                  </span>
                  <span className="text-gray-700">{key}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Limits */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Límites Operativos
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-600">Descuento Máx.</p>
                <p className="text-sm font-semibold text-gray-900">
                  {config?.operationalLimits?.maxDiscountPercent !== null
                    ? `${config?.operationalLimits?.maxDiscountPercent}%`
                    : 'Sin límite'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Venta Máx.</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(config?.operationalLimits?.maxSaleTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Items Máx.</p>
                <p className="text-sm font-semibold text-gray-900">
                  {config?.operationalLimits?.maxItemsPerSale || 'Sin límite'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Backups Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Estado de Backups
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Backups</p>
              <p className="text-lg font-semibold text-gray-900">
                {backups?.totalBackups || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Último Backup</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(backups?.lastBackup.timestamp)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Puede Restaurar</p>
              <p className="text-lg font-semibold text-gray-900">
                {backups?.canRestore ? '✅ Sí' : '❌ No'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            ← Volver al Panel
          </button>
          <button
            onClick={loadSystemData}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            🔄 Refrescar
          </button>
        </div>
      </div>
    </div>
  );
}
