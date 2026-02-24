'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HardDrive,
  RotateCcw,
  Clock,
  FileArchive,
} from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

interface CloudBackupItem {
  id: string;
  storeId: string;
  storeName: string;
  createdAt: string;
  exportedAt: string;
  version: string;
  appVersion: string;
  sizeBytes: number;
  sizeMb: number;
  sha256: string;
  status: 'UPLOADING' | 'AVAILABLE' | 'DELETED' | 'FAILED';
  notes?: string;
}

interface CloudSyncStats {
  pending: number;
  failed: number;
  done: number;
  syncing: boolean;
}

interface CloudSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// Detectar si estamos en Electron
const isDesktop = typeof window !== 'undefined' && (window as any).desktop?.isDesktop;

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function CloudBackupsTab() {
  const [loading, setLoading] = useState(true);
  const [backups, setBackups] = useState<CloudBackupItem[]>([]);
  const [syncStats, setSyncStats] = useState<CloudSyncStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadBackups = useCallback(async (storeId?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      params.set('limit', '50');

      const response = await fetch(`/api/cloud-backups?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Error al cargar backups');
      }

      const data = await response.json();
      setBackups(data.backups || []);

      // Extraer stores únicos para el filtro
      const uniqueStores = new Map<string, string>();
      data.backups?.forEach((b: CloudBackupItem) => {
        uniqueStores.set(b.storeId, b.storeName);
      });
      setStores(Array.from(uniqueStores.entries()).map(([id, name]) => ({ id, name })));
    } catch (error) {
      console.error('Error loading cloud backups:', error);
      toast.error('Error al cargar backups de la nube');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSyncStats = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const stats = await (window as any).desktop.cloudSync.getStats();
      setSyncStats(stats);
    } catch (error) {
      console.error('Error loading sync stats:', error);
    }
  }, []);

  useEffect(() => {
    loadBackups();
    loadSyncStats();

    // Refresh cada 30 segundos
    const interval = setInterval(() => {
      loadSyncStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadBackups, loadSyncStats]);

  // --------------------------------------------------------------------------
  // ACCIONES
  // --------------------------------------------------------------------------

  const handleSync = async () => {
    if (!isDesktop) {
      toast.error('Solo disponible en la versión Desktop');
      return;
    }

    setSyncing(true);
    try {
      const result: CloudSyncResult = await (window as any).desktop.cloudSync.syncNow();
      
      if (result.success) {
        if (result.synced > 0) {
          toast.success(`Sincronizados ${result.synced} backups`);
        } else if (result.failed > 0) {
          toast.warning(`${result.failed} backups fallidos. Ver detalles en estado local.`);
        } else {
          toast.info('Todos los backups ya están sincronizados');
        }
      } else {
        toast.error(result.errors.join(', ') || 'Error en sincronización');
      }

      await loadBackups(selectedStoreId);
      await loadSyncStats();
    } catch (error: any) {
      toast.error(error.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleResetFailed = async () => {
    if (!isDesktop) return;

    try {
      const count = await (window as any).desktop.cloudSync.resetFailed();
      if (count > 0) {
        toast.success(`${count} archivos listos para reintentar`);
        await loadSyncStats();
      } else {
        toast.info('No hay archivos fallidos');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error');
    }
  };

  const handleDownload = async (backup: CloudBackupItem) => {
    setDownloadingId(backup.id);
    try {
      const response = await fetch('/api/cloud-backups/request-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: backup.id }),
      });

      if (!response.ok) {
        throw new Error('Error al obtener URL de descarga');
      }

      const data = await response.json();
      
      // Descargar archivo
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = `backup_${backup.storeName}_${backup.exportedAt.split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success('Descarga iniciada');
    } catch (error: any) {
      toast.error(error.message || 'Error al descargar');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (backup: CloudBackupItem) => {
    if (!confirm(`¿Eliminar backup de "${backup.storeName}" del ${new Date(backup.exportedAt).toLocaleDateString()}?`)) {
      return;
    }

    setDeletingId(backup.id);
    try {
      const response = await fetch(`/api/cloud-backups/${backup.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error al eliminar');
      }

      toast.success('Backup eliminado');
      await loadBackups(selectedStoreId);
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-PE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getStatusBadge = (status: CloudBackupItem['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Disponible</span>;
      case 'UPLOADING':
        return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Subiendo...</span>;
      case 'FAILED':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Error</span>;
      case 'DELETED':
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">Eliminado</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-600">Cargando backups de la nube...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Stats (Solo Desktop) */}
      {isDesktop && syncStats && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Estado Local</span>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="text-orange-600">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Pendientes: {syncStats.pending}
                </span>
                <span className="text-red-600">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Fallidos: {syncStats.failed}
                </span>
                <span className="text-green-600">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  Sincronizados: {syncStats.done}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {syncStats.failed > 0 && (
                <button
                  onClick={handleResetFailed}
                  className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reintentar Fallidos
                </button>
              )}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    Sincronizar Ahora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros y Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-gray-800">Backups en la Nube</h3>
          {stores.length > 0 && (
            <select
              value={selectedStoreId}
              onChange={(e) => {
                setSelectedStoreId(e.target.value);
                loadBackups(e.target.value);
              }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">Todas las tiendas</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => loadBackups(selectedStoreId)}
          className="text-gray-600 hover:text-gray-800 transition-colors"
          title="Actualizar lista"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Lista de Backups */}
      {backups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <CloudOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No hay backups en la nube</p>
          <p className="text-gray-500 text-sm mt-1">
            {isDesktop 
              ? 'Los backups locales se sincronizarán automáticamente cuando haya internet.'
              : 'Los backups se sincronizan desde la versión Desktop.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <FileArchive className="w-10 h-10 text-purple-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{backup.storeName}</span>
                      {getStatusBadge(backup.status)}
                    </div>
                    <div className="text-sm text-gray-500 mt-1 flex items-center gap-3">
                      <span>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatDate(backup.exportedAt)}
                      </span>
                      <span>{backup.sizeMb.toFixed(2)} MB</span>
                      <span className="font-mono text-xs text-gray-400">
                        {backup.sha256.substring(0, 8)}...
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {backup.status === 'AVAILABLE' && (
                    <>
                      <button
                        onClick={() => handleDownload(backup)}
                        disabled={downloadingId === backup.id}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Descargar"
                      >
                        {downloadingId === backup.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Download className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(backup)}
                        disabled={deletingId === backup.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deletingId === backup.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Acerca de Cloud Backups</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Los backups locales se sincronizan automáticamente cuando hay internet</li>
              <li>Se detectan duplicados por SHA-256 para evitar subir el mismo archivo</li>
              <li>Los backups se eliminan automáticamente después de {30} días (configurable)</li>
              <li>Para restaurar, descarga el backup y usa la opción "Restaurar a Nueva Tienda"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
