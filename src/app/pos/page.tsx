'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, AlertCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { toast, Toaster } from 'sonner';
import { formatMoney } from '@/lib/money';
import { Shift } from '@/domain/types';

interface StoreProduct {
  id: string;
  price: number;
  stock: number | null;
  active: boolean;
  product: {
    id: string;
    name: string;
    brand: string | null;
    content: string | null;
    category: string;
    unitType: 'UNIT' | 'KG';
    barcode: string | null;
    internalSku: string;
  };
}

interface CartItem {
  storeProduct: StoreProduct;
  quantity: number;
}

export default function POSPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [showSaleCompleteModal, setShowSaleCompleteModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ id: string; total: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD'>('CASH');
  const [amountPaid, setAmountPaid] = useState('');

  // Cargar turno actual al montar
  useEffect(() => {
    fetchCurrentShift();
  }, []);

  const fetchCurrentShift = async () => {
    try {
      const res = await fetch('/api/shifts/current');
      const data = await res.json();
      setCurrentShift(data.shift);
    } catch (error) {
      console.error('Error fetching shift:', error);
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
      setShowOpenShiftModal(false);
      setOpeningCash('');
      fetchCurrentShift();
    } catch (error) {
      toast.error('Error al abrir turno');
    }
  };

  // Búsqueda automática con debounce
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch();
      } else if (query.trim().length === 0) {
        setProducts([]);
      }
    }, 300); // Esperar 300ms después de que el usuario deje de escribir

    return () => clearTimeout(delaySearch);
  }, [query]);

  const performSearch = async () => {
    if (!query.trim()) {
      setProducts([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?query=${encodeURIComponent(query)}&active=true`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Error al buscar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch();
  };

  const addToCart = (sp: StoreProduct) => {
    // Validar stock antes de agregar
    if (sp.stock !== null && sp.stock <= 0) {
      toast.error(`${sp.product.name}: sin stock disponible`);
      return;
    }
    
    const existing = cart.find((item) => item.storeProduct.id === sp.id);
    
    if (existing) {
      updateQuantity(sp.id, existing.quantity + 1);
    } else {
      setCart([...cart, { storeProduct: sp, quantity: 1 }]);
      toast.success(`${sp.product.name} agregado al carrito`);
      
      // Advertencia si el stock es bajo
      if (sp.stock !== null && sp.stock <= 5) {
        toast.warning(`Advertencia: Solo quedan ${sp.stock} unidades`, { duration: 3000 });
      }
    }
  };

  const updateQuantity = (storeProductId: string, newQuantity: number) => {
    const item = cart.find((i) => i.storeProduct.id === storeProductId);
    if (!item) return;

    // Validar cantidad según tipo
    if (item.storeProduct.product.unitType === 'UNIT' && !Number.isInteger(newQuantity)) {
      toast.error('Cantidad debe ser entera para productos por unidad');
      return;
    }

    if (newQuantity <= 0) {
      removeFromCart(storeProductId);
      return;
    }

    // Validar stock disponible (incluyendo stock negativo o cero)
    if (item.storeProduct.stock !== null) {
      if (item.storeProduct.stock <= 0) {
        toast.error(`${item.storeProduct.product.name}: sin stock disponible`);
        return;
      }
      
      if (newQuantity > item.storeProduct.stock) {
        toast.error(`Stock insuficiente (disponible: ${item.storeProduct.stock})`);
        return;
      }
    }

    setCart(cart.map((i) =>
      i.storeProduct.id === storeProductId ? { ...i, quantity: newQuantity } : i
    ));
  };

  const removeFromCart = (storeProductId: string) => {
    setCart(cart.filter((i) => i.storeProduct.id !== storeProductId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.quantity * item.storeProduct.price, 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    // Validar que hay turno abierto
    if (!currentShift) {
      toast.error('Debes abrir un turno antes de realizar ventas');
      return;
    }

    // Abrir modal de pago
    setPaymentMethod('CASH');
    setAmountPaid('');
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    const total = getCartTotal();

    // Validaciones según método de pago
    if (paymentMethod === 'CASH') {
      const paid = parseFloat(amountPaid);
      if (isNaN(paid) || paid <= 0) {
        toast.error('Ingresa un monto válido');
        return;
      }
      if (paid < total) {
        toast.error('El monto pagado es menor al total');
        return;
      }
    }

    setProcessing(true);
    setShowPaymentModal(false);

    try {
      const checkoutData: any = {
        items: cart.map((item) => ({
          storeProductId: item.storeProduct.id,
          quantity: item.quantity,
          unitPrice: item.storeProduct.price,
        })),
        paymentMethod,
      };

      // Solo enviar amountPaid si es CASH
      if (paymentMethod === 'CASH') {
        checkoutData.amountPaid = parseFloat(amountPaid);
      }

      const res = await fetch('/api/sales/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutData),
      });

      const data = await res.json();

      if (!res.ok) {
        // Mostrar mensaje de error con detalles si es conflicto de stock
        if (data.code === 'INSUFFICIENT_STOCK' && data.details) {
          const { productName, available, requested } = data.details;
          toast.error(`${productName}: stock insuficiente`, {
            description: `Disponible: ${available} | Solicitado: ${requested}`,
            duration: 5000,
          });
        } else if (data.code === 'INVALID_QUANTITY' && data.details) {
          toast.error(data.message, {
            description: data.details.productName,
            duration: 4000,
          });
        } else {
          toast.error(data.message || 'Error al procesar venta');
        }
        setProcessing(false);
        return;
      }

      toast.success(`¡Venta completada! Total: S/ ${data.total.toFixed(2)}`);
      
      // Show sale complete modal
      setCompletedSale({ id: data.saleId, total: data.total });
      setShowSaleCompleteModal(true);
      
      clearCart();
      setProducts([]);
      setQuery('');
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Error de conexión');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AuthLayout storeName="Punto de Venta">
      <Toaster position="top-right" richColors />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">          {/* Banner de turno */}
          {!currentShift && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">Debes abrir turno para vender</p>
                  <p className="text-sm text-yellow-700">Las ventas requieren un turno activo</p>
                </div>
              </div>
              <button
                onClick={() => setShowOpenShiftModal(true)}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
              >
                Abrir Turno
              </button>
            </div>
          )}

          {/* Mini estado de turno */}
          {currentShift && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              <p className="text-sm text-green-800">
                <span className="font-medium">Turno abierto</span>
                {' • '}
                Caja inicial {formatMoney(currentShift.openingCash)}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Búsqueda y Productos */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Buscar producto por nombre, código..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full h-12 pl-10 pr-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-12 px-6 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Results */}
              {products.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-[#1F2A37]">
                      Resultados de búsqueda ({products.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {products.map((sp) => (
                      <div
                        key={sp.id}
                        className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-[#1F2A37]">
                            {sp.product.name}
                            {sp.product.brand && (
                              <span className="ml-2 text-sm text-gray-500">• {sp.product.brand}</span>
                            )}
                            {sp.product.content && (
                              <span className="ml-2 text-sm text-gray-500">• {sp.product.content}</span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            {sp.product.barcode || sp.product.internalSku}
                            {sp.stock !== null && (
                              <span className={`ml-3 font-medium ${
                                sp.stock <= 0 
                                  ? 'text-red-600' 
                                  : sp.stock <= 5 
                                  ? 'text-orange-600' 
                                  : ''
                              }`}>
                                Stock: {sp.stock}
                                {sp.stock <= 0 && ' (Sin stock)'}
                                {sp.stock > 0 && sp.stock <= 5 && ' (Bajo)'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-lg font-semibold text-[#16A34A]">
                              S/ {sp.price.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {sp.product.unitType === 'UNIT' ? 'por unidad' : 'por kg'}
                            </div>
                          </div>
                          <button
                            onClick={() => addToCart(sp)}
                            disabled={sp.stock !== null && sp.stock <= 0}
                            className="h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            {sp.stock !== null && sp.stock <= 0 ? 'Sin stock' : 'Agregar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!loading && query && products.length === 0 && (
                <div className="text-center py-12 text-[#6B7280]">
                  No se encontraron productos
                </div>
              )}
            </div>

            {/* Columna Derecha: Carrito */}
            <div className="lg:col-span-1">
              <div className="bg-white border border-gray-200 rounded-lg sticky top-4">
                <div className="px-4 py-3 bg-[#1F2A37] text-white rounded-t-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    <h3 className="font-medium">Carrito</h3>
                  </div>
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-sm hover:text-red-300 transition-colors"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="p-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Carrito vacío</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {cart.map((item) => (
                          <div
                            key={item.storeProduct.id}
                            className="border border-gray-200 rounded-lg p-3"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-[#1F2A37]">
                                  {item.storeProduct.product.name}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  S/ {item.storeProduct.price.toFixed(2)} {item.storeProduct.product.unitType === 'UNIT' ? 'c/u' : '/kg'}
                                </div>
                              </div>
                              <button
                                onClick={() => removeFromCart(item.storeProduct.id)}
                                className="text-red-600 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.storeProduct.id,
                                      item.quantity - (item.storeProduct.product.unitType === 'UNIT' ? 1 : 0.5)
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateQuantity(item.storeProduct.id, parseFloat(e.target.value))
                                  }
                                  step={item.storeProduct.product.unitType === 'UNIT' ? '1' : '0.1'}
                                  min="0.1"
                                  className="w-16 h-7 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#16A34A] text-sm"
                                />
                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.storeProduct.id,
                                      item.quantity + (item.storeProduct.product.unitType === 'UNIT' ? 1 : 0.5)
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-sm font-semibold text-[#1F2A37]">
                                S/ {(item.quantity * item.storeProduct.price).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Items</span>
                          <span>{getTotalItems()}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold text-[#1F2A37]">
                          <span>Total</span>
                          <span>S/ {getCartTotal().toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        onClick={handleCheckout}
                        disabled={processing || !currentShift}
                        className="w-full mt-4 h-12 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {processing ? 'Procesando...' : !currentShift ? 'Abrir turno para vender' : 'Finalizar Venta'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Pago */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Método de Pago</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-600 mb-1">Total a pagar</div>
              <div className="text-3xl font-bold text-gray-900">
                {formatMoney(getCartTotal())}
              </div>
            </div>

            {/* Selector de método */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Selecciona el método
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'CASH', label: 'Efectivo' },
                  { value: 'YAPE', label: 'Yape' },
                  { value: 'PLIN', label: 'Plin' },
                  { value: 'CARD', label: 'Tarjeta' },
                ].map((method) => (
                  <button
                    key={method.value}
                    onClick={() => {
                      setPaymentMethod(method.value as any);
                      if (method.value !== 'CASH') {
                        setAmountPaid('');
                      }
                    }}
                    className={`py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                      paymentMethod === method.value
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input para efectivo */}
            {paymentMethod === 'CASH' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pagó con (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmPayment()}
                />
                
                {/* Vuelto */}
                {amountPaid && parseFloat(amountPaid) >= getCartTotal() && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-700 mb-1">Vuelto</div>
                    <div className="text-2xl font-bold text-green-700">
                      {formatMoney(parseFloat(amountPaid) - getCartTotal())}
                    </div>
                  </div>
                )}

                {amountPaid && parseFloat(amountPaid) < getCartTotal() && parseFloat(amountPaid) > 0 && (
                  <div className="mt-3 text-sm text-red-600">
                    Monto insuficiente
                  </div>
                )}
              </div>
            )}

            {/* Mensaje para otros métodos */}
            {paymentMethod !== 'CASH' && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Pago registrado como <strong>{paymentMethod}</strong>
                </p>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir turno */}
      {showOpenShiftModal && (
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
                  onKeyDown={(e) => e.key === 'Enter' && handleOpenShift()}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOpenShiftModal(false);
                    setOpeningCash('');
                  }}
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

      {/* Sale Complete Modal */}
      {showSaleCompleteModal && completedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Venta Completada!</h3>
              <p className="text-3xl font-bold text-green-600">{formatMoney(completedSale.total)}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  window.open(`/receipt/${completedSale.id}`, '_blank');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir Ticket
              </button>

              <button
                onClick={() => {
                  setShowSaleCompleteModal(false);
                  setCompletedSale(null);
                }}
                className="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
