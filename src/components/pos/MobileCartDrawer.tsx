// src/components/pos/MobileCartDrawer.tsx
// ✅ MÓDULO 17.3: Drawer del carrito para mobile (<768px)
'use client';

import { X, ShoppingCart, Trash2, Plus, Minus, Tag, Scale } from 'lucide-react';
import { formatMoney } from '@/lib/money';

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
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  promotionType?: 'TWO_FOR_ONE' | 'PACK_PRICE' | 'HAPPY_HOUR' | null;
  promotionName?: string | null;
  promotionDiscount?: number;
  categoryPromoName?: string | null;
  categoryPromoType?: 'PERCENT' | 'AMOUNT' | null;
  categoryPromoDiscount?: number;
  volumePromoName?: string | null;
  volumePromoQty?: number | null;
  volumePromoDiscount?: number;
  nthPromoName?: string | null;
  nthPromoQty?: number | null;
  nthPromoPercent?: number | null;
  nthPromoDiscount?: number;
  // ✅ MÓDULO F1: Unidades avanzadas
  unitIdUsed?: string;
  unitCodeUsed?: string;
  quantityOriginal?: number;
  quantityBase?: number;
  conversionFactorUsed?: number;
}

interface MobileCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (storeProductId: string, delta: number) => void;
  onRemoveItem: (storeProductId: string) => void;
  onClearCart: () => void;
  onApplyDiscount: (storeProductId: string) => void;
  onFinalizeSale: () => void;
  appliedCoupon: { code: string; discount: number } | null;
  onRemoveCoupon: () => void;
  processing: boolean;
  // ✅ MÓDULO F1: Unidades avanzadas
  advancedUnitsEnabled?: boolean;
}

export default function MobileCartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onApplyDiscount,
  onFinalizeSale,
  appliedCoupon,
  onRemoveCoupon,
  processing,
  advancedUnitsEnabled = false,
}: MobileCartDrawerProps) {
  // Calcular subtotal sin descuentos
  const subtotal = cart.reduce((sum, item) => {
    const basePrice = Number(item.storeProduct.price) * item.quantity;
    return sum + basePrice;
  }, 0);

  // Calcular descuentos totales
  const totalDiscounts = cart.reduce((sum, item) => {
    const basePrice = Number(item.storeProduct.price) * item.quantity;
    let itemDiscounts = 0;

    // Descuento manual
    if (item.discountType && item.discountValue) {
      if (item.discountType === 'PERCENT') {
        itemDiscounts += (basePrice * item.discountValue) / 100;
      } else {
        itemDiscounts += item.discountValue;
      }
    }

    // Promoción automática
    if (item.promotionDiscount) {
      itemDiscounts += item.promotionDiscount;
    }

    // Promoción por categoría
    if (item.categoryPromoDiscount) {
      itemDiscounts += item.categoryPromoDiscount;
    }

    // Promoción por volumen
    if (item.volumePromoDiscount) {
      itemDiscounts += item.volumePromoDiscount;
    }

    // Promoción n-ésimo
    if (item.nthPromoDiscount) {
      itemDiscounts += item.nthPromoDiscount;
    }

    return sum + itemDiscounts;
  }, 0);

  // Descuento de cupón
  const couponDiscount = appliedCoupon?.discount || 0;

  // Total final
  const total = Math.max(0, subtotal - totalDiscounts - couponDiscount);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50
          transform transition-transform duration-300 ease-out
          max-h-[85vh] flex flex-col
          lg:hidden
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-gray-900">
              Carrito ({cart.length})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                onClick={onClearCart}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Limpiar carrito"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lista de items - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => {
              const basePrice = Number(item.storeProduct.price) * item.quantity;
              let itemTotal = basePrice;

              // Aplicar descuentos
              if (item.discountType && item.discountValue) {
                if (item.discountType === 'PERCENT') {
                  itemTotal -= (basePrice * item.discountValue) / 100;
                } else {
                  itemTotal -= item.discountValue;
                }
              }

              if (item.promotionDiscount) {
                itemTotal -= item.promotionDiscount;
              }

              if (item.categoryPromoDiscount) {
                itemTotal -= item.categoryPromoDiscount;
              }

              if (item.volumePromoDiscount) {
                itemTotal -= item.volumePromoDiscount;
              }

              if (item.nthPromoDiscount) {
                itemTotal -= item.nthPromoDiscount;
              }

              const hasDiscount = item.discountType || item.promotionName || 
                                  item.categoryPromoName || item.volumePromoName || 
                                  item.nthPromoName;

              return (
                <div
                  key={item.storeProduct.id}
                  className="bg-white border rounded-xl p-4 shadow-sm"
                >
                  {/* Nombre y precio */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-base leading-tight">
                        {item.storeProduct.product.name}
                      </h3>
                      {item.storeProduct.product.brand && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {item.storeProduct.product.brand}
                        </p>
                      )}
                      <p className="text-sm text-emerald-600 font-medium mt-1">
                        {formatMoney(Number(item.storeProduct.price))} × {item.quantity}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item.storeProduct.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Promociones/Descuentos */}
                  {hasDiscount && (
                    <div className="mb-3 space-y-1">
                      {item.promotionName && (
                        <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{item.promotionName}</span>
                        </div>
                      )}
                      {item.categoryPromoName && (
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{item.categoryPromoName}</span>
                        </div>
                      )}
                      {item.volumePromoName && (
                        <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{item.volumePromoName}</span>
                        </div>
                      )}
                      {item.nthPromoName && (
                        <div className="flex items-center gap-1.5 text-xs text-pink-600 bg-pink-50 px-2 py-1 rounded">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{item.nthPromoName}</span>
                        </div>
                      )}
                      {item.discountType && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                          <Tag className="w-3.5 h-3.5" />
                          <span>
                            Desc. manual: {item.discountType === 'PERCENT' 
                              ? `${item.discountValue}%` 
                              : formatMoney(item.discountValue || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Controles de cantidad + Total */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(item.storeProduct.id, -1)}
                        className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        aria-label="Disminuir"
                      >
                        <Minus className="w-5 h-5 text-gray-700" />
                      </button>
                      <span className="w-12 text-center font-semibold text-lg">
                        {item.quantityOriginal ?? item.quantity}
                        {item.unitCodeUsed && advancedUnitsEnabled && (
                          <span className="ml-1 text-xs text-gray-500">
                            {item.unitCodeUsed}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.storeProduct.id, 1)}
                        className="w-11 h-11 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                        aria-label="Aumentar"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="text-right">
                      {hasDiscount && (
                        <p className="text-xs text-gray-400 line-through">
                          {formatMoney(basePrice)}
                        </p>
                      )}
                      <p className="text-lg font-bold text-gray-900">
                        {formatMoney(itemTotal)}
                      </p>
                    </div>
                  </div>

                  {/* Unit Conversion Info - MÓDULO F1 */}
                  {advancedUnitsEnabled && item.unitCodeUsed && item.quantityBase !== item.quantityOriginal && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                      <Scale className="w-3 h-3" />
                      <span>→ {item.quantityBase} {item.storeProduct.product.unitType}</span>
                    </div>
                  )}

                  {/* Botón descuento */}
                  {!item.discountType && (
                    <button
                      onClick={() => onApplyDiscount(item.storeProduct.id)}
                      className="w-full mt-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      + Aplicar descuento
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer - sticky */}
        {cart.length > 0 && (
          <div className="border-t bg-gray-50 p-4 space-y-3">
            {/* Cupón */}
            {appliedCoupon && (
              <div className="flex items-center justify-between bg-yellow-50 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-yellow-600" />
                  <div>
                    <p className="text-xs text-yellow-600 font-medium">
                      Cupón: {appliedCoupon.code}
                    </p>
                    <p className="text-sm font-semibold text-yellow-700">
                      -{formatMoney(appliedCoupon.discount)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onRemoveCoupon}
                  className="p-1.5 text-yellow-600 hover:bg-yellow-100 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Totales */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatMoney(subtotal)}</span>
              </div>
              {(totalDiscounts > 0 || couponDiscount > 0) && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Descuentos:</span>
                  <span className="font-medium">
                    -{formatMoney(totalDiscounts + couponDiscount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span className="text-gray-900">Total:</span>
                <span className="text-emerald-600">{formatMoney(total)}</span>
              </div>
            </div>

            {/* Botón finalizar */}
            <button
              onClick={onFinalizeSale}
              disabled={processing || cart.length === 0}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-lg shadow-lg"
            >
              {processing ? 'Procesando...' : 'Finalizar Venta'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
