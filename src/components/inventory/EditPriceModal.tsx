'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface EditPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeProduct: {
    id: string;
    price: number;
    product?: {
      name: string;
    };
  };
}

export function EditPriceModal({
  isOpen,
  onClose,
  onSuccess,
  storeProduct,
}: EditPriceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [price, setPrice] = useState(storeProduct.price.toString());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/store-products/${storeProduct.id}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: parseFloat(price) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al actualizar precio');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating price:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2A37]">Editar Precio</h2>
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
              Precio actual
            </label>
            <div className="text-2xl font-semibold text-[#1F2A37]">
              S/ {storeProduct.price.toFixed(2)}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Nuevo precio (S/) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="0.00"
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
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
