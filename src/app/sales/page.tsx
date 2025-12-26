'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { Search, Printer } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Sale {
  id: string;
  saleNumber: string;
  subtotal: number;
  tax: number;
  discountTotal: number;
  promotionsTotal?: number;
  couponCode?: string | null;
  couponDiscount?: number;
  total: number;
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD';
  createdAt: string;
  printedAt: string | null;
  user: {
    name: string;
  };
}

export default function SalesPage() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    loadUserInfo();
    fetchSales();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user.role);
        setUserId(data.user.id);
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const res = await fetch(`/api/sales?${params.toString()}`);
      const data = await res.json();
      setSales(data.sales || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSales();
  };

  const canCancelSale = (sale: Sale): boolean => {
    // Venta ya anulada
    if (sale.total === 0 && sale.subtotal === 0) return false;

    // OWNER puede anular cualquiera
    if (userRole === 'OWNER') return true;

    // CASHIER solo su último ticket
    if (userRole === 'CASHIER') {
      const userSales = sales.filter(s => s.total > 0);
      const sortedSales = userSales.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return sortedSales.length > 0 && sortedSales[0].id === sale.id;
    }

    return false;
  };

  const handleCancelClick = (sale: Sale) => {
    setSelectedSale(sale);
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!selectedSale) return;

    setCancelling(selectedSale.id);
    setShowCancelModal(false);

    try {
      const res = await fetch(`/api/sales/${selectedSale.id}/cancel`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Error al anular venta');
        return;
      }

      toast.success('Venta anulada correctamente');
      fetchSales();
    } catch (error) {
      toast.error('Error de red al anular venta');
    } finally {
      setCancelling(null);
      setSelectedSale(null);
    }
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setSelectedSale(null);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: 'Efectivo',
      YAPE: 'Yape',
      PLIN: 'Plin',
      CARD: 'Tarjeta',
    };
    return labels[method] || method;
  };

  return (
    <AuthLayout storeName="Historial de Ventas">
      <div className="container mx-auto px-4 py-6">
        {/* Modal de confirmación */}
        {showCancelModal && selectedSale && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Confirmar Anulación</h2>
              <p className="text-gray-600 mb-6">
                ¿Seguro que deseas anular el ticket {selectedSale.saleNumber}?
                <br />
                <strong>Esta acción no se puede deshacer.</strong>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmCancel}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Anular Venta
                </button>
                <button
                  onClick={closeCancelModal}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          {/* Filters */}
          <div className="p-6 border-b border-gray-200">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search by sale number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buscar por N° de Ticket
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ej: V-001"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {/* From date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* To date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Buscar
                </button>
                {(searchQuery || fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFromDate('');
                      setToDate('');
                      setTimeout(fetchSales, 0);
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Sales table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : sales.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No se encontraron ventas
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      N° Ticket
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Promociones
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Descuentos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Cupón
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Pago
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cajero
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sales.map((sale) => {
                    const isAnulada = sale.total === 0 && sale.subtotal === 0;
                    return (
                    <tr key={sale.id} className={`hover:bg-gray-50 ${isAnulada ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {sale.saleNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(sale.createdAt).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-blue-600">
                        {sale.promotionsTotal && sale.promotionsTotal > 0 ? (
                          <span>-{formatMoney(sale.promotionsTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-orange-600">
                        {sale.discountTotal > 0 ? (
                          <span>-{formatMoney(sale.discountTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        {sale.couponCode && sale.couponDiscount && sale.couponDiscount > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-green-700 font-medium">-{formatMoney(sale.couponDiscount)}</span>
                            <span className="text-xs text-gray-500">{sale.couponCode}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                        {isAnulada ? (
                          <span className="text-red-600 line-through">S/ 0.00</span>
                        ) : (
                          formatMoney(sale.total)
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {sale.user.name}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          isAnulada
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {isAnulada ? 'ANULADA' : 'ACTIVA'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => router.push(`/receipt/${sale.id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                          >
                            <Printer className="w-4 h-4" />
                            Ver
                          </button>
                          {canCancelSale(sale) && (
                            <button
                              onClick={() => handleCancelClick(sale)}
                              disabled={cancelling === sale.id}
                              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 transition-colors text-sm"
                            >
                              {cancelling === sale.id ? 'Anulando...' : 'Anular'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </AuthLayout>
  );
}
