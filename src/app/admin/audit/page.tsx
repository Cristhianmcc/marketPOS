'use client';

import React, { useState, useEffect } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { toast, Toaster } from 'sonner';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

interface AuditLog {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  severity: 'INFO' | 'WARN' | 'ERROR';
  ip: string | null;
  userAgent: string | null;
  meta: any;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  store: {
    id: string;
    name: string;
  } | null;
}

interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    limit: 25,
    offset: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Filtros
  const [store_id, setStoreId] = useState('');
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [pagination.offset]);

  const checkSuperAdmin = async () => {
    try {
      const res = await fetch('/api/auth/is-superadmin');
      if (res.ok) {
        const data = await res.json();
        setIsSuperAdmin(data.isSuperAdmin);
      }
    } catch (error) {
      console.error('Error checking superadmin:', error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      if (store_id) params.append('store_id', store_id);
      if (severity) params.append('severity', severity);
      if (action) params.append('action', action);
      if (entityType) params.append('entityType', entityType);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      
      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message || 'Error al cargar logs');
        return;
      }

      const data = await res.json();
      setLogs(data.data);
      setPagination(data.pagination);
    } catch (error) {
      toast.error('Error al cargar logs de auditoría');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPagination({ ...pagination, offset: 0 });
    fetchLogs();
  };

  const handleClearFilters = () => {
    setStoreId('');
    setSeverity('');
    setAction('');
    setEntityType('');
    setDateFrom('');
    setDateTo('');
    setPagination({ ...pagination, offset: 0 });
  };

  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      setPagination({
        ...pagination,
        offset: Math.max(0, pagination.offset - pagination.limit),
      });
    }
  };

  const handleNextPage = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination({
        ...pagination,
        offset: pagination.offset + pagination.limit,
      });
    }
  };

  const getSeverityBadge = (severity: string) => {
    const classes = {
      INFO: 'bg-blue-100 text-blue-800',
      WARN: 'bg-yellow-100 text-yellow-800',
      ERROR: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[severity as keyof typeof classes]}`}>
        {severity}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <AuthLayout>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => window.history.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Volver
              </button>
              <h1 className="text-3xl font-bold text-gray-900">Logs de Auditoría</h1>
            </div>
            <p className="text-gray-600">
              Historial completo de operaciones críticas del sistema
            </p>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Fecha desde */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              {/* Fecha hasta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              {/* Severidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severidad
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Todas</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>

              {/* Acción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Acción
                </label>
                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="Buscar acción..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              {/* Tipo de entidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Entidad
                </label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Todas</option>
                  <option value="SALE">VENTA</option>
                  <option value="SHIFT">TURNO</option>
                  <option value="RECEIVABLE">FIADO</option>
                  <option value="USER">USUARIO</option>
                  <option value="COUPON">CUPÓN</option>
                  <option value="PROMOTION">PROMOCIÓN</option>
                  <option value="PRODUCT">PRODUCTO</option>
                  <option value="STORE">TIENDA</option>
                  <option value="SYSTEM">SISTEMA</option>
                  <option value="RESTORE">RESTORE</option>
                </select>
              </div>

              {/* Store ID (solo SUPERADMIN) */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Store ID
                  </label>
                  <input
                    type="text"
                    value={store_id}
                    onChange={(e) => setStoreId(e.target.value)}
                    placeholder="Store ID..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              )}
            </div>

            {/* Botones de filtros */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleApplyFilters}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Search size={16} />
                Aplicar Filtros
              </button>
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                <X size={16} />
                Limpiar
              </button>
            </div>
          </div>

          {/* Tabla de logs */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                Cargando logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No se encontraron registros
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Usuario
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Acción
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Entidad
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Severidad
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          IP
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {logs.map((log) => (
                        <React.Fragment key={log.id}>
                          <tr
                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                            className="hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {formatDate(log.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {log.user ? (
                                <div>
                                  <div className="font-medium">{log.user.name}</div>
                                  <div className="text-xs text-gray-500">{log.user.email}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400">Sistema</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {log.action}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {log.entityType}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {getSeverityBadge(log.severity)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {log.ip || '-'}
                            </td>
                          </tr>
                          {expandedRow === log.id && (
                            <tr>
                              <td colSpan={6} className="px-4 py-4 bg-gray-50">
                                <div className="space-y-2">
                                  <div className="text-sm">
                                    <span className="font-medium">Entity ID:</span>{' '}
                                    {log.entityId || 'N/A'}
                                  </div>
                                  {log.store && (
                                    <div className="text-sm">
                                      <span className="font-medium">Tienda:</span>{' '}
                                      {log.store.name} ({log.store.id})
                                    </div>
                                  )}
                                  {log.userAgent && (
                                    <div className="text-sm">
                                      <span className="font-medium">User Agent:</span>{' '}
                                      <span className="text-gray-600 text-xs">{log.userAgent}</span>
                                    </div>
                                  )}
                                  {log.meta && (
                                    <div className="mt-2">
                                      <div className="font-medium text-sm mb-1">Metadata:</div>
                                      <pre className="bg-white border rounded p-2 text-xs overflow-x-auto max-h-64">
                                        {JSON.stringify(log.meta, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Mostrando {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} de {pagination.total} registros
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrevPage}
                      disabled={pagination.offset === 0}
                      className="px-3 py-1 border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft size={16} />
                      Anterior
                    </button>
                    <button
                      onClick={handleNextPage}
                      disabled={pagination.offset + pagination.limit >= pagination.total}
                      className="px-3 py-1 border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      Siguiente
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
