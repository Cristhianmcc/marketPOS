'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { 
  Plus, Search, ClipboardList, User, Calendar, DollarSign,
  ChevronRight, MoreVertical, Check, X, Play, Package,
  AlertCircle, FileText, Wrench, ShoppingCart
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useFlags } from '@/hooks/useFlags';

type WorkOrderStatus = 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'CLOSED' | 'CANCELLED';

interface WorkOrderItem {
  id: string;
  type: 'PRODUCT' | 'SERVICE';
  itemName: string;
  itemContent: string | null;
  quantityBase: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
  storeProduct?: { product: { name: string; content: string | null } } | null;
  service?: { id: string; name: string } | null;
  unit?: { code: string; symbol: string | null } | null;
}

interface WorkOrder {
  id: string;
  number: number;
  status: WorkOrderStatus;
  notes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string | null } | null;
  items: WorkOrderItem[];
  sale: { id: string; saleNumber: number; createdAt: string } | null;
}

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bgColor: string }> = {
  DRAFT: { label: 'Borrador', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  APPROVED: { label: 'Aprobado', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  IN_PROGRESS: { label: 'En Proceso', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  READY: { label: 'Listo', color: 'text-green-700', bgColor: 'bg-green-100' },
  CLOSED: { label: 'Cerrado', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-700', bgColor: 'bg-red-100' },
};

export default function WorkOrdersPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO'>('CASH');
  const [amountPaid, setAmountPaid] = useState('');

  const { isOn: isFlagOn, isLoading: flagsLoading } = useFlags();
  const workOrdersEnabled = isFlagOn('ENABLE_WORK_ORDERS');

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          window.location.href = '/login';
          return;
        }
        setUser(data);
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/work-orders?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar órdenes');
      const data = await res.json();
      setWorkOrders(data.data || []);
    } catch (error) {
      console.error('Error loading work orders:', error);
      toast.error('Error al cargar órdenes de trabajo');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (user && workOrdersEnabled && !flagsLoading) {
      loadWorkOrders();
    }
  }, [user, workOrdersEnabled, flagsLoading, loadWorkOrders]);

  const handleUpdateStatus = async (orderId: string, newStatus: WorkOrderStatus) => {
    try {
      const res = await fetch('/api/work-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar');
      }

      toast.success(`Estado actualizado a ${STATUS_CONFIG[newStatus].label}`);
      loadWorkOrders();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar estado');
    }
  };

  const handleConvertToSale = async () => {
    if (!selectedOrder) return;

    if (paymentMethod === 'CASH') {
      const paid = parseFloat(amountPaid);
      if (isNaN(paid) || paid < selectedOrder.total) {
        toast.error('Monto pagado insuficiente');
        return;
      }
    }

    setConverting(true);
    try {
      const body: any = { paymentMethod };
      if (paymentMethod === 'CASH') {
        body.amountPaid = parseFloat(amountPaid);
      }

      const res = await fetch(`/api/work-orders/${selectedOrder.id}/convert-to-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al convertir');
      }

      const data = await res.json();
      toast.success(`Venta #${data.data.saleNumber} creada exitosamente`);
      setShowConvertModal(false);
      setSelectedOrder(null);
      loadWorkOrders();
    } catch (error: any) {
      toast.error(error.message || 'Error al convertir orden');
    } finally {
      setConverting(false);
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (flagsLoading) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      </AuthLayout>
    );
  }

  if (!workOrdersEnabled) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-12 px-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                Módulo de Órdenes de Trabajo No Habilitado
              </h2>
              <p className="text-yellow-700">
                Contacta al administrador para habilitar esta funcionalidad.
              </p>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-7 h-7 text-blue-600" />
                Órdenes de Trabajo
              </h1>
              <p className="text-gray-500 mt-1">
                Cotizaciones y pedidos especiales (cortes, instalaciones, trabajos)
              </p>
            </div>

            <button
              onClick={() => router.push('/work-orders/new')}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nueva Orden
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as WorkOrderStatus | '')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {Object.entries(STATUS_CONFIG).map(([status, config]) => {
              const count = workOrders.filter(wo => wo.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as WorkOrderStatus)}
                  className={`p-4 rounded-lg border ${
                    statusFilter === status 
                      ? 'border-blue-500 ring-2 ring-blue-200' 
                      : 'border-gray-200 hover:border-gray-300'
                  } bg-white transition-all`}
                >
                  <div className={`text-2xl font-bold ${config.color}`}>{count}</div>
                  <div className="text-xs text-gray-500">{config.label}</div>
                </button>
              );
            })}
          </div>

          {/* Work Orders List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-3">Cargando órdenes...</p>
              </div>
            ) : workOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No hay órdenes de trabajo</p>
                <p className="text-sm mt-1">
                  {searchQuery || statusFilter ? 'No se encontraron resultados' : 'Crea tu primera orden para comenzar'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {workOrders.map((order) => {
                  const statusConfig = STATUS_CONFIG[order.status];
                  const canConvert = ['APPROVED', 'IN_PROGRESS', 'READY'].includes(order.status) && !order.sale;

                  return (
                    <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-lg font-bold text-gray-900">
                              OT #{order.number}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                            {order.sale && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                Venta #{order.sale.saleNumber}
                              </span>
                            )}
                          </div>

                          {/* Customer & Date */}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-2">
                            {order.customer ? (
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {order.customer.name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-gray-400">
                                <User className="w-4 h-4" />
                                Sin cliente
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(order.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-4 h-4" />
                              {order.items.length} items
                            </span>
                          </div>

                          {/* Items preview */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {order.items.slice(0, 3).map((item) => (
                              <span 
                                key={item.id} 
                                className={`text-xs px-2 py-1 rounded ${
                                  item.type === 'SERVICE' 
                                    ? 'bg-indigo-50 text-indigo-700' 
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {item.type === 'SERVICE' && <Wrench className="w-3 h-3 inline mr-1" />}
                                {item.itemName}
                              </span>
                            ))}
                            {order.items.length > 3 && (
                              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">
                                +{order.items.length - 3} más
                              </span>
                            )}
                          </div>

                          {order.notes && (
                            <p className="text-xs text-gray-500 line-clamp-1">
                              <FileText className="w-3 h-3 inline mr-1" />
                              {order.notes}
                            </p>
                          )}
                        </div>

                        {/* Total & Actions */}
                        <div className="text-right flex flex-col items-end gap-2">
                          <div className="text-xl font-bold text-gray-900">
                            {formatMoney(order.total)}
                          </div>

                          <div className="flex items-center gap-2">
                            {order.status === 'DRAFT' && (
                              <button
                                onClick={() => handleUpdateStatus(order.id, 'APPROVED')}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                              >
                                <Check className="w-4 h-4" />
                                Aprobar
                              </button>
                            )}
                            {order.status === 'APPROVED' && (
                              <button
                                onClick={() => handleUpdateStatus(order.id, 'IN_PROGRESS')}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                              >
                                <Play className="w-4 h-4" />
                                Iniciar
                              </button>
                            )}
                            {order.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => handleUpdateStatus(order.id, 'READY')}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                              >
                                <Check className="w-4 h-4" />
                                Listo
                              </button>
                            )}
                            {canConvert && (
                              <button
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setPaymentMethod('CASH');
                                  setAmountPaid(order.total.toString());
                                  setShowConvertModal(true);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                              >
                                <ShoppingCart className="w-4 h-4" />
                                Convertir a Venta
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/work-orders/${order.id}`)}
                              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert to Sale Modal */}
      {showConvertModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Convertir OT #{selectedOrder.number} a Venta
              </h2>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold text-gray-900">{formatMoney(selectedOrder.total)}</span>
                </div>
                {selectedOrder.customer && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">Cliente:</span>
                    <span className="text-gray-900">{selectedOrder.customer.name}</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="CASH">Efectivo</option>
                    <option value="YAPE">Yape</option>
                    <option value="PLIN">Plin</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="FIADO">Fiado</option>
                  </select>
                </div>

                {paymentMethod === 'CASH' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto Pagado (S/)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={selectedOrder.total}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {parseFloat(amountPaid) > selectedOrder.total && (
                      <p className="text-sm text-green-600 mt-1">
                        Vuelto: {formatMoney(parseFloat(amountPaid) - selectedOrder.total)}
                      </p>
                    )}
                  </div>
                )}

                {paymentMethod === 'FIADO' && !selectedOrder.customer && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Esta orden no tiene cliente asignado. Se requerirá seleccionar uno.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => {
                  setShowConvertModal(false);
                  setSelectedOrder(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConvertToSale}
                disabled={converting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              >
                {converting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    Crear Venta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
