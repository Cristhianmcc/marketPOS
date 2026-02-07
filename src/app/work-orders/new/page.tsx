'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { 
  ArrowLeft, Plus, Trash2, Search, User, Package, Wrench,
  Save, Calculator, AlertCircle
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Product {
  id: string;
  storeProductId: string;
  name: string;
  content: string | null;
  price: number;
  stock: number;
  units: { id: string; code: string; symbol: string | null; conversionFactor: number; price: number }[];
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
}

interface OrderItem {
  tempId: string;
  type: 'PRODUCT' | 'SERVICE';
  storeProductId?: string;
  serviceId?: string;
  itemName: string;
  itemContent?: string;
  unitIdUsed?: string;
  quantityOriginal: number;
  quantityBase: number;
  conversionFactor: number;
  unitPrice: number;
  subtotal: number;
  notes: string;
  // UI helpers
  selectedProduct?: Product;
  selectedService?: Service;
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<OrderItem[]>([]);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Search
  const [productSearch, setProductSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showServiceSearch, setShowServiceSearch] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [customersRes, productsRes, servicesRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/products?includeUnits=true'),
        fetch('/api/services'),
      ]);

      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || data.data || []);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        const mapped = (data.products || data.data || []).map((p: any) => ({
          id: p.id,
          storeProductId: p.storeProductId || p.id,
          name: p.name || p.product?.name,
          content: p.content || p.product?.content,
          price: p.price,
          stock: p.stock,
          units: p.units || [],
        }));
        setProducts(mapped);
      }

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.data || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addProduct = (product: Product, unitId?: string) => {
    const unit = unitId ? product.units.find(u => u.id === unitId) : null;
    const price = unit ? unit.price : product.price;
    const conversionFactor = unit ? unit.conversionFactor : 1;

    const newItem: OrderItem = {
      tempId: `temp-${Date.now()}`,
      type: 'PRODUCT',
      storeProductId: product.storeProductId,
      itemName: product.name,
      itemContent: product.content || undefined,
      unitIdUsed: unitId,
      quantityOriginal: 1,
      quantityBase: conversionFactor,
      conversionFactor,
      unitPrice: price,
      subtotal: price,
      notes: '',
      selectedProduct: product,
    };

    setItems([...items, newItem]);
    setShowProductSearch(false);
    setProductSearch('');
  };

  const addService = (service: Service) => {
    const newItem: OrderItem = {
      tempId: `temp-${Date.now()}`,
      type: 'SERVICE',
      serviceId: service.id,
      itemName: service.name,
      quantityOriginal: 1,
      quantityBase: 1,
      conversionFactor: 1,
      unitPrice: service.basePrice,
      subtotal: service.basePrice,
      notes: '',
      selectedService: service,
    };

    setItems([...items, newItem]);
    setShowServiceSearch(false);
    setServiceSearch('');
  };

  const updateItemQuantity = (tempId: string, qty: number) => {
    setItems(items.map(item => {
      if (item.tempId !== tempId) return item;
      const quantityBase = qty * item.conversionFactor;
      return {
        ...item,
        quantityOriginal: qty,
        quantityBase,
        subtotal: qty * item.unitPrice,
      };
    }));
  };

  const updateItemPrice = (tempId: string, price: number) => {
    setItems(items.map(item => {
      if (item.tempId !== tempId) return item;
      return {
        ...item,
        unitPrice: price,
        subtotal: item.quantityOriginal * price,
      };
    }));
  };

  const updateItemNotes = (tempId: string, notes: string) => {
    setItems(items.map(item => 
      item.tempId === tempId ? { ...item, notes } : item
    ));
  };

  const removeItem = (tempId: string) => {
    setItems(items.filter(item => item.tempId !== tempId));
  };

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = subtotal - discount;

  const handleSave = async (asDraft: boolean) => {
    if (items.length === 0) {
      toast.error('Agrega al menos un item');
      return;
    }

    setSaving(true);
    try {
      const body = {
        customerId: customerId || null,
        status: asDraft ? 'DRAFT' : 'APPROVED',
        notes: notes || null,
        discount,
        items: items.map(item => ({
          type: item.type,
          storeProductId: item.storeProductId || null,
          serviceId: item.serviceId || null,
          itemName: item.itemName,
          itemContent: item.itemContent || null,
          unitIdUsed: item.unitIdUsed || null,
          quantityOriginal: item.quantityOriginal,
          conversionFactor: item.conversionFactor,
          unitPrice: item.unitPrice,
          notes: item.notes || null,
        })),
      };

      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      const data = await res.json();
      toast.success(`Orden #${data.data.number} creada exitosamente`);
      router.push('/work-orders');
    } catch (error: any) {
      toast.error(error.message || 'Error al crear orden');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.content && p.content.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  if (loading) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push('/work-orders')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Nueva Orden de Trabajo</h1>
              <p className="text-gray-500 text-sm">Cotización o pedido especial</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Cliente (Opcional)
                </h2>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Sin cliente asignado</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3">Items de la Orden</h2>

                {/* Add buttons */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <button
                      onClick={() => {
                        setShowProductSearch(!showProductSearch);
                        setShowServiceSearch(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                    >
                      <Package className="w-4 h-4" />
                      Agregar Producto
                    </button>

                    {showProductSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-auto">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Buscar producto..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              autoFocus
                              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-auto">
                          {filteredProducts.length === 0 ? (
                            <p className="p-4 text-sm text-gray-500 text-center">No se encontraron productos</p>
                          ) : (
                            filteredProducts.slice(0, 20).map(product => (
                              <div key={product.id} className="border-b border-gray-50 last:border-0">
                                <button
                                  onClick={() => addProduct(product)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-50 flex justify-between items-center"
                                >
                                  <div>
                                    <div className="font-medium text-gray-900">{product.name}</div>
                                    {product.content && (
                                      <div className="text-xs text-gray-500">{product.content}</div>
                                    )}
                                  </div>
                                  <span className="text-sm font-medium text-blue-600">{formatMoney(product.price)}</span>
                                </button>
                                {product.units.length > 0 && (
                                  <div className="px-4 pb-2 flex gap-1 flex-wrap">
                                    {product.units.map(unit => (
                                      <button
                                        key={unit.id}
                                        onClick={() => addProduct(product, unit.id)}
                                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                      >
                                        {unit.symbol || unit.code} ({formatMoney(unit.price)})
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative flex-1">
                    <button
                      onClick={() => {
                        setShowServiceSearch(!showServiceSearch);
                        setShowProductSearch(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                    >
                      <Wrench className="w-4 h-4" />
                      Agregar Servicio
                    </button>

                    {showServiceSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-auto">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Buscar servicio..."
                              value={serviceSearch}
                              onChange={(e) => setServiceSearch(e.target.value)}
                              autoFocus
                              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-auto">
                          {filteredServices.length === 0 ? (
                            <p className="p-4 text-sm text-gray-500 text-center">No se encontraron servicios</p>
                          ) : (
                            filteredServices.map(service => (
                              <button
                                key={service.id}
                                onClick={() => addService(service)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                              >
                                <div className="flex justify-between items-center">
                                  <div>
                                    <div className="font-medium text-gray-900">{service.name}</div>
                                    {service.description && (
                                      <div className="text-xs text-gray-500">{service.description}</div>
                                    )}
                                  </div>
                                  <span className="text-sm font-medium text-indigo-600">{formatMoney(service.basePrice)}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items list */}
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calculator className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>No hay items agregados</p>
                    <p className="text-sm">Agrega productos o servicios para cotizar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div 
                        key={item.tempId} 
                        className={`p-3 rounded-lg border ${
                          item.type === 'SERVICE' 
                            ? 'bg-indigo-50 border-indigo-200' 
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {item.type === 'SERVICE' ? (
                                <Wrench className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Package className="w-4 h-4 text-blue-600" />
                              )}
                              <span className="font-medium text-gray-900">{item.itemName}</span>
                              {item.itemContent && (
                                <span className="text-xs text-gray-500">({item.itemContent})</span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Cant:</label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={item.quantityOriginal}
                                  onChange={(e) => updateItemQuantity(item.tempId, parseFloat(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Precio:</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => updateItemPrice(item.tempId, parseFloat(e.target.value) || 0)}
                                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            <div className="mt-2">
                              <input
                                type="text"
                                placeholder="Notas (medidas, especificaciones...)"
                                value={item.notes}
                                onChange={(e) => updateItemNotes(item.tempId, e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className="font-bold text-gray-900">{formatMoney(item.subtotal)}</span>
                            <button
                              onClick={() => removeItem(item.tempId)}
                              className="p-1 text-red-500 hover:bg-red-100 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="font-medium text-gray-900 mb-3">Notas Generales</h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Instrucciones especiales, detalles del trabajo, fecha de entrega..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Sidebar - Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-4">
                <h2 className="font-medium text-gray-900 mb-4">Resumen</h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Items:</span>
                    <span className="font-medium">{items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatMoney(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Descuento:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="pt-3 border-t border-gray-200 flex justify-between">
                    <span className="font-medium text-gray-900">Total:</span>
                    <span className="text-xl font-bold text-gray-900">{formatMoney(total)}</span>
                  </div>
                </div>

                {items.length === 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Agrega items para poder guardar
                  </div>
                )}

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving || items.length === 0}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Guardar como Borrador
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving || items.length === 0}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Guardar y Aprobar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
