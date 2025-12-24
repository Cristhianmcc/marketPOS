'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeProduct: {
    id: string;
    stock: number | null;
    product?: {
      name: string;
      unitType: 'UNIT' | 'KG';
    };
  };
}

export function StockMovementModal({
  isOpen,
  onClose,
  onSuccess,
  storeProduct,
}: StockMovementModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<'PURCHASE' | 'ADJUSTMENT'>('PURCHASE');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const qty = parseFloat(quantity);
      const payload = {
        type,
        quantity: type === 'ADJUSTMENT' && qty > 0 ? qty : qty,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        total: unitPrice && quantity ? parseFloat(unitPrice) * parseFloat(quantity) : null,
        notes: notes || null,
      };

      const res = await fetch(`/api/store-products/${storeProduct.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al actualizar stock');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error updating stock:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setType('PURCHASE');
    setQuantity('');
    setUnitPrice('');
    setNotes('');
    setError('');
  };

  if (!isOpen) return null;

  const isUnit = storeProduct.product?.unitType === 'UNIT';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2A37]">
              Movimiento de Stock
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {storeProduct.product?.name || 'Producto'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Stock actual
            </label>
            <div className="text-2xl font-semibold text-[#1F2A37]">
              {storeProduct.stock !== null ? (
                <>
                  {storeProduct.stock} {isUnit ? 'unidades' : 'kg'}
                </>
              ) : (
                'N/A'
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Tipo de movimiento *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'PURCHASE' | 'ADJUSTMENT')}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              <option value="PURCHASE">Entrada (Compra)</option>
              <option value="ADJUSTMENT">Ajuste</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {type === 'PURCHASE'
                ? 'Ingreso de mercadería nueva'
                : 'Corrección de stock (positivo/negativo)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Cantidad *
            </label>
            <input
              type="number"
              step={isUnit ? '1' : '0.01'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder={
                type === 'ADJUSTMENT' ? 'Positivo o negativo' : isUnit ? '1' : '0.00'
              }
            />
            {isUnit && (
              <p className="text-xs text-gray-500 mt-1">
                Productos por unidad deben ser enteros
              </p>
            )}
          </div>

          {type === 'PURCHASE' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                Precio unitario (S/)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                placeholder="Opcional"
              />
            </div>
          )}

          {unitPrice && quantity && (
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total:</span>
                <span className="font-semibold text-[#1F2A37]">
                  S/ {(parseFloat(unitPrice) * parseFloat(quantity)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A] resize-none"
              placeholder="Observaciones opcionales"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Guardando...' : 'Aplicar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
