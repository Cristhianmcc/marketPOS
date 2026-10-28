'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFlags } from '@/hooks/useFlags';
import { Plus, Search, Package, Truck, CheckCircle2, XCircle, Clock, ClipboardList, X, Check, Calendar, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Supplier { id: string; name: string; ruc: string | null; }
interface ProductInfo { id: string; name: string; barcode: string | null; internalSku: string; }
interface StoreProductInfo { id: string; price: number; stock: number | null; product: ProductInfo; }
interface POItem {
  id: string;
  storeProductId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: string | null;
  storeProduct: StoreProductInfo;
}
interface PurchaseOrder {
  id: string;
  orderNumber: number;
  status: string;
  notes: string | null;
  totalAmount: number;
  expectedDate: string | null;
  receivedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string; ruc: string | null };
  createdBy: { id: string; name: string };
  items: POItem[];
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: ClipboardList },
  SENT: { label: 'Enviada', color: 'bg-primary/15 text-primary', icon: Truck },
  PARTIAL: { label: 'Parcial', color: 'bg-amber-100 text-amber-700', icon: Clock },
  RECEIVED: { label: 'Recibida', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { isOn: isFlagOn } = useFlags();
  const enabled = isFlagOn('ENABLE_SUPPLIERS');

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<StoreProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Formulario nueva OC
  const [newOC, setNewOC] = useState({ supplierId: '', notes: '', expectedDate: '' });
  const [newItems, setNewItems] = useState<{ storeProductId: string; quantityOrdered: string; unitCost: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Formulario recepción
  const [receiveData, setReceiveData] = useState<{ itemId: string; quantityReceived: string; batchNumber: string; expiryDate: string }[]>([]);
  const [receiving, setReceiving] = useState(false);
  const receiveIdempotencyKey = useRef<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const url = `/api/purchase-orders${filterStatus ? `?status=${filterStatus}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch { toast.error('Error al cargar órdenes'); } finally { setLoading(false); }
  }, [filterStatus]);

  const loadSuppliers = async () => {
    const res = await fetch('/api/suppliers?active=true');
    const data = await res.json();
    setSuppliers(data.suppliers || []);
  };

  const loadProducts = async () => {
    const res = await fetch('/api/inventory?active=true&limit=100');
    const data = await res.json();
    setProducts(data.products || []);
  };

  useEffect(() => { if (enabled) { loadOrders(); loadSuppliers(); loadProducts(); } }, [enabled, loadOrders]);

  // ═══ Crear OC ═══
  const handleCreateOC = async () => {
    if (!newOC.supplierId) { toast.error('Selecciona un proveedor'); return; }
    if (newItems.length === 0) { toast.error('Agrega al menos un producto'); return; }

    const invalidItems = newItems.filter(i => !i.storeProductId || !parseFloat(i.quantityOrdered) || !parseFloat(i.unitCost));
    if (invalidItems.length > 0) { toast.error('Completa cantidad y costo de todos los items'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: newOC.supplierId,
          notes: newOC.notes,
          expectedDate: newOC.expectedDate || null,
          items: newItems.map(i => ({
            storeProductId: i.storeProductId,
            quantityOrdered: parseFloat(i.quantityOrdered),
            unitCost: parseFloat(i.unitCost),
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Orden de compra creada');
      setShowCreateModal(false);
      setNewOC({ supplierId: '', notes: '', expectedDate: '' });
      setNewItems([]);
      loadOrders();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  // ═══ Cambiar estado ═══
  const changeStatus = async (orderId: string, status: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Estado actualizado');
      loadOrders();
    } catch (err: any) { toast.error(err.message); }
  };

  // ═══ Recepcionar ═══
  const openReceiveModal = (order: PurchaseOrder) => {
    receiveIdempotencyKey.current = crypto.randomUUID();
    setReceiveOrderId(order.id);
    setReceiveData(
      order.items
        .filter(i => i.quantityReceived < i.quantityOrdered)
        .map(i => ({
          itemId: i.id,
          quantityReceived: String(i.quantityOrdered - i.quantityReceived),
          batchNumber: '',
          expiryDate: '',
        }))
    );
  };

  const handleReceive = async () => {
    if (!receiveOrderId) return;
    const validItems = receiveData.filter(i => parseFloat(i.quantityReceived) > 0);
    if (validItems.length === 0) { toast.error('Ingresa cantidades recibidas'); return; }

    setReceiving(true);
    try {
      if (!receiveIdempotencyKey.current) {
        receiveIdempotencyKey.current = crypto.randomUUID();
      }
      const res = await fetch(`/api/purchase-orders/${receiveOrderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': receiveIdempotencyKey.current,
        },
        body: JSON.stringify({ action: 'receive', receivedItems: validItems }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      toast.success(data.message);
      setReceiveOrderId(null);
      receiveIdempotencyKey.current = null;
      loadOrders();
    } catch (err: any) { toast.error(err.message); } finally { setReceiving(false); }
  };

  if (!enabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Módulo de Órdenes de Compra no habilitado</p>
        </div>
      </div>
    );
  }

  const receiveOrder = orders.find(o => o.id === receiveOrderId);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
            <p className="text-sm text-gray-500">Gestiona pedidos a proveedores y recepción de mercadería</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors">
          <Plus className="w-4 h-4" /> Nueva OC
        </button>
      </div>

      {/* Filtro por estado */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterStatus('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!filterStatus ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todas</button>
        {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
          <button key={key} onClick={() => setFilterStatus(key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === key ? 'bg-gray-900 text-white' : `${color} hover:opacity-80`}`}>{label}</button>
        ))}
      </div>

      {/* Lista de órdenes */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay órdenes de compra</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const st = STATUS_LABELS[o.status] || STATUS_LABELS.DRAFT;
            const StIcon = st.icon;
            const expanded = expandedId === o.id;
            return (
              <div key={o.id} className="bg-white border rounded-lg overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => setExpandedId(expanded ? null : o.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${st.color}`}>
                        <StIcon className="w-3.5 h-3.5" /> {st.label}
                      </span>
                      <span className="font-bold text-gray-900">OC #{o.orderNumber}</span>
                      <span className="text-sm text-gray-500">• {o.supplier.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">S/ {Number(o.totalAmount).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 pb-4">
                    <table className="w-full mt-3 text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="pb-2">Producto</th>
                          <th className="pb-2 text-right">Pedido</th>
                          <th className="pb-2 text-right">Recibido</th>
                          <th className="pb-2 text-right">Costo Unit.</th>
                          <th className="pb-2">Lote</th>
                          <th className="pb-2">Vence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{item.storeProduct.product.name}</td>
                            <td className="py-2 text-right">{Number(item.quantityOrdered)}</td>
                            <td className="py-2 text-right">
                              <span className={Number(item.quantityReceived) >= Number(item.quantityOrdered) ? 'text-green-600 font-semibold' : Number(item.quantityReceived) > 0 ? 'text-amber-600' : 'text-gray-400'}>
                                {Number(item.quantityReceived)}
                              </span>
                            </td>
                            <td className="py-2 text-right">S/ {Number(item.unitCost).toFixed(2)}</td>
                            <td className="py-2 text-gray-500">{item.batchNumber || '—'}</td>
                            <td className="py-2 text-gray-500">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Acciones */}
                    <div className="flex gap-2 mt-3">
                      {o.status === 'DRAFT' && (
                        <>
                          <button onClick={() => changeStatus(o.id, 'SENT')} className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">Marcar como Enviada</button>
                          <button onClick={() => changeStatus(o.id, 'CANCELLED')} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">Cancelar</button>
                        </>
                      )}
                      {(o.status === 'SENT' || o.status === 'PARTIAL') && (
                        <button onClick={() => openReceiveModal(o)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Recepcionar Mercadería
                        </button>
                      )}
                      {o.status === 'SENT' && (
                        <button onClick={() => changeStatus(o.id, 'CANCELLED')} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">Cancelar</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Modal Crear OC ═══ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 my-8 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nueva Orden de Compra</h2>
              <button onClick={() => setShowCreateModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                  <select value={newOC.supplierId} onChange={(e) => setNewOC({ ...newOC, supplierId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Seleccionar...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} {s.ruc ? `(${s.ruc})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha esperada</label>
                  <input type="date" value={newOC.expectedDate} onChange={(e) => setNewOC({ ...newOC, expectedDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <input type="text" value={newOC.notes} onChange={(e) => setNewOC({ ...newOC, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ej: Pedido urgente, entregar en almacén 2" />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Productos</label>
                  <button onClick={() => setNewItems([...newItems, { storeProductId: '', quantityOrdered: '', unitCost: '' }])} className="text-sm text-primary hover:text-primary flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar producto
                  </button>
                </div>
                {newItems.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Agrega productos a la orden</p>}
                <div className="space-y-2">
                  {newItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_100px_30px] gap-2 items-end">
                      <select value={item.storeProductId} onChange={(e) => { const arr = [...newItems]; arr[idx].storeProductId = e.target.value; setNewItems(arr); }} className="border rounded-lg px-2 py-2 text-sm">
                        <option value="">Producto...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.product.name} ({p.product.internalSku})</option>)}
                      </select>
                      <input type="number" placeholder="Cant." value={item.quantityOrdered} onChange={(e) => { const arr = [...newItems]; arr[idx].quantityOrdered = e.target.value; setNewItems(arr); }} className="border rounded-lg px-2 py-2 text-sm text-right" min="1" />
                      <input type="number" placeholder="Costo" value={item.unitCost} onChange={(e) => { const arr = [...newItems]; arr[idx].unitCost = e.target.value; setNewItems(arr); }} className="border rounded-lg px-2 py-2 text-sm text-right" min="0" step="0.01" />
                      <button onClick={() => setNewItems(newItems.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                {newItems.length > 0 && (
                  <div className="text-right mt-2 text-sm font-semibold text-gray-700">
                    Total: S/ {newItems.reduce((s, i) => s + (parseFloat(i.quantityOrdered) || 0) * (parseFloat(i.unitCost) || 0), 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleCreateOC} disabled={saving} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm">
                <Check className="w-4 h-4" /> {saving ? 'Creando...' : 'Crear OC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Recepción ═══ */}
      {receiveOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 my-8 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Recepcionar OC #{receiveOrder.orderNumber}</h2>
              <button onClick={() => setReceiveOrderId(null)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Proveedor: <strong>{receiveOrder.supplier.name}</strong></p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <strong>Al recepcionar</strong> se crearán los lotes automáticamente, se actualizará el stock y se registrará el movimiento de compra.
            </div>

            <div className="space-y-3">
              {receiveOrder.items
                .filter(i => Number(i.quantityReceived) < Number(i.quantityOrdered))
                .map((item, idx) => {
                  const rd = receiveData[idx];
                  if (!rd) return null;
                  const pending = Number(item.quantityOrdered) - Number(item.quantityReceived);
                  return (
                    <div key={item.id} className="border rounded-lg p-3">
                      <div className="font-medium text-sm mb-2">
                        {item.storeProduct.product.name}
                        <span className="text-gray-400 ml-2">Pendiente: {pending}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">Cantidad</label>
                          <input type="number" value={rd.quantityReceived} onChange={(e) => { const arr = [...receiveData]; arr[idx].quantityReceived = e.target.value; setReceiveData(arr); }} className="w-full border rounded px-2 py-1.5 text-sm" max={pending} min="0" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Nº Lote</label>
                          <input type="text" value={rd.batchNumber} onChange={(e) => { const arr = [...receiveData]; arr[idx].batchNumber = e.target.value; setReceiveData(arr); }} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="L001" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-gray-500">Fecha vencimiento</label>
                          <input type="date" value={rd.expiryDate} onChange={(e) => { const arr = [...receiveData]; arr[idx].expiryDate = e.target.value; setReceiveData(arr); }} className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setReceiveOrderId(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={handleReceive} disabled={receiving} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                <CheckCircle2 className="w-4 h-4" /> {receiving ? 'Procesando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
