'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { toast } from 'sonner';
import { ShiftWithUsers } from '@/domain/types';
import { Search, X } from 'lucide-react';

interface CurrentShiftData {
  shift: ShiftWithUsers | null;
}

export default function ShiftsPage() {
  const router = useRouter();
  const [currentShift, setCurrentShift] = useState<ShiftWithUsers | null>(null);
  const [history, setHistory] = useState<ShiftWithUsers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [cashSales, setCashSales] = useState(0);
  const [salesByMethod, setSalesByMethod] = useState<Record<string, { total: number; count: number }>>({});
  const [mixedInfo, setMixedInfo] = useState<{ count: number; total: number; details: string[]; splitTotals: Record<string, number> }>({ count: 0, total: 0, details: [], splitTotals: {} });
  const [profitData, setProfitData] = useState<{ totalSales: number; totalCost: number; profit: number } | null>(null);
  const [profitByProduct, setProfitByProduct] = useState<Array<{ productName: string; quantity: number; unitCost: number; unitPrice: number; totalCost: number; totalRevenue: number; profit: number }>>([]);

  // Historial: paginación y filtros
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchCurrentShift();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (currentShift) {
      // Calcular ventas en efectivo del turno actual
      fetchCashSales();
      
      // Auto-reload cada 5 segundos
      const interval = setInterval(() => {
        fetchCashSales();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [currentShift]);

  const fetchCurrentShift = async () => {
    try {
      const res = await fetch('/api/shifts/current');
      const data: CurrentShiftData = await res.json();
      setCurrentShift(data.shift);
    } catch (error) {
      toast.error('Error al cargar turno actual');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = useCallback(async (page = 1, from = '', to = '', search = '') => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '15');
      if (from) params.set('from', from);
      if (to) {
        // Incluir todo el día "to"
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        params.set('to', toEnd.toISOString());
      }
      if (search) params.set('search', search);

      const res = await fetch(`/api/shifts/history?${params.toString()}`);
      const data = await res.json();
      setHistory(data.shifts || []);
      setHistoryPage(data.page || 1);
      setHistoryTotalPages(data.totalPages || 1);
      setHistoryTotal(data.total || 0);
    } catch (error) {
      toast.error('Error al cargar historial');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchCashSales = async () => {
    if (!currentShift) return;
    
    try {
      // Usar endpoint que incluye ventas CASH + cobros de FIADO en efectivo
      // y desglose por método de pago (agregado server-side, sin paginación)
      const cashRes = await fetch(`/api/shifts/${currentShift.id}/cash-total`);
      if (cashRes.ok) {
        const cashData = await cashRes.json();
        setCashSales(cashData.cashTotal ?? 0);
        if (cashData.byMethod) {
          setSalesByMethod(cashData.byMethod);
        }
        if (cashData.mixedInfo) {
          setMixedInfo(cashData.mixedInfo);
        }
        if (cashData.profit) {
          setProfitData(cashData.profit);
        }
        if (cashData.profitByProduct) {
          setProfitByProduct(cashData.profitByProduct);
        }
      }
    } catch (error) {
      console.error('Error fetching cash sales:', error);
    }
  };

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    try {
      const res = await fetch('/api/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCash: amount }),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message);
        return;
      }

      toast.success('Turno abierto correctamente');
      setShowOpenModal(false);
      setOpeningCash('');
      fetchCurrentShift();
      fetchHistory();
    } catch (error) {
      toast.error('Error al abrir turno');
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;

    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    try {
      const res = await fetch(`/api/shifts/${currentShift.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCash: amount, notes }),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message);
        return;
      }

      toast.success('Turno cerrado correctamente');
      setShowCloseModal(false);
      setClosingCash('');
      setNotes('');
      fetchCurrentShift();
      fetchHistory();
    } catch (error) {
      toast.error('Error al cerrar turno');
    }
  };

  if (loading) {
    return (
      <AuthLayout storeName="Turnos / Caja">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthLayout>
    );
  }

  const expectedCash = currentShift ? currentShift.openingCash + cashSales : 0;

  return (
    <AuthLayout storeName="Turnos / Caja">
      <div className="space-y-6">
        {/* Estado actual */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Estado Actual</h2>

          {!currentShift ? (
            <div className="text-center py-12">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-6">No hay turno abierto</p>
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium transition-colors"
                >
                  Abrir Turno
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumen principal: Total Ventas + Efectivo en Caja */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50/40 p-6 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600 font-medium mb-1">Total Ventas del Turno</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(Object.values(salesByMethod).reduce((sum, d) => sum + d.total, 0))}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Todos los métodos de pago</p>
                </div>
                <div className="bg-yellow-50/40 p-6 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-700 font-medium mb-1">Efectivo en Caja</p>
                  <p className="text-2xl font-bold text-gray-900">{formatMoney(expectedCash)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Apertura ({formatMoney(currentShift.openingCash)}) + Efectivo ({formatMoney(cashSales)})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50/30 p-5 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-500 mb-2">Hora de apertura</p>
                  <p className="text-base font-semibold text-gray-900" suppressHydrationWarning>
                    {new Date(currentShift.openedAt).toLocaleString('es-PE')}
                  </p>
                </div>
                <div className="bg-green-50/30 p-5 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-500 mb-2">Caja inicial</p>
                  <p className="text-base font-semibold text-gray-900">{formatMoney(currentShift.openingCash)}</p>
                </div>
                <div className="bg-purple-50/30 p-5 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-500 mb-2">Ventas en efectivo</p>
                  <p className="text-base font-semibold text-gray-900">{formatMoney(cashSales)}</p>
                </div>
              </div>

              {/* Desglose por método de pago */}
              {Object.keys(salesByMethod).length > 0 && (
                <div className="border border-gray-200 rounded-lg p-5">
                  <p className="text-sm font-medium text-gray-700 mb-4">Ventas por Método de Pago</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(salesByMethod).map(([method, data]) => (
                      <div key={method} className="bg-gray-50/50 p-4 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">
                          {method === 'CASH' ? 'Efectivo' :
                           method === 'YAPE' ? 'Yape' :
                           method === 'PLIN' ? 'Plin' :
                           method === 'CARD' ? 'Tarjeta' : 'Fiado'}
                        </p>
                        <p className="text-base font-bold text-gray-900">{formatMoney(data.total)}</p>
                        <p className="text-xs text-gray-500">{data.count} ticket{data.count !== 1 ? 's' : ''}</p>
                      </div>
                    ))}
                    {mixedInfo.count > 0 && (
                      <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Mixto</p>
                        <p className="text-base font-bold text-gray-900">{formatMoney(mixedInfo.total)}</p>
                        <p className="text-xs text-gray-500 mb-2">{mixedInfo.count} ticket{mixedInfo.count !== 1 ? 's' : ''}</p>
                        {Object.keys(mixedInfo.splitTotals).length > 0 && (
                          <div className="space-y-1 border-t border-indigo-100 pt-2">
                            {Object.entries(mixedInfo.splitTotals)
                              .sort((a, b) => b[1] - a[1])
                              .map(([method, amount]) => (
                                <div key={method} className="flex justify-between text-xs">
                                  <span className="text-indigo-500">{method}</span>
                                  <span className="font-medium text-gray-700">{formatMoney(amount)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">Incluido en totales</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rentabilidad del turno - Dashboard profesional */}
              {profitData && profitData.totalCost > 0 && (
                <div className="border border-emerald-200 rounded-lg bg-white overflow-hidden">
                  {/* Header con ganancia principal */}
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-emerald-100 text-xs font-medium uppercase tracking-wide">Ganancia del Turno</p>
                        <p className={`text-2xl font-bold mt-0.5 ${profitData.profit < 0 ? 'text-red-300' : ''}`}>{formatMoney(profitData.profit)}</p>
                      </div>
                      {profitData.totalSales > 0 && (
                        <div className="text-right">
                          <p className="text-emerald-100 text-xs">Margen</p>
                          <p className="text-xl font-bold">{((profitData.profit / profitData.totalSales) * 100).toFixed(1)}%</p>
                        </div>
                      )}
                    </div>
                    {/* Barra de margen visual */}
                    {profitData.totalSales > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-emerald-200 mb-1">
                          <span>Costo {formatMoney(profitData.totalCost)}</span>
                          <span>Venta {formatMoney(profitData.totalSales)}</span>
                        </div>
                        <div className="h-2 bg-emerald-900/30 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-300 rounded-full" style={{ width: `${Math.min(100, (profitData.totalCost / profitData.totalSales) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desglose por producto */}
                  {profitByProduct.length > 0 && (
                    <div className="p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Desglose por producto</p>
                      <div className="max-h-72 overflow-y-auto space-y-2">
                        {profitByProduct.map((p, i) => {
                          const margin = p.totalRevenue > 0 ? (p.profit / p.totalRevenue) * 100 : 0;
                          const maxProfit = Math.max(...profitByProduct.map(x => Math.abs(x.profit)));
                          const barW = maxProfit > 0 ? (Math.abs(p.profit) / maxProfit) * 100 : 0;
                          return (
                            <div key={i} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate" title={p.productName}>{p.productName}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {p.quantity} {p.quantity === 1 ? 'unidad' : 'unidades'} · Costo unit. {formatMoney(p.unitCost)} · Venta unit. {formatMoney(p.unitPrice)}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className={`text-sm font-bold ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(p.profit)}</p>
                                  <p className={`text-xs ${margin >= 30 ? 'text-emerald-500' : margin >= 15 ? 'text-amber-500' : 'text-red-500'}`}>{margin.toFixed(1)}%</p>
                                </div>
                              </div>
                              {/* Barra de ganancia */}
                              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${p.profit >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${barW}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setShowCloseModal(true)}
                className="w-full px-5 py-2.5 bg-white text-gray-700 border-2 border-primary rounded-lg hover:bg-primary hover:text-white font-medium transition-colors"
              >
                Cerrar Turno
              </button>
            </div>
          )}
        </div>

        {/* Historial */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Historial de Turnos</h2>
            {historyTotal > 0 && (
              <span className="text-sm text-gray-500">{historyTotal} turno{historyTotal !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cajero..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setHistoryPage(1); fetchHistory(1, historyFrom, historyTo, historySearch); } }}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {historySearch && (
                <button onClick={() => { setHistorySearch(''); setHistoryPage(1); fetchHistory(1, historyFrom, historyTo, ''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => { setHistoryPage(1); fetchHistory(1, historyFrom, historyTo, historySearch); }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Buscar
            </button>
            {(historyFrom || historyTo || historySearch) && (
              <button
                onClick={() => { setHistoryFrom(''); setHistoryTo(''); setHistorySearch(''); setHistoryPage(1); fetchHistory(1, '', '', ''); }}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-600">No hay turnos cerrados</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apertura</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cierre</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Caja inicial</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Esperado</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Caja final</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Diferencia</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Abierto por</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((shift) => {
                    const diff = shift.difference || 0;
                    const diffClass = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-600';

                    return (
                      <tr key={shift.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(shift.openedAt).toLocaleString('es-PE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {shift.closedAt
                            ? new Date(shift.closedAt).toLocaleString('es-PE', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{formatMoney(shift.openingCash)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatMoney(shift.expectedCash || 0)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatMoney(shift.closingCash || 0)}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${diffClass}`}>
                          {diff > 0 ? '+' : ''}
                          {formatMoney(diff)}
                        </td>
                        <td className="px-4 py-3 text-sm">{shift.openedBy.name}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => router.push(`/sales?turno=${shift.id}`)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                            >
                              Ver ventas
                            </button>
                            <button
                              onClick={() => {
                                const a = document.createElement('a');
                                a.href = `/api/reports/export/shifts?shiftId=${shift.id}`;
                                a.download = '';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-700 transition-colors"
                              title="Exportar turno a Excel"
                            >
                              Exportar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Página {historyPage} de {historyTotalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { const p = historyPage - 1; setHistoryPage(p); fetchHistory(p, historyFrom, historyTo, historySearch); }}
                    disabled={historyPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => { const p = historyPage + 1; setHistoryPage(p); fetchHistory(p, historyFrom, historyTo, historySearch); }}
                    disabled={historyPage >= historyTotalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
          )}
        </div>
      </div>

      {/* Modal abrir turno */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Abrir Turno</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Caja inicial (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowOpenModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenShift}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium transition-colors"
                >
                  Abrir Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cerrar turno */}
      {showCloseModal && currentShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Cerrar Turno</h3>

            <div className="bg-yellow-50/40 p-5 rounded-lg mb-5 border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Efectivo esperado</p>
              <p className="text-2xl font-bold text-gray-900">{formatMoney(expectedCash)}</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Caja final (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  rows={3}
                  placeholder="Ej: Faltaron S/ 5 por error en cambio"
                />
              </div>

              {closingCash && (
                <div className="bg-gray-50/50 p-5 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Diferencia</p>
                  <p className={`text-xl font-bold ${
                    parseFloat(closingCash) - expectedCash > 0
                      ? 'text-green-600'
                      : parseFloat(closingCash) - expectedCash < 0
                      ? 'text-red-600'
                      : 'text-gray-700'
                  }`}>
                    {parseFloat(closingCash) - expectedCash > 0 ? '+' : ''}
                    {formatMoney(parseFloat(closingCash) - expectedCash)}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowCloseModal(false);
                    setClosingCash('');
                    setNotes('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseShift}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors"
                >
                  Cerrar Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
