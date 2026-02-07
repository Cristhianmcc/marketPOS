'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { 
  ArrowLeft, ClipboardList, User, Calendar, Package, Wrench,
  FileText, ShoppingCart, Check, Play, X, Edit2, Trash2,
  AlertCircle, DollarSign
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

type WorkOrderStatus = 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'CLOSED' | 'CANCELLED';

interface WorkOrderItem {
  id: string;
  type: 'PRODUCT' | 'SERVICE';
  itemName: string;
  itemContent: string | null;
  quantityOriginal: number;
  quantityBase: number;
  conversionFactor: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
  storeProduct?: { product: { name: string; content: string | null } } | null;
  service?: { id: string; name: string } | null;
  unit?: { id: string; code: string; symbol: string | null } | null;
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
  customer: { id: string; name: string; phone: string | null; dni: string | null } | null;
  items: WorkOrderItem[];
  sale: { id: string; saleNumber: number; createdAt: string } | null;
}

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bgColor: string; textColor: string }> = {
  DRAFT: { label: 'Borrador', color: 'border-gray-400', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
  APPROVED: { label: 'Aprobado', color: 'border-blue-400', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  IN_PROGRESS: { label: 'En Proceso', color: 'border-yellow-400', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' },
  READY: { label: 'Listo', color: 'border-green-400', bgColor: 'bg-green-100', textColor: 'text-green-700' },
  CLOSED: { label: 'Cerrado', color: 'border-purple-400', bgColor: 'bg-purple-100', textColor: 'text-purple-700' },
  CANCELLED: { label: 'Cancelado', color: 'border-red-400', bgColor: 'bg-red-100', textColor: 'text-red-700' },
};

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Convert modal
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO'>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [resolvedParams.id]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${resolvedParams.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Orden no encontrada');
          router.push('/work-orders');
          return;
        }
        throw new Error('Error al cargar orden');
      }
      const data = await res.json();
      setOrder(data.data);
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error('Error al cargar la orden');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: WorkOrderStatus) => {
    if (!order) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/work-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar');
      }

      toast.success(`Estado actualizado a ${STATUS_CONFIG[newStatus].label}`);
      loadOrder();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar estado');
    } finally {
      setUpdating(false);
    }
  };

  const handleConvertToSale = async () => {
    if (!order) return;

    if (paymentMethod === 'CASH') {
      const paid = parseFloat(amountPaid);
      if (isNaN(paid) || paid < order.total) {
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

      const res = await fetch(`/api/work-orders/${order.id}/convert-to-sale`, {
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
      loadOrder();
    } catch (error: any) {
      toast.error(error.message || 'Error al convertir orden');
    } finally {
      setConverting(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm('¿Estás seguro de cancelar esta orden?')) return;

    setUpdating(true);
    try {
      const res = await fetch('/api/work-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: 'CANCELLED' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al cancelar');
      }

      toast.success('Orden cancelada');
      loadOrder();
    } catch (error: any) {
      toast.error(error.message || 'Error al cancelar');
    } finally {
      setUpdating(false);
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthLayout>
    );
  }

  if (!order) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Orden no encontrada</p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status];
  const canConvert = ['APPROVED', 'IN_PROGRESS', 'READY'].includes(order.status) && !order.sale;
  const canEdit = order.status === 'DRAFT';
  const canCancel = !['CLOSED', 'CANCELLED'].includes(order.status);

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/work-orders')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    OT #{order.number}
                  </h1>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  Creada {formatDate(order.createdAt)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => router.push(`/work-orders/${order.id}/edit`)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
              )}
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={updating}
                  className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Sale reference */}
          {order.sale && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    Convertida a Venta #{order.sale.saleNumber}
                  </p>
                  <p className="text-sm text-green-600">
                    {formatDate(order.sale.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Cliente
                </h2>
                {order.customer ? (
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">{order.customer.name}</p>
                    {order.customer.phone && (
                      <p className="text-sm text-gray-500">Tel: {order.customer.phone}</p>
                    )}
                    {order.customer.dni && (
                      <p className="text-sm text-gray-500">DNI: {order.customer.dni}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Sin cliente asignado</p>
                )}
              </div>

              {/* Items */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Items ({order.items.length})
                </h2>

                <div className="divide-y divide-gray-100">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {item.type === 'SERVICE' ? (
                              <Wrench className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Package className="w-4 h-4 text-blue-600" />
                            )}
                            <span className="font-medium text-gray-900">{item.itemName}</span>
                            {item.itemContent && (
                              <span className="text-sm text-gray-500">({item.itemContent})</span>
                            )}
                            {item.unit && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {item.unit.symbol || item.unit.code}
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="mt-1 text-sm text-gray-500 pl-6">
                              <FileText className="w-3 h-3 inline mr-1" />
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {item.quantityOriginal} × {formatMoney(item.unitPrice)}
                          </div>
                          <div className="font-medium text-gray-900">
                            {formatMoney(item.subtotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Notas
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Totals */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-4">Resumen</h2>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatMoney(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Descuento:</span>
                      <span>-{formatMoney(order.discount)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                    <span className="font-medium text-gray-900">Total:</span>
                    <span className="text-xl font-bold text-gray-900">{formatMoney(order.total)}</span>
                  </div>
                </div>
              </div>

              {/* Status actions */}
              {!order.sale && order.status !== 'CANCELLED' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h2 className="font-medium text-gray-900 mb-4">Acciones</h2>

                  <div className="space-y-2">
                    {order.status === 'DRAFT' && (
                      <button
                        onClick={() => handleUpdateStatus('APPROVED')}
                        disabled={updating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Aprobar Orden
                      </button>
                    )}

                    {order.status === 'APPROVED' && (
                      <button
                        onClick={() => handleUpdateStatus('IN_PROGRESS')}
                        disabled={updating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                        Iniciar Trabajo
                      </button>
                    )}

                    {order.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleUpdateStatus('READY')}
                        disabled={updating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Marcar como Listo
                      </button>
                    )}

                    {canConvert && (
                      <button
                        onClick={() => {
                          setPaymentMethod('CASH');
                          setAmountPaid(order.total.toString());
                          setShowConvertModal(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Convertir a Venta
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Historial
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-gray-900">Orden creada</p>
                      <p className="text-gray-500">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>
                  {order.updatedAt !== order.createdAt && (
                    <div className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400"></div>
                      <div>
                        <p className="text-gray-900">Última actualización</p>
                        <p className="text-gray-500">{formatDate(order.updatedAt)}</p>
                      </div>
                    </div>
                  )}
                  {order.sale && (
                    <div className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500"></div>
                      <div>
                        <p className="text-gray-900">Convertida a venta</p>
                        <p className="text-gray-500">{formatDate(order.sale.createdAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Convert to Sale Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Convertir OT #{order.number} a Venta
              </h2>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold text-gray-900">{formatMoney(order.total)}</span>
                </div>
                {order.customer && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">Cliente:</span>
                    <span className="text-gray-900">{order.customer.name}</span>
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
                      min={order.total}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {parseFloat(amountPaid) > order.total && (
                      <p className="text-sm text-green-600 mt-1">
                        Vuelto: {formatMoney(parseFloat(amountPaid) - order.total)}
                      </p>
                    )}
                  </div>
                )}

                {paymentMethod === 'FIADO' && !order.customer && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Esta orden no tiene cliente asignado.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowConvertModal(false)}
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
