'use client';

import { useState, useEffect, useRef } from 'react';
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
  Tag,
  Search,
  X,
  BarChart3,
  ArrowLeft
} from 'lucide-react';

type Tab = 'resumen' | 'diario' | 'turnos' | 'productos' | 'exportar';

interface SummaryData {
  summary: {
    totalSales: number;
    totalPromotions: number;
    totalDiscounts: number;
    totalCoupons: number; // ✅ Cupones (Módulo 14.2-A)
    totalCategoryPromotions: number; // ✅ Promos Categoría (Módulo 14.2-B)
    totalVolumePromotions: number; // ✅ Promos Volumen (Módulo 14.2-C1)
    totalNthPromotions: number; // ✅ Promos N-ésimo (Módulo 14.2-C2)
    ticketCount: number;
    averageTicket: number;
    totalFiado: number;
    fiadoCobrado: number;
    saldoPendiente: number;
    totalCost: number;
    grossProfit: number;
    profitMargin: number;
    dateRange: { from: string; to: string };
  };
  paymentMethods: Record<string, { count: number; total: number }>;
  topProducts: Array<{
    name: string;
    content: string | null;
    totalQuantity: number;
    totalAmount: number;
  }>;
  profitByProduct: Array<{
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    totalCost: number;
    totalRevenue: number;
    profit: number;
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
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyTotalPages, setDailyTotalPages] = useState(1);
  const [dailyTotal, setDailyTotal] = useState(0);
  
  // Turnos state
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsFrom, setShiftsFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [shiftsTo, setShiftsTo] = useState(new Date().toISOString().split('T')[0]);
  const [shiftsPage, setShiftsPage] = useState(1);
  const [shiftsTotalPages, setShiftsTotalPages] = useState(1);
  const [shiftsTotal, setShiftsTotal] = useState(0);
  
  // Top productos state
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [topFrom, setTopFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [topTo, setTopTo] = useState(new Date().toISOString().split('T')[0]);

  // Product analyzer state
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productGroupBy, setProductGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [productData, setProductData] = useState<{
    totals: { quantity: number; totalCost: number; totalRevenue: number; profit: number; margin: number; ticketCount: number; avgUnitCost: number; avgUnitPrice: number };
    series: Array<{ period: string; quantity: number; totalCost: number; totalRevenue: number; profit: number; margin: number; ticketCount: number }>;
  } | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Array<{ name: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);

  // Fetch summary
  useEffect(() => {
    if (activeTab !== 'resumen') return;
    fetchSummary();
  }, [activeTab, summaryFrom, summaryTo]);

  // Fetch daily
  useEffect(() => {
    if (activeTab !== 'diario') return;
    setDailyPage(1);
    fetchDaily(1);
  }, [activeTab, dailyFrom, dailyTo]);

  // Fetch shifts
  useEffect(() => {
    if (activeTab !== 'turnos') return;
    setShiftsPage(1);
    fetchShifts(1);
  }, [activeTab, shiftsFrom, shiftsTo]);

  // Fetch top products
  useEffect(() => {
    if (activeTab !== 'productos') return;
    fetchTopProducts();
  }, [activeTab, topFrom, topTo]);

  // Search catalog with debounce
  useEffect(() => {
    if (!productSearch.trim() || productSearch.length < 2) {
      setCatalogSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reports/search-products?q=${encodeURIComponent(productSearch)}`);
        if (res.ok) {
          const data = await res.json();
          const soldNames = new Set(filteredProducts.map(p => p.name.toLowerCase()));
          setCatalogSuggestions(
            (Array.isArray(data) ? data : [])
              .filter((s: { name: string }) => !soldNames.has(s.name.toLowerCase()))
          );
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const fetchDaily = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: dailyFrom,
        to: dailyTo,
        page: String(page),
        limit: '20',
      });
      const res = await fetch(`/api/reports/daily?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDailySales(data.sales);
        setDailyPage(data.page || 1);
        setDailyTotalPages(data.totalPages || 1);
        setDailyTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching daily:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: shiftsFrom,
        to: shiftsTo,
        page: String(page),
        limit: '15',
      });
      const res = await fetch(`/api/reports/shifts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts);
        setShiftsPage(data.page || 1);
        setShiftsTotalPages(data.totalPages || 1);
        setShiftsTotal(data.total || 0);
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
        by: 'amount',
        limit: '500',
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

  // Filter products by search
  const filteredProducts = productSearch.trim()
    ? topProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : topProducts;

  // Fetch product profit analysis
  const fetchProductProfit = async (productName: string, groupBy: 'day' | 'week' | 'month') => {
    setProductLoading(true);
    try {
      const params = new URLSearchParams({
        product: productName,
        groupBy,
        from: topFrom,
        to: topTo,
      });
      const res = await fetch(`/api/reports/product-profit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProductData({ totals: data.totals, series: data.series });
      }
    } catch (error) {
      console.error('Error fetching product profit:', error);
    } finally {
      setProductLoading(false);
    }
  };

  // When selectedProduct or groupBy changes, fetch data
  useEffect(() => {
    if (selectedProduct) {
      fetchProductProfit(selectedProduct, productGroupBy);
    }
  }, [selectedProduct, productGroupBy, topFrom, topTo]);

  const handleExport = async (type: 'sales' | 'items' | 'shifts' | 'inventory') => {
    const params = new URLSearchParams();
    
    if (type !== 'inventory') {
      params.set('from', summaryFrom);
      params.set('to', summaryTo);
    }

    // Ventas y Turnos usan endpoint XLSX con estilos; el resto sigue en CSV
    const exportUrl = (type === 'sales')
      ? `/api/reports/export/sales/xlsx?${params}`
      : `/api/reports/export/${type}?${params}`;

    try {
      const res = await fetch(exportUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Error al exportar ${type}`);
        return;
      }
      const blob = await res.blob();
      const defaultExt = (type === 'sales' || type === 'shifts') ? 'xlsx' : 'csv';
      const filename = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
        || `${type}_${new Date().toISOString().slice(0, 10)}.${defaultExt}`;

      // Desktop (Electron): convertir a data URI para forzar descarga
      if (typeof window !== 'undefined' && (window as any).desktop) {
        const mimeType = (type === 'sales' || type === 'shifts')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';
        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const binary = Array.from(uint8).map(b => String.fromCharCode(b)).join('');
        const base64 = btoa(binary);
        const dataUri = `data:${mimeType};base64,${base64}`;
        const a = document.createElement('a');
        a.href = dataUri;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Web: usar blob URL normalmente
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      alert('Error de red al exportar');
    }
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
                  ? 'border-primary text-primary'
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

                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-primary">
                      Promociones
                    </h3>
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-3xl font-bold text-primary">
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

                {/* ✅ Promos Volumen (Módulo 14.2-C1) */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-orange-700">
                      Promos Pack
                    </h3>
                    <Tag className="w-5 h-5 text-orange-600" />
                  </div>
                  <p className="text-3xl font-bold text-orange-900">
                    -{formatMoney(summaryData.summary.totalVolumePromotions || 0)}
                  </p>
                </div>

                {/* ✅ Promos N-ésimo (Módulo 14.2-C2) */}
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-yellow-700">
                      Promos N-ésimo
                    </h3>
                    <Tag className="w-5 h-5 text-yellow-600" />
                  </div>
                  <p className="text-3xl font-bold text-yellow-900">
                    -{formatMoney(summaryData.summary.totalNthPromotions || 0)}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">
                      Tickets
                    </h3>
                    <ShoppingCart className="w-5 h-5 text-primary" />
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

              {/* Rentabilidad - Dashboard profesional */}
              {summaryData.summary.totalCost > 0 && (
                <div className="border border-primary/20 rounded-2xl bg-white overflow-hidden mb-8">
                  {/* Header con ganancia principal */}
                  <div className="bg-gradient-to-r from-primary to-monterrial-forest px-6 py-5 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Rentabilidad del Periodo</p>
                        <p className={`text-3xl font-bold mt-1 ${summaryData.summary.grossProfit < 0 ? 'text-red-300' : ''}`}>{formatMoney(summaryData.summary.grossProfit)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/80 text-xs">Margen</p>
                        <p className={`text-2xl font-bold ${summaryData.summary.profitMargin < 0 ? 'text-red-300' : ''}`}>{summaryData.summary.profitMargin.toFixed(1)}%</p>
                      </div>
                    </div>
                    {/* Barra de margen visual */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-white/70 mb-1">
                        <span>Costo {formatMoney(summaryData.summary.totalCost)}</span>
                        <span>Venta {formatMoney(summaryData.summary.totalSales)}</span>
                      </div>
                      <div className="h-2.5 bg-white/15 rounded-full overflow-hidden">
                        <div className="h-full bg-monterrial-gold rounded-full" style={{ width: `${Math.min(100, (summaryData.summary.totalCost / summaryData.summary.totalSales) * 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Desglose por producto */}
                  {summaryData.profitByProduct && summaryData.profitByProduct.length > 0 && (
                    <div className="p-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Desglose por producto</p>
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {summaryData.profitByProduct.map((p, i) => {
                          const margin = p.totalRevenue > 0 ? (p.profit / p.totalRevenue) * 100 : (p.unitPrice > 0 ? ((p.unitPrice - p.unitCost) / p.unitPrice) * 100 : 0);
                          const maxProfit = Math.max(...summaryData.profitByProduct.map(x => Math.abs(x.profit)));
                          const barW = maxProfit > 0 ? (Math.abs(p.profit) / maxProfit) * 100 : 0;
                          return (
                            <div key={i} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                              onClick={() => { setSelectedProduct(p.productName); setActiveTab('productos'); }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary transition-colors" title={p.productName}>{p.productName}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {p.quantity} {p.quantity === 1 ? 'unidad' : 'unidades'} · Costo unit. {formatMoney(p.unitCost)} · Venta unit. {formatMoney(p.unitPrice)}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0 flex items-start gap-2">
                                  <div>
                                    <p className={`text-sm font-bold ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(p.profit)}</p>
                                    <p className={`text-xs ${margin >= 30 ? 'text-emerald-500' : margin >= 15 ? 'text-amber-500' : 'text-red-500'}`}>{margin.toFixed(1)}%</p>
                                  </div>
                                  <BarChart3 className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors mt-0.5" />
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

              {/* Payment Methods */}
              <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">Métodos de Pago</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(summaryData.paymentMethods).map(([method, data]) => {
                    const methodLabels: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta', MIXED: 'Mixto', FIADO: 'Fiado' };
                    return (
                    <div key={method} className="border border-gray-200 rounded p-4">
                      <p className="text-sm text-gray-600 mb-1">{methodLabels[method] || method}</p>
                      <p className="text-xl font-bold">{formatMoney(data.total)}</p>
                      <p className="text-xs text-gray-500">{data.count} tickets</p>
                    </div>
                    );
                  })}
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
            <>
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

            {/* Paginación */}
            {dailyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Página {dailyPage} de {dailyTotalPages} · {dailyTotal} día{dailyTotal !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setDailyPage(dailyPage - 1); fetchDaily(dailyPage - 1); }}
                    disabled={dailyPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => { setDailyPage(dailyPage + 1); fetchDaily(dailyPage + 1); }}
                    disabled={dailyPage >= dailyTotalPages}
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
            <>
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
                              ? 'text-primary font-medium'
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

            {/* Paginación */}
            {shiftsTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Página {shiftsPage} de {shiftsTotalPages} · {shiftsTotal} turno{shiftsTotal !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShiftsPage(shiftsPage - 1); fetchShifts(shiftsPage - 1); }}
                    disabled={shiftsPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => { setShiftsPage(shiftsPage + 1); fetchShifts(shiftsPage + 1); }}
                    disabled={shiftsPage >= shiftsTotalPages}
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
      )}

      {activeTab === 'productos' && (
        <div>
          {/* Top bar: filters + back button when analyzing */}
          {selectedProduct ? (
            <div className="mb-6">
              <button
                onClick={() => { setSelectedProduct(null); setProductData(null); }}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al listado
              </button>

              {/* Product analyzer header */}
              <div className="bg-gradient-to-r from-primary to-primary rounded-t-lg px-6 py-5 text-white">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Análisis de Producto</p>
                    <p className="text-xl font-bold mt-1">{selectedProduct}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-white/80">Desde</label>
                      <input type="date" value={topFrom} onChange={(e) => setTopFrom(e.target.value)}
                        className="bg-primary/30 border border-primary/40 rounded px-2 py-1 text-sm text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-white/80">Hasta</label>
                      <input type="date" value={topTo} onChange={(e) => setTopTo(e.target.value)}
                        className="bg-primary/30 border border-primary/40 rounded px-2 py-1 text-sm text-white" />
                    </div>
                    <button
                      onClick={async () => {
                        const params = new URLSearchParams({
                          product: selectedProduct!,
                          groupBy: productGroupBy,
                          from: topFrom,
                          to: topTo,
                        });
                        try {
                          const res = await fetch(`/api/reports/product-profit/export?${params}`);
                          if (!res.ok) { alert('Error al exportar'); return; }
                          const blob = await res.blob();
                          const filename = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                            || `Rentabilidad_${selectedProduct}.xlsx`;
                          if (typeof window !== 'undefined' && (window as any).desktop) {
                            const arrayBuffer = await blob.arrayBuffer();
                            const uint8 = new Uint8Array(arrayBuffer);
                            const binary = Array.from(uint8).map(b => String.fromCharCode(b)).join('');
                            const base64 = btoa(binary);
                            const a = document.createElement('a');
                            a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
                            a.download = filename;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          } else {
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(blobUrl);
                          }
                        } catch { alert('Error de red al exportar'); }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-medium transition-colors"
                      title="Exportar a Excel"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Excel
                    </button>
                  </div>
                </div>
                {/* Group by toggle */}
                <div className="flex gap-1 mt-4 bg-primary/30 rounded-lg p-1 w-fit">
                  {([['day', 'Diario'], ['week', 'Semanal'], ['month', 'Mensual']] as const).map(([val, label]) => (
                    <button key={val}
                      onClick={() => setProductGroupBy(val)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        productGroupBy === val ? 'bg-white text-primary' : 'text-white/80 hover:text-white'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Product totals */}
              {productLoading ? (
                <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg p-8 text-center text-gray-500">
                  Cargando análisis...
                </div>
              ) : productData ? (
                <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                    <div className="bg-white p-4">
                      <p className="text-xs text-gray-500">Total Vendido</p>
                      <p className="text-lg font-bold text-gray-900">{formatMoney(productData.totals.totalRevenue)}</p>
                      <p className="text-xs text-gray-400">{productData.totals.quantity} unidades</p>
                    </div>
                    <div className="bg-white p-4">
                      <p className="text-xs text-gray-500">Costo Total</p>
                      <p className="text-lg font-bold text-gray-500">{formatMoney(productData.totals.totalCost)}</p>
                      <p className="text-xs text-gray-400">P. unit. {formatMoney(productData.totals.avgUnitCost)}</p>
                    </div>
                    <div className="bg-white p-4">
                      <p className="text-xs text-gray-500">Ganancia</p>
                      <p className={`text-lg font-bold ${productData.totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatMoney(productData.totals.profit)}
                      </p>
                      <p className="text-xs text-gray-400">{productData.totals.ticketCount} tickets</p>
                    </div>
                    <div className="bg-white p-4">
                      <p className="text-xs text-gray-500">Margen</p>
                      <p className={`text-lg font-bold ${productData.totals.margin >= 30 ? 'text-emerald-600' : productData.totals.margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                        {productData.totals.margin.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400">P. venta {formatMoney(productData.totals.avgUnitPrice)}</p>
                    </div>
                  </div>

                  {/* Time series bars */}
                  {productData.series.length > 0 ? (
                    <div className="p-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                        Ganancia {productGroupBy === 'day' ? 'por día' : productGroupBy === 'week' ? 'por semana' : 'por mes'}
                      </p>
                      <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {(() => {
                          const maxProfit = Math.max(...productData.series.map(s => Math.abs(s.profit)), 1);
                          return productData.series.map((s, i) => {
                            const d = new Date(s.period);
                            let label: string;
                            if (productGroupBy === 'month') {
                              label = d.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
                            } else if (productGroupBy === 'week') {
                              const endWeek = new Date(d);
                              endWeek.setDate(endWeek.getDate() + 6);
                              label = `${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} - ${endWeek.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`;
                            } else {
                              label = d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });
                            }
                            const barW = (Math.abs(s.profit) / maxProfit) * 100;
                            return (
                              <div key={i} className="flex items-center gap-3 group hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                                <div className="w-28 flex-shrink-0 text-xs text-gray-500 text-right">{label}</div>
                                <div className="flex-1 flex items-center gap-2">
                                  <div className="flex-1 h-6 bg-gray-50 rounded overflow-hidden relative">
                                    <div
                                      className={`h-full rounded ${s.profit >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                                      style={{ width: `${barW}%` }}
                                    />
                                  </div>
                                  <div className="w-20 text-right flex-shrink-0">
                                    <span className={`text-sm font-semibold ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {formatMoney(s.profit)}
                                    </span>
                                  </div>
                                </div>
                                {/* Hover detail */}
                                <div className="hidden group-hover:flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                                  <span>{s.quantity} uds</span>
                                  <span>{s.margin.toFixed(1)}%</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* Best / worst periods */}
                      {productData.series.length >= 2 && (() => {
                        const sorted = [...productData.series].sort((a, b) => b.profit - a.profit);
                        const best = sorted[0];
                        const worst = sorted[sorted.length - 1];
                        const formatPeriod = (p: string) => {
                          const d = new Date(p);
                          if (productGroupBy === 'month') return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
                          if (productGroupBy === 'week') {
                            const end = new Date(d); end.setDate(end.getDate() + 6);
                            return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`;
                          }
                          return d.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'short' });
                        };
                        return (
                          <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-gray-100">
                            <div className="bg-emerald-50 rounded-lg p-4">
                              <p className="text-xs text-emerald-600 font-medium mb-1">Mejor periodo</p>
                              <p className="text-lg font-bold text-emerald-700">{formatMoney(best.profit)} <span className="text-xs font-normal text-emerald-500">ganancia</span></p>
                              <p className="text-xs text-emerald-600 mt-1">{formatPeriod(best.period)}</p>
                              <div className="flex gap-3 mt-2 text-xs text-emerald-500">
                                <span>{best.quantity} uds vendidas</span>
                                <span>·</span>
                                <span>Vendido {formatMoney(best.totalRevenue)}</span>
                                <span>·</span>
                                <span>Costo {formatMoney(best.totalCost)}</span>
                              </div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-4">
                              <p className="text-xs text-red-600 font-medium mb-1">Peor periodo</p>
                              <p className="text-lg font-bold text-red-700">{formatMoney(worst.profit)} <span className="text-xs font-normal text-red-500">ganancia</span></p>
                              <p className="text-xs text-red-600 mt-1">{formatPeriod(worst.period)}</p>
                              <div className="flex gap-3 mt-2 text-xs text-red-500">
                                <span>{worst.quantity} uds vendidas</span>
                                <span>·</span>
                                <span>Vendido {formatMoney(worst.totalRevenue)}</span>
                                <span>·</span>
                                <span>Costo {formatMoney(worst.totalCost)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm text-gray-500">
                      No hay datos en este periodo
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div className="flex items-end gap-4 mb-6 flex-wrap">
                <div className="flex-1 min-w-[200px] relative" ref={searchRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar producto
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => { setProductSearch(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Buscar en todo el catálogo..."
                      className="w-full border border-gray-300 rounded-md pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                    {productSearch && (
                      <button onClick={() => { setProductSearch(''); setCatalogSuggestions([]); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Suggestions dropdown */}
                  {showSuggestions && productSearch.length >= 2 && catalogSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <p className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">También en tu catálogo</p>
                      {catalogSuggestions.map((s, i) => (
                        <button key={i}
                          onClick={() => { setSelectedProduct(s.name); setProductSearch(''); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary/10 flex items-center justify-between gap-2"
                        >
                          <span className="text-gray-900">{s.name}</span>
                          <span className="flex items-center gap-1 text-xs text-primary flex-shrink-0">
                            <BarChart3 className="w-3 h-3" /> Analizar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                  <input type="date" value={topFrom} onChange={(e) => setTopFrom(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                  <input type="date" value={topTo} onChange={(e) => setTopTo(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </div>
              </div>

              {loading && <p className="text-gray-500">Cargando...</p>}

              {!loading && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400">
                      {productSearch ? `${filteredProducts.length} resultado${filteredProducts.length !== 1 ? 's' : ''}` : `${topProducts.length} productos vendidos`}
                    </p>
                    <button
                      onClick={async () => {
                        const params = new URLSearchParams({ from: topFrom, to: topTo });
                        try {
                          const res = await fetch(`/api/reports/product-profit/export-all?${params}`);
                          if (!res.ok) { alert('Error al exportar'); return; }
                          const blob = await res.blob();
                          const filename = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                            || 'Ranking_Productos_Rentabilidad.xlsx';
                          if (typeof window !== 'undefined' && (window as any).desktop) {
                            const arrayBuffer = await blob.arrayBuffer();
                            const uint8 = new Uint8Array(arrayBuffer);
                            const binary = Array.from(uint8).map(b => String.fromCharCode(b)).join('');
                            const base64 = btoa(binary);
                            const a = document.createElement('a');
                            a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
                            a.download = filename;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          } else {
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(blobUrl);
                          }
                        } catch { alert('Error de red al exportar'); }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar ranking
                    </button>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Total</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredProducts.map((p, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedProduct(p.name)}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-300">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                <p className="font-medium">{p.name}</p>
                                {p.content && <p className="text-xs text-gray-500">{p.content}</p>}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                {Number(p.totalQuantity) % 1 === 0 ? Number(p.totalQuantity) : Number(p.totalQuantity).toFixed(3)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                                {formatMoney(p.totalAmount)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-md transition-colors">
                                  <BarChart3 className="w-3.5 h-3.5" />
                                  Analizar
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredProducts.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                                {productSearch ? `No se encontró "${productSearch}"` : 'No hay datos en este periodo'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'exportar' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-semibold">Ventas (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Exporta todas las ventas con detalles de ticket, fecha, monto, método de pago y cajero.
              </p>
              <button
                onClick={() => handleExport('sales')}
                className="w-full bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover text-sm font-medium"
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

          <div className="mt-6 bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-primary">
              <strong>Nota:</strong> Los exports de Ventas, Items y Turnos usan el mismo rango de fechas configurado en la pestaña Resumen (Desde: {summaryFrom} - Hasta: {summaryTo}). El inventario exporta el estado actual.
            </p>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
