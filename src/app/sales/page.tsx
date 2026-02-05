'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { Search, Printer } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import SunatStatusBadge, { SunatStatus } from '@/components/sunat/SunatStatusBadge'; // ✅ MÓDULO 18.5
import SunatActions from '@/components/sunat/SunatActions'; // ✅ MÓDULO 18.5

interface Sale {
  id: string;
  saleNumber: string;
  subtotal: number;
  tax: number;
  discountTotal: number;
  promotionsTotal?: number;
  categoryPromotionsTotal?: number;
  volumePromotionsTotal?: number; // ✅ Módulo 14.2-C1: Promociones por volumen
  nthPromotionsTotal?: number; // ✅ Módulo 14.2-C2: Promociones n-ésimo
  couponCode?: string | null;
  couponDiscount?: number;
  total: number;
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
  createdAt: string;
  printedAt: string | null;
  user: {
    name: string;
  };
}

// ✅ MÓDULO 18.5: Datos de documento electrónico SUNAT
interface ElectronicDocumentData {
  hasDocument: boolean;
  document?: {
    id: string;
    fullNumber: string;
    status: SunatStatus;
    sunatCode?: string | null;
    sunatMessage?: string | null;
    hasCdr: boolean;
    hasXml: boolean;
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
  
  // ✅ MÓDULO 18.5: Datos de documentos electrónicos SUNAT
  const [documentsData, setDocumentsData] = useState<Record<string, ElectronicDocumentData>>({});
  const [sunatEnabled, setSunatEnabled] = useState(false);

  useEffect(() => {
    loadUserInfo();
    checkSunatStatus(); // ✅ MÓDULO 18.5
    fetchSales();
  }, []);

  const checkSunatStatus = async () => {
    try {
      const res = await fetch('/api/sunat/settings/status');
      if (res.ok) {
        const data = await res.json();
        setSunatEnabled(data.enabled && data.configured);
      }
    } catch (error) {
      console.error('Error checking SUNAT status:', error);
    }
  };

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
      
      // ✅ MÓDULO 18.5: Cargar datos SUNAT para cada venta
      if (sunatEnabled && data.sales) {
        fetchDocumentsData(data.sales.map((s: Sale) => s.id));
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ MÓDULO 18.5: Obtener documentos electrónicos para múltiples ventas
  const fetchDocumentsData = async (saleIds: string[]) => {
    const results: Record<string, ElectronicDocumentData> = {};
    
    await Promise.all(
      saleIds.map(async (saleId) => {
        try {
          const res = await fetch(`/api/sunat/by-sale/${saleId}`);
          if (res.ok) {
            const data = await res.json();
            results[saleId] = data;
          }
        } catch (error) {
          console.error(`Error fetching document for sale ${saleId}:`, error);
        }
      })
    );
    
    setDocumentsData(results);
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
              <table className="w-full table-auto">
                <colgroup>
                  <col style={{width: '5%'}} /> {/* N° Ticket */}
                  <col style={{width: '8%'}} /> {/* Fecha */}
                  <col style={{width: '5%'}} /> {/* Promociones */}
                  <col style={{width: '5%'}} /> {/* Cat. Promos */}
                  <col style={{width: '5%'}} /> {/* Pack */}
                  <col style={{width: '5%'}} /> {/* N-ésimo */}
                  <col style={{width: '5%'}} /> {/* Descuentos */}
                  <col style={{width: '6%'}} /> {/* Cupón */}
                  <col style={{width: '7%'}} /> {/* Total */}
                  <col style={{width: '5%'}} /> {/* Pago */}
                  <col style={{width: '8%'}} /> {/* Cajero */}
                  <col style={{width: '5%'}} /> {/* Estado */}
                  {sunatEnabled && <col style={{width: '14%'}} />} {/* SUNAT */}
                  <col style={{width: sunatEnabled ? '17%' : '20%'}} /> {/* Acciones */}
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      N°
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fecha
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-blue-600 uppercase">
                      2x1
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase">
                      Categ
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-orange-600 uppercase">
                      Volumen
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-yellow-600 uppercase">
                      Lleva+
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Desc.
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-green-600 uppercase">
                      Cupón
                    </th>
                    <th className="px-2 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                      Total
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Pago
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cajero
                    </th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                    {sunatEnabled && (
                      <th className="px-2 py-3 text-center text-xs font-medium text-indigo-600 uppercase">
                        SUNAT
                      </th>
                    )}
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sales.map((sale) => {
                    const isAnulada = sale.total === 0 && sale.subtotal === 0;
                    return (
                    <tr key={sale.id} className={`hover:bg-gray-50 ${isAnulada ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-3 text-sm font-medium text-gray-900">
                        {sale.saleNumber}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600">
                        {new Date(sale.createdAt).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).replace(',', '')}
                      </td>
                      <td className="px-2 py-3 text-xs text-right text-blue-600">
                        {sale.promotionsTotal && sale.promotionsTotal > 0 ? (
                          <span>-{formatMoney(sale.promotionsTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-right text-purple-600 font-medium">
                        {sale.categoryPromotionsTotal && sale.categoryPromotionsTotal > 0 ? (
                          <span>-{formatMoney(sale.categoryPromotionsTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-right text-orange-600 font-medium">
                        {sale.volumePromotionsTotal && sale.volumePromotionsTotal > 0 ? (
                          <span>-{formatMoney(sale.volumePromotionsTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-right text-yellow-600 font-medium">
                        {sale.nthPromotionsTotal && sale.nthPromotionsTotal > 0 ? (
                          <span>-{formatMoney(sale.nthPromotionsTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-right text-gray-600">
                        {sale.discountTotal > 0 ? (
                          <span>-{formatMoney(sale.discountTotal)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-right">
                        {sale.couponCode && sale.couponDiscount && sale.couponDiscount > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-green-700 font-medium">-{formatMoney(sale.couponDiscount)}</span>
                            <span className="text-xs text-gray-500">{sale.couponCode}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-sm text-right font-semibold text-gray-900">
                        {isAnulada ? (
                          <span className="text-red-600 line-through">S/ 0.00</span>
                        ) : (
                          formatMoney(sale.total)
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600">
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600 truncate">
                        {sale.user.name}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          isAnulada
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {isAnulada ? 'ANULADA' : 'ACTIVA'}
                        </span>
                      </td>
                      
                      {/* ✅ MÓDULO 18.5: Columna SUNAT */}
                      {sunatEnabled && (
                        <td className="px-2 py-3">
                          {documentsData[sale.id]?.hasDocument && documentsData[sale.id].document ? (
                            <div className="flex flex-col items-center gap-1">
                              <SunatStatusBadge
                                status={documentsData[sale.id].document!.status}
                                sunatCode={documentsData[sale.id].document!.sunatCode}
                                sunatMessage={documentsData[sale.id].document!.sunatMessage}
                              />
                              <span className="text-xs text-gray-600">
                                {documentsData[sale.id].document!.fullNumber}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 text-center">
                              Sin comprobante
                            </div>
                          )}
                        </td>
                      )}
                      
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1.5">
                          {/* Acciones normales */}
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => router.push(`/receipt/${sale.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Ver
                            </button>
                            {canCancelSale(sale) && (
                              <button
                                onClick={() => handleCancelClick(sale)}
                                disabled={cancelling === sale.id}
                                className="px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 transition-colors text-xs whitespace-nowrap"
                              >
                                {cancelling === sale.id ? 'Anulando...' : 'Anular'}
                              </button>
                            )}
                          </div>
                          
                          {/* ✅ MÓDULO 18.5: Acciones SUNAT */}
                          {sunatEnabled && !isAnulada && (
                            <SunatActions
                              saleId={sale.id}
                              documentId={documentsData[sale.id]?.document?.id}
                              status={documentsData[sale.id]?.document?.status}
                              hasXml={documentsData[sale.id]?.document?.hasXml}
                              hasCdr={documentsData[sale.id]?.document?.hasCdr}
                              userRole={userRole}
                              paymentMethod={sale.paymentMethod}
                              onActionComplete={() => fetchDocumentsData([sale.id])}
                            />
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
