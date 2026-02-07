/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.3 — ProductSellUnitPricesModal
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Modal para configurar precios especiales por presentación (unidad de venta).
 * Solo visible para OWNER con flag ENABLE_SELLUNIT_PRICING.
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Tag, RefreshCw } from 'lucide-react';
import { SellUnitPriceManager } from './SellUnitPriceManager';

interface Unit {
  id: string;
  sunatCode: string | null;
  displayName: string | null;
  symbol: string | null;
}

interface ProductSellUnitPricesModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeProductId: string;
  productId: string;
  productName: string;
  basePrice: number;
}

export function ProductSellUnitPricesModal({
  isOpen,
  onClose,
  storeProductId,
  productId,
  productName,
  basePrice,
}: ProductSellUnitPricesModalProps) {
  const [loading, setLoading] = useState(true);
  const [baseUnit, setBaseUnit] = useState<Unit | null>(null);

  useEffect(() => {
    if (isOpen && productId) {
      loadBaseUnit();
    }
  }, [isOpen, productId]);

  const loadBaseUnit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/units/products/${productId}/base-unit`);
      if (res.ok) {
        const data = await res.json();
        setBaseUnit(data.baseUnit || null);
      }
    } catch (err) {
      console.error('Error loading base unit:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-green-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Tag className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Precios por Presentación
              </h2>
              <p className="text-sm text-gray-500">{productName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <SellUnitPriceManager
              productMasterId={productId}
              productName={productName}
              baseUnit={baseUnit}
              basePrice={basePrice}
              compact
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
