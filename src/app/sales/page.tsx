'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { Search, Printer } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import SunatStatusBadge, { SunatStatus } from '@/components/sunat/SunatStatusBadge'; // ✅ MÓDULO 18.5
import SunatActions from '@/components/sunat/SunatActions'; // ✅ MÓDULO 18.5

interface SaleItem {
  id: string;
  quantity: number;
  isService?: boolean;
  serviceName?: string | null;
  productName?: string | null;
  productContent?: string | null;
  storeProduct?: {
    product: {
      name: string;
    };
  } | null;
}

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
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO' | 'MIXED';
  paymentDetails?: { splits: { method: string; amount: number }[] } | null;
  createdAt: string;
  printedAt: string | null;
  items: SaleItem[];
  user: {
    name: string;
  };
  // ✅ MÓDULO PH4: Paciente/receptor
  patientName?: string | null;
  patientDni?: string | null;
}

// ✅ MÓDULO 18.5: Datos de documento electrónico SUNAT
interface ElectronicDocumentData {
  hasDocument: boolean;
  document?: {
    id: string;
    docType: 'FACTURA' | 'BOLETA';
    fullNumber: string;
    status: SunatStatus;
    sunatCode?: string | null;
    sunatMessage?: string | null;
    hasCdr: boolean;
    hasXml: boolean;
  };
  adjustments?: Array<{
    id: string;
    docType: 'NOTA_CREDITO' | 'NOTA_DEBITO';
    fullNumber: string;
    status: SunatStatus;
    total: number;
    sunatCode?: string | null;
    sunatMessage?: string | null;
    hasXml: boolean;
    hasCdr: boolean;
  }>;
}

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Cargando...</div>}>
      <SalesPageContent />
    </Suspense>
  );
}

function SalesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  // Inicializar directamente desde la URL para evitar condición de carrera
  const [shiftFilter] = useState<string | null>(() => searchParams.get('turno'));
  
  // ✅ MÓDULO 18.5: Datos de documentos electrónicos SUNAT
  const [documentsData, setDocumentsData] = useState<Record<string, ElectronicDocumentData>>({});
  const [sunatEnabled, setSunatEnabled] = useState(false);
  // ✅ MÓDULO PH4: Columna de paciente
  const [patientsEnabled, setPatientsEnabled] = useState(false);
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserInfo();
    checkSunatStatus(); // ✅ MÓDULO 18.5
    checkPatientsFlag(); // ✅ MÓDULO PH4
    fetchSales(1);
  }, []);

  useEffect(() => {
    fetchSales();
  }, [currentPage]);

  // La configuracion SUNAT y las ventas se cargan en paralelo. Si las ventas
  // llegan primero, consultar sus comprobantes cuando termine la configuracion.
  useEffect(() => {
    if (!sunatEnabled) {
      setDocumentsData({});
      return;
    }

    const saleIds = sales.map((sale) => sale.id);
    if (saleIds.length > 0) {
      void fetchDocumentsData(saleIds);
    }
  }, [sunatEnabled, sales]);

  // Actualizar documentos en proceso hasta recibir el resultado de SUNAT.
  useEffect(() => {
    if (!sunatEnabled || sales.length === 0) return;

    const pendingStatuses: SunatStatus[] = ['DRAFT', 'SIGNED', 'SENT'];
    const hasPendingDocument = Object.values(documentsData).some((entry) =>
      (entry.document ? pendingStatuses.includes(entry.document.status) : false) ||
      entry.adjustments?.some((adjustment) => pendingStatuses.includes(adjustment.status)) === true
    );

    if (!hasPendingDocument) return;

    const timer = window.setInterval(() => {
      void fetchDocumentsData(sales.map((sale) => sale.id));
    }, 2000);

    return () => window.clearInterval(timer);
  }, [sunatEnabled, sales, documentsData]);

  const checkPatientsFlag = async () => {
    try {
      const res = await fetch('/api/flags');
      if (res.ok) {
        const data = await res.json();
        setPatientsEnabled(data.flags?.ENABLE_PATIENTS === true);
      }
    } catch {
      // Si falla, no mostrar la columna
    }
  };

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

  const fetchSales = async (page = currentPage) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (shiftFilter) params.append('shiftId', shiftFilter);
      params.append('page', page.toString());
      params.append('limit', '20');

      const res = await fetch(`/api/sales?${params.toString()}`);
      const data = await res.json();
      setSales(data.sales || []);
      setTotalPages(data.totalPages || 1);
      setTotalSales(data.total || 0);
      
      // ✅ MÓDULO 18.5: Cargar datos SUNAT para cada venta
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
    setCurrentPage(1);
    fetchSales(1);
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

  const methodLabels: Record<string, string> = {
    CASH: 'Efectivo',
    YAPE: 'Yape',
    PLIN: 'Plin',
    CARD: 'Tarjeta',
    MIXED: 'Mixto',
    FIADO: 'Fiado',
  };

  const getPaymentMethodLabel = (method: string, paymentDetails?: { splits: { method: string; amount: number }[] } | null) => {
    if (method === 'MIXED' && paymentDetails?.splits?.length) {
      return paymentDetails.splits
        .map(s => methodLabels[s.method] || s.method)
        .join('/');
    }
    return methodLabels[method] || method;
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
          {/* Banner de filtro por turno */}
          {shiftFilter && (
            <div className="flex items-center justify-between px-6 py-3 bg-blue-50 border-b border-blue-200">
              <span className="text-sm text-blue-800 font-medium">
                📋 Mostrando ventas del turno seleccionado
              </span>
              <button
                onClick={() => {
                  router.replace('/sales');
                  router.refresh();
                }}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Ver todas las ventas
              </button>
            </div>
          )}
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
                      setCurrentPage(1);
                      setTimeout(() => fetchSales(1), 0);
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
              <>
              <table className="w-full table-auto">
                <colgroup>
                  <col style={{width: '4%'}} /> {/* N° Ticket */}
                  <col style={{width: '7%'}} /> {/* Fecha */}
                  <col style={{width: '18%'}} /> {/* Productos */}
                  <col style={{width: '4%'}} /> {/* Promociones */}
                  <col style={{width: '4%'}} /> {/* Cat. Promos */}
                  <col style={{width: '4%'}} /> {/* Pack */}
                  <col style={{width: '4%'}} /> {/* N-ésimo */}
                  <col style={{width: '4%'}} /> {/* Descuentos */}
                  <col style={{width: '5%'}} /> {/* Cupón */}
                  <col style={{width: '6%'}} /> {/* Total */}
                  <col style={{width: '5%'}} /> {/* Pago */}
                  <col style={{width: '7%'}} /> {/* Cajero */}
                  <col style={{width: '4%'}} /> {/* Estado */}
                  {patientsEnabled && <col style={{width: '8%'}} />} {/* Paciente */}
                  {sunatEnabled && <col style={{width: '12%'}} />} {/* SUNAT */}
                  <col style={{width: sunatEnabled ? '12%' : '14%'}} /> {/* Acciones */}
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      N°
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fecha
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Productos
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
                    {patientsEnabled && (
                      <th className="px-2 py-3 text-left text-xs font-medium text-teal-600 uppercase">
                        Paciente
                      </th>
                    )}
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
                      <td className="px-2 py-3 text-xs text-gray-700">
                        {sale.items && sale.items.length > 0 ? (() => {
                          const isExpanded = expandedSales.has(sale.id);
                          const visibleItems = isExpanded ? sale.items : sale.items.slice(0, 3);
                          const hiddenCount = sale.items.length - 3;
                          return (
                            <div>
                              <div className={`space-y-0.5 ${isExpanded && sale.items.length > 8 ? 'max-h-[200px] overflow-y-auto pr-1' : ''}`}>
                                {visibleItems.map((item) => {
                                  const isFreeItem = !item.storeProduct && !item.isService && !!item.productName;
                                  const name = item.isService
                                    ? (item.serviceName ?? 'Servicio')
                                    : isFreeItem
                                      ? item.productName!
                                      : (item.storeProduct?.product?.name ?? '?');
                                  return (
                                    <div key={item.id} className="truncate max-w-[220px]" title={name}>
                                      <span className="font-medium">{name}</span>
                                      <span className="text-gray-400 ml-1">x{Number(item.quantity)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {hiddenCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedSales(prev => {
                                    const next = new Set(prev);
                                    if (next.has(sale.id)) next.delete(sale.id);
                                    else next.add(sale.id);
                                    return next;
                                  })}
                                  className="text-blue-500 hover:text-blue-700 hover:underline cursor-pointer text-xs mt-0.5"
                                >
                                  {isExpanded ? `▲ Ver menos (${sale.items.length} productos)` : `+${hiddenCount} más...`}
                                </button>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-gray-400">-</span>
                        )}
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
                        {getPaymentMethodLabel(sale.paymentMethod, sale.paymentDetails)}
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
                      
                      {/* ✅ MÓDULO PH4: Columna Paciente */}
                      {patientsEnabled && (
                        <td className="px-2 py-3 text-xs text-teal-700">
                          {sale.patientName ? (
                            <div>
                              <div className="font-medium truncate max-w-[80px]">{sale.patientName}</div>
                              {sale.patientDni && (
                                <div className="text-gray-400">{sale.patientDni}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}

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
                              {documentsData[sale.id].adjustments?.map((adjustment) => (
                                <div key={adjustment.id} className="mt-1 flex flex-col items-center border-t border-gray-200 pt-1">
                                  <SunatStatusBadge
                                    status={adjustment.status}
                                    sunatCode={adjustment.sunatCode}
                                    sunatMessage={adjustment.sunatMessage}
                                  />
                                  <span className="text-[11px] text-violet-700">
                                    {adjustment.docType === 'NOTA_CREDITO' ? 'NC' : 'ND'} {adjustment.fullNumber}
                                  </span>
                                </div>
                              ))}
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
                          {sunatEnabled && (!isAnulada || documentsData[sale.id]?.hasDocument) && (
                            <SunatActions
                              saleId={sale.id}
                              documentId={documentsData[sale.id]?.document?.id}
                              status={documentsData[sale.id]?.document?.status}
                              hasXml={documentsData[sale.id]?.document?.hasXml}
                              hasCdr={documentsData[sale.id]?.document?.hasCdr}
                              userRole={userRole}
                              paymentMethod={sale.paymentMethod}
                              documentType={documentsData[sale.id]?.document?.docType}
                              documentTotal={sale.total}
                              allowNotes={!isAnulada}
                              onActionComplete={() => fetchDocumentsData([sale.id])}
                            />
                          )}
                          {sunatEnabled && documentsData[sale.id]?.adjustments?.map((adjustment) => (
                            <div key={adjustment.id} className="border-t border-gray-200 pt-1">
                              <span className="block text-center text-[10px] text-violet-700 mb-1">
                                {adjustment.docType === 'NOTA_CREDITO' ? 'NC' : 'ND'} {adjustment.fullNumber}
                              </span>
                              <SunatActions
                                saleId={sale.id}
                                documentId={adjustment.id}
                                status={adjustment.status}
                                hasXml={adjustment.hasXml}
                                hasCdr={adjustment.hasCdr}
                                userRole={userRole}
                                paymentMethod={sale.paymentMethod}
                                documentTotal={Number(adjustment.total)}
                                allowNotes={false}
                                onActionComplete={() => fetchDocumentsData([sale.id])}
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Página {currentPage} de {totalPages} ({totalSales} ventas)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
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
      </div>
      <Toaster position="top-right" richColors />
    </AuthLayout>
  );
}
