'use client';

import { useState, useEffect } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { formatMoney } from '@/lib/money';
import { 
  Download, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Calendar,
  Award,
  Clock,
  Tag
} from 'lucide-react';

type Tab = 'resumen' | 'diario' | 'turnos' | 'productos' | 'exportar';

interface SummaryData {
  summary: {
    totalSales: number;
    totalPromotions: number;
    totalDiscounts: number;
    totalCoupons: number; // ✅ Cupones (Módulo 14.2-A)
    totalCategoryPromotions: number; // ✅ Promos Categoría (Módulo 14.2-B)
    ticketCount: number;
    averageTicket: number;
    totalFiado: number;
    fiadoCobrado: number;
    saldoPendiente: number;
    dateRange: { from: string; to: string };
  };
  paymentMethods: Record<string, { count: number; total: number }>;
  topProducts: Array<{
    name: string;
    content: string | null;
    totalQuantity: number;
    totalAmount: number;
  }>;
}

interface DailySale {
  date: string;
  ticketCount: number;
  totalSales: number;
  cashTotal: number;
  otherTotal: number;
}

interface Shift {
  openedAt: string;
  closedAt: string;
  openedBy: string;
  openingCash: number;
  closingCash: number;
  expectedCash: number;
  difference: number;
  notes: string | null;
  totalSales: number;
  ticketCount: number;
}

interface TopProduct {
  name: string;
  content: string | null;
  unitType: string;
  totalQuantity: number;
  totalAmount: number;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  
  // Resumen state
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [summaryFrom, setSummaryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [summaryTo, setSummaryTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Diario state
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [dailyFrom, setDailyFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dailyTo, setDailyTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Turnos state
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsFrom, setShiftsFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [shiftsTo, setShiftsTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Top productos state
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topBy, setTopBy] = useState<'amount' | 'quantity'>('amount');
  const [topLimit, setTopLimit] = useState(10);
  const [topFrom, setTopFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [topTo, setTopTo] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);

  // Fetch summary
  useEffect(() => {
    if (activeTab !== 'resumen') return;
    fetchSummary();
  }, [activeTab, summaryFrom, summaryTo]);

  // Fetch daily
  useEffect(() => {
    if (activeTab !== 'diario') return;
    fetchDaily();
  }, [activeTab, dailyFrom, dailyTo]);

  // Fetch shifts
  useEffect(() => {
    if (activeTab !== 'turnos') return;
    fetchShifts();
  }, [activeTab, shiftsFrom, shiftsTo]);

  // Fetch top products
  useEffect(() => {
    if (activeTab !== 'productos') return;
    fetchTopProducts();
  }, [activeTab, topBy, topLimit, topFrom, topTo]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: summaryFrom,
        to: summaryTo,
      });
      const res = await fetch(`/api/reports/summary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDaily = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: dailyFrom,
        to: dailyTo,
      });
      const res = await fetch(`/api/reports/daily?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDailySales(data.sales);
      }
    } catch (error) {
      console.error('Error fetching daily:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: shiftsFrom,
        to: shiftsTo,
      });
      const res = await fetch(`/api/reports/shifts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        by: topBy,
        limit: topLimit.toString(),
        from: topFrom,
        to: topTo,
      });
      const res = await fetch(`/api/reports/top-products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTopProducts(data.products);
      }
    } catch (error) {
      console.error('Error fetching top products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: 'sales' | 'items' | 'shifts' | 'inventory') => {
    const params = new URLSearchParams();
    
    if (type !== 'inventory') {
      params.set('from', summaryFrom);
      params.set('to', summaryTo);
    }

    const url = `/api/reports/export/${type}?${params}`;
    window.open(url, '_blank');
  };

  return (
    <AuthLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-600 mt-1">
          Análisis y exportación de datos
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'resumen', label: 'Resumen' },
            { id: 'diario', label: 'Ventas por día' },
            { id: 'turnos', label: 'Turnos' },
            { id: 'productos', label: 'Top Productos' },
            { id: 'exportar', label: 'Exportar' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'resumen' && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={summaryFrom}
                onChange={(e) => setSummaryFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={summaryTo}
                onChange={(e) => setSummaryTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {loading && <p className="text-gray-500">Cargando...</p>}

          {summaryData && (
            <div>
              {/* Cards principales */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">
                      Total Ventas
                    </h3>
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatMoney(summaryData.summary.totalSales)}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-blue-700">
                      Promociones
                    </h3>
                    <Award className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-3xl font-bold text-blue-900">
                    -{formatMoney(summaryData.summary.totalPromotions)}
                  </p>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-orange-700">
                      Descuentos
                    </h3>
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <p className="text-3xl font-bold text-orange-900">
                    -{formatMoney(summaryData.summary.totalDiscounts)}
                  </p>
                </div>

                {/* ✅ Cupones (Módulo 14.2-A) */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-green-700">
                      Cupones
                    </h3>
                    <Tag className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-3xl font-bold text-green-900">
                    -{formatMoney(summaryData.summary.totalCoupons)}
                  </p>
                </div>

                {/* ✅ Promos Categoría (Módulo 14.2-B) */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-purple-700">
                      Promos Categoría
                    </h3>
                    <Tag className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-3xl font-bold text-purple-900">
                    -{formatMoney(summaryData.summary.totalCategoryPromotions || 0)}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">
                      Tickets
                    </h3>
                    <ShoppingCart className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {summaryData.summary.ticketCount}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">
                      Ticket Promedio
                    </h3>
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatMoney(summaryData.summary.averageTicket)}
                  </p>
                </div>
              </div>

              {/* Cards de FIADO */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Cuentas por Cobrar (FIADO)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-orange-700">
                        Total Vendido a Crédito
                      </h3>
                      <ShoppingCart className="w-5 h-5 text-orange-600" />
                    </div>
                    <p className="text-3xl font-bold text-orange-900">
                      {formatMoney(summaryData.summary.totalFiado)}
                    </p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-green-700">
                        Cobrado en el Período
                      </h3>
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-3xl font-bold text-green-900">
                      {formatMoney(summaryData.summary.fiadoCobrado)}
                    </p>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-red-700">
                        Saldo Pendiente Total
                      </h3>
                      <Clock className="w-5 h-5 text-red-600" />
                    </div>
                    <p className="text-3xl font-bold text-red-900">
                      {formatMoney(summaryData.summary.saldoPendiente)}
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      Todas las cuentas abiertas
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">Métodos de Pago</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(summaryData.paymentMethods).map(([method, data]) => (
                    <div key={method} className="border border-gray-200 rounded p-4">
                      <p className="text-sm text-gray-600 mb-1">{method}</p>
                      <p className="text-xl font-bold">{formatMoney(data.total)}</p>
                      <p className="text-xs text-gray-500">{data.count} tickets</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Products */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Top 5 Productos</h3>
                <div className="space-y-3">
                  {summaryData.topProducts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {p.name} {p.content && `- ${p.content}`}
                          </p>
                          <p className="text-sm text-gray-500">
                            Cantidad: {Number(p.totalQuantity).toFixed(3)}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">{formatMoney(p.totalAmount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'diario' && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={dailyFrom}
                onChange={(e) => setDailyFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={dailyTo}
                onChange={(e) => setDailyTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {loading && <p className="text-gray-500">Cargando...</p>}

          {!loading && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tickets
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Efectivo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Otros
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailySales.map((sale, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(sale.date).toLocaleDateString('es-PE')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.ticketCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatMoney(sale.totalSales)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatMoney(sale.cashTotal)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatMoney(sale.otherTotal)}
                      </td>
                    </tr>
                  ))}
                  {dailySales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        No hay ventas en este periodo
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'turnos' && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={shiftsFrom}
                onChange={(e) => setShiftsFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={shiftsTo}
                onChange={(e) => setShiftsTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {loading && <p className="text-gray-500">Cargando...</p>}

          {!loading && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Apertura
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cierre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cajero
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Caja Inicial
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Efectivo Esperado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Caja Final
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Diferencia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ventas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tickets
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {shifts.map((shift, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(shift.openedAt).toLocaleString('es-PE')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {shift.closedAt ? new Date(shift.closedAt).toLocaleString('es-PE') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {shift.openedBy}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMoney(shift.openingCash)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMoney(shift.expectedCash)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMoney(shift.closingCash)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={
                            shift.difference === 0
                              ? 'text-green-600 font-medium'
                              : shift.difference > 0
                              ? 'text-blue-600 font-medium'
                              : 'text-red-600 font-medium'
                          }
                        >
                          {formatMoney(shift.difference)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatMoney(shift.totalSales)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {shift.ticketCount}
                      </td>
                    </tr>
                  ))}
                  {shifts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                        No hay turnos en este periodo
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'productos' && (
        <div>
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ordenar por
              </label>
              <select
                value={topBy}
                onChange={(e) => setTopBy(e.target.value as 'amount' | 'quantity')}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="amount">Monto</option>
                <option value="quantity">Cantidad</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Límite
              </label>
              <select
                value={topLimit}
                onChange={(e) => setTopLimit(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={20}>Top 20</option>
                <option value={50}>Top 50</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={topFrom}
                onChange={(e) => setTopFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={topTo}
                onChange={(e) => setTopTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {loading && <p className="text-gray-500">Cargando...</p>}

          {!loading && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Producto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cantidad Vendida
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Monto Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topProducts.map((p, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-400">
                        #{idx + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.content && (
                            <p className="text-xs text-gray-500">{p.content}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {p.unitType === 'UNIT' ? 'Unidad' : 'KG'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Number(p.totalQuantity).toFixed(3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatMoney(p.totalAmount)}
                      </td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        No hay datos en este periodo
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'exportar' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Ventas (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Exporta todas las ventas con detalles de ticket, fecha, monto, método de pago y cajero.
              </p>
              <button
                onClick={() => handleExport('sales')}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Descargar Ventas
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-semibold">Items (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Exporta todos los items vendidos con producto, cantidad, precio unitario y subtotal.
              </p>
              <button
                onClick={() => handleExport('items')}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
              >
                Descargar Items
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-semibold">Turnos (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Exporta todos los turnos cerrados con caja inicial, final, diferencia y ventas.
              </p>
              <button
                onClick={() => handleExport('shifts')}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm font-medium"
              >
                Descargar Turnos
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Award className="w-6 h-6 text-orange-600" />
                <h3 className="text-lg font-semibold">Inventario (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Exporta el inventario actual con nombre, marca, precio, stock y estado.
              </p>
              <button
                onClick={() => handleExport('inventory')}
                className="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 text-sm font-medium"
              >
                Descargar Inventario
              </button>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> Los exports de Ventas, Items y Turnos usan el mismo rango de fechas configurado en la pestaña Resumen (Desde: {summaryFrom} - Hasta: {summaryTo}). El inventario exporta el estado actual.
            </p>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
