// src/components/pos/CartPanel.tsx
// ✅ MÓDULO 18.3: Panel del carrito rediseñado con estilo Stitch
// ✅ MÓDULO F2.2: Selector de unidades integrado
'use client';

import React, { useState, useEffect, useCallback, memo } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, Tag, X, CreditCard, Banknote, Scale, ChevronDown } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import Image from 'next/image';

// ✅ F2.2: Tipos para unidades
interface UnitOption {
  id: string;
  code: string;
  name: string;
  symbol: string;
  factor: number;
  allowsDecimals: boolean;
  isBase: boolean;
}

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
    imageUrl?: string | null;
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
  // ✅ MÓDULO F2.3: Precio por unidad de venta
  sellUnitPriceApplied?: number;
}

interface CartPanelProps {
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
  onUpdateItemUnit?: (storeProductId: string, newQuantity: number, unitId: string, quantityBase: number, factor: number, unitCode?: string) => void;
}

// ✅ MÓDULO F2.2: Cache de unidades por producto
const unitsCache = new Map<string, { units: UnitOption[]; baseUnit: UnitOption | null } | null>();

// ✅ MÓDULO F2.2: Componente interno para selector de unidades
function UnitDropdown({
  productMasterId,
  storeProductId,
  currentQuantity,
  currentUnitId,
  onUnitChange,
}: {
  productMasterId: string;
  storeProductId: string;
  currentQuantity: number;
  currentUnitId?: string;
  onUnitChange: (storeProductId: string, quantity: number, unitId: string, quantityBase: number, factor: number, unitCode: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [baseUnit, setBaseUnit] = useState<UnitOption | null>(null);

  // Cargar unidades (con cache)
  useEffect(() => {
    const fetchUnits = async () => {
      // Check cache first
      if (unitsCache.has(productMasterId)) {
        const cached = unitsCache.get(productMasterId);
        if (cached) {
          setUnits(cached.units);
          setBaseUnit(cached.baseUnit);
        }
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/pos/units?productMasterId=${productMasterId}`);
        if (!res.ok) throw new Error('Error');
        const data = await res.json();
        
        if (!data.enabled) {
          unitsCache.set(productMasterId, null);
          setLoading(false);
          return;
        }

        const base: UnitOption | null = data.baseUnit ? {
          id: data.baseUnit.id,
          code: data.baseUnit.code,
          name: data.baseUnit.name,
          symbol: data.baseUnit.symbol || data.baseUnit.code,
          factor: 1,
          allowsDecimals: data.baseUnit.allowDecimals ?? false,
          isBase: true,
        } : null;

        const available: UnitOption[] = (data.availableUnits || []).map((u: any) => ({
          id: u.id,
          code: u.code,
          name: u.name,
          symbol: u.symbol || u.code,
          factor: u.factor,
          allowsDecimals: u.allowsDecimals ?? false,
          isBase: false,
        }));

        // Agregar unidad base a las opciones
        const allUnits = base ? [base, ...available] : available;
        
        unitsCache.set(productMasterId, { units: allUnits, baseUnit: base });
        setUnits(allUnits);
        setBaseUnit(base);
      } catch {
        unitsCache.set(productMasterId, null);
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, [productMasterId]);

  // Si no hay unidades alternativas (solo base), no mostrar dropdown
  if (loading || units.length <= 1) {
    return null;
  }

  const currentUnit = units.find(u => u.id === currentUnitId) || baseUnit;
  
  const handleSelectUnit = (unit: UnitOption) => {
    setIsOpen(false);
    const quantityBase = currentQuantity * unit.factor;
    onUnitChange(storeProductId, currentQuantity, unit.id, quantityBase, unit.factor, unit.code);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
      >
        <Scale className="w-3 h-3" />
        <span>{currentUnit?.symbol || 'UN'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[140px]">
          {units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => handleSelectUnit(unit)}
              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${
                currentUnit?.id === unit.id ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="font-medium">{unit.symbol}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {unit.isBase ? '(base)' : `×${unit.factor}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CartPanelComponent({
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
  onUpdateItemUnit,
}: CartPanelProps) {
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
  
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="hidden md:flex md:flex-col h-full w-96 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-light dark:border-border-dark shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-text-main dark:text-white">Carrito</h2>
          {cart.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
            >
              Vaciar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-400">
          <ShoppingCart className="w-4 h-4" />
          <span>{totalItems} {totalItems === 1 ? 'producto' : 'productos'}</span>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-background-light dark:bg-background-dark border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center mb-4">
              <ShoppingCart className="w-10 h-10 text-text-secondary dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-text-main dark:text-white mb-1">
              Carrito vacío
            </p>
            <p className="text-xs text-text-secondary dark:text-gray-400">
              Selecciona productos para comenzar
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => {
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
                                  item.nthPromoName || item.sellUnitPriceApplied;

              return (
                <div
                  key={item.storeProduct.id}
                  className="flex gap-3 p-3 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark"
                >
                  {/* Product Image */}
                  <div className="relative w-16 h-16 rounded-lg bg-surface-light dark:bg-surface-dark overflow-hidden flex-shrink-0">
                    {item.storeProduct.product.imageUrl ? (
                      <Image
                        src={item.storeProduct.product.imageUrl}
                        alt={item.storeProduct.product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <ShoppingCart className="w-6 h-6 text-text-secondary/30 dark:text-gray-600" />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-text-main dark:text-white line-clamp-2 mb-1">
                      {item.storeProduct.product.name}
                    </h3>
                    {item.storeProduct.product.brand && (
                      <p className="text-xs text-text-secondary dark:text-gray-400 truncate mb-2">
                        {item.storeProduct.product.brand}
                      </p>
                    )}

                    {/* Promociones/Descuentos */}
                    {hasDiscount && (
                      <div className="mb-2 space-y-1">
                        {item.promotionName && (
                          <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3" />
                            <span className="truncate">{item.promotionName}</span>
                          </div>
                        )}
                        {item.categoryPromoName && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3" />
                            <span className="truncate">{item.categoryPromoName}</span>
                          </div>
                        )}
                        {item.volumePromoName && (
                          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3" />
                            <span className="truncate">{item.volumePromoName}</span>
                          </div>
                        )}
                        {item.nthPromoName && (
                          <div className="flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3" />
                            <span className="truncate">{item.nthPromoName}</span>
                          </div>
                        )}
                        {item.discountType && (
                          <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded">
                            <Tag className="w-3 h-3" />
                            <span className="truncate">
                              Desc: {item.discountType === 'PERCENT' 
                                ? `${item.discountValue}%` 
                                : formatMoney(item.discountValue || 0)}
                            </span>
                          </div>
                        )}
                        {/* ✅ MÓDULO F2.3: Badge de precio por presentación */}
                        {item.sellUnitPriceApplied && item.unitCodeUsed && (
                          <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded">
                            <Scale className="w-3 h-3" />
                            <span className="truncate">
                              Precio {item.unitCodeUsed}: {formatMoney(item.sellUnitPriceApplied)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 bg-surface-light dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark">
                        <button
                          onClick={() => onUpdateQuantity(item.storeProduct.id, -1)}
                          className="p-1.5 hover:bg-background-light dark:hover:bg-background-dark rounded-l-lg transition-colors"
                        >
                          <Minus className="w-4 h-4 text-text-secondary dark:text-gray-400" />
                        </button>
                        <span className="px-2 text-sm font-semibold text-text-main dark:text-white min-w-[2rem] text-center">
                          {item.quantityOriginal ?? item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.storeProduct.id, 1)}
                          className="p-1.5 hover:bg-background-light dark:hover:bg-background-dark rounded-r-lg transition-colors"
                        >
                          <Plus className="w-4 h-4 text-text-secondary dark:text-gray-400" />
                        </button>
                      </div>
                      
                      {/* ✅ MÓDULO F2.2: Selector de unidad */}
                      {advancedUnitsEnabled && onUpdateItemUnit && (
                        <UnitDropdown
                          productMasterId={item.storeProduct.product.id}
                          storeProductId={item.storeProduct.id}
                          currentQuantity={item.quantityOriginal ?? item.quantity}
                          currentUnitId={item.unitIdUsed}
                          onUnitChange={onUpdateItemUnit}
                        />
                      )}
                      
                      <button
                        onClick={() => onRemoveItem(item.storeProduct.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Unit Conversion Info - MÓDULO F2.2 */}
                    {advancedUnitsEnabled && item.conversionFactorUsed && item.conversionFactorUsed !== 1 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded">
                        <Scale className="w-3 h-3" />
                        <span>
                          {item.quantityOriginal} {item.unitCodeUsed || 'UN'} → {item.quantityBase} base
                        </span>
                      </div>
                    )}

                    {/* Price */}
                    <div className="mt-2 text-right">
                      {hasDiscount && (
                        <p className="text-xs text-text-secondary dark:text-gray-400 line-through">
                          {formatMoney(basePrice)}
                        </p>
                      )}
                      <p className="text-sm font-bold text-primary">
                        {formatMoney(itemTotal)}
                      </p>
                    </div>

                    {/* Botón descuento */}
                    {!item.discountType && (
                      <button
                        onClick={() => onApplyDiscount(item.storeProduct.id)}
                        className="w-full mt-2 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors font-medium"
                      >
                        + Aplicar descuento
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer - Totals & Checkout */}
      {cart.length > 0 && (
        <div className="px-6 py-4 border-t border-border-light dark:border-border-dark space-y-4 shrink-0">
          {/* Cupón */}
          {appliedCoupon && (
            <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg border border-yellow-200 dark:border-yellow-900/50">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                    Cupón: {appliedCoupon.code}
                  </p>
                  <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                    -{formatMoney(appliedCoupon.discount)}
                  </p>
                </div>
              </div>
              <button
                onClick={onRemoveCoupon}
                className="p-1.5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-950/50 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary dark:text-gray-400">Subtotal</span>
              <span className="font-semibold text-text-main dark:text-white">
                {formatMoney(subtotal)}
              </span>
            </div>
            {(totalDiscounts > 0 || couponDiscount > 0) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-600 dark:text-red-400">Descuentos</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  -{formatMoney(totalDiscounts + couponDiscount)}
                </span>
              </div>
            )}
            <div className="h-px bg-border-light dark:bg-border-dark" />
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-text-main dark:text-white">Total</span>
              <span className="text-2xl font-bold text-primary">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          {/* Checkout Buttons */}
          <div className="space-y-2">
            <button
              onClick={onFinalizeSale}
              disabled={processing || cart.length === 0}
              className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  <span>Cobrar</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ MÓDULO 18.2: React.memo para evitar re-renders innecesarios
// Solo re-renderiza si cart, processing o appliedCoupon cambian
export default memo(CartPanelComponent);
