'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { toast } from 'sonner';
import { ShiftWithUsers } from '@/domain/types';

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

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/shifts/history');
      const data = await res.json();
      setHistory(data.shifts || []);
    } catch (error) {
      toast.error('Error al cargar historial');
    }
  };

  const fetchCashSales = async () => {
    if (!currentShift) return;
    
    try {
      // Consultar directamente las ventas del turno actual
      const salesRes = await fetch(`/api/sales?shiftId=${currentShift.id}`);
      if (salesRes.ok) {
        const salesData = await salesRes.json();
        console.log('Sales data:', salesData);
        const cashTotal = salesData.sales
          ?.filter((s: any) => s.paymentMethod === 'CASH' && s.total > 0) // Excluir anuladas
          .reduce((sum: number, s: any) => sum + parseFloat(s.total || 0), 0) || 0;
        console.log('Cash total calculated:', cashTotal);
        setCashSales(cashTotal);
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Estado Actual</h2>

          {!currentShift ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No hay turno abierto</p>
              <button
                onClick={() => setShowOpenModal(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Abrir Turno
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Hora de apertura</p>
                  <p className="text-lg font-semibold">
                    {new Date(currentShift.openedAt).toLocaleString('es-PE')}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Caja inicial</p>
                  <p className="text-lg font-semibold">{formatMoney(currentShift.openingCash)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Ventas en efectivo</p>
                  <p className="text-lg font-semibold">{formatMoney(cashSales)}</p>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Efectivo esperado</p>
                <p className="text-2xl font-bold text-yellow-800">{formatMoney(expectedCash)}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Caja inicial ({formatMoney(currentShift.openingCash)}) + Ventas ({formatMoney(cashSales)})
                </p>
              </div>

              <button
                onClick={() => setShowCloseModal(true)}
                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Cerrar Turno
              </button>
            </div>
          )}
        </div>

        {/* Historial */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Historial de Turnos</h2>

          {history.length === 0 ? (
            <p className="text-gray-600 text-center py-4">No hay turnos cerrados</p>
          ) : (
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal abrir turno */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Abrir Turno</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caja inicial (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowOpenModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenShift}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Cerrar Turno</h3>

            <div className="bg-yellow-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-gray-600">Efectivo esperado</p>
              <p className="text-2xl font-bold text-yellow-800">{formatMoney(expectedCash)}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caja final (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Ej: Faltaron S/ 5 por error en cambio"
                />
              </div>

              {closingCash && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Diferencia</p>
                  <p className={`text-xl font-bold ${
                    parseFloat(closingCash) - expectedCash > 0
                      ? 'text-green-600'
                      : parseFloat(closingCash) - expectedCash < 0
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {parseFloat(closingCash) - expectedCash > 0 ? '+' : ''}
                    {formatMoney(parseFloat(closingCash) - expectedCash)}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCloseModal(false);
                    setClosingCash('');
                    setNotes('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseShift}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
