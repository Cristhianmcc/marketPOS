'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface ConfigureStoreProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: {
    id: string;
    name: string;
    unitType: 'UNIT' | 'KG';
  };
}

export function ConfigureStoreProductModal({
  isOpen,
  onClose,
  onSuccess,
  product,
}: ConfigureStoreProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    price: '',
    stock: '',
    minStock: '',
    active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        productId: product.id,
        price: parseFloat(formData.price),
        stock: formData.stock ? parseInt(formData.stock) : null,
        minStock: formData.minStock ? parseInt(formData.minStock) : null,
        active: formData.active,
      };

      const res = await fetch('/api/store-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al configurar producto');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error configuring product:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      price: '',
      stock: '',
      minStock: '',
      active: true,
    });
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2A37]">
              Configurar para mi tienda
            </h2>
            <p className="text-sm text-gray-500 mt-1">{product.name}</p>
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
              Precio (S/) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="0.00"
            />
          </div>

          {product.unitType === 'UNIT' && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock inicial *
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  required={product.unitType === 'UNIT'}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Productos por unidad requieren stock
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock mínimo
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="0"
                />
              </div>
            </>
          )}

          {product.unitType === 'KG' && (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                Productos por kilogramo no requieren stock obligatorio. Puedes gestionarlo
                opcionalmente.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 text-[#16A34A] border-gray-300 rounded focus:ring-[#16A34A]"
            />
            <label htmlFor="active" className="text-sm text-[#1F2A37]">
              Producto activo
            </label>
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
              {loading ? 'Configurando...' : 'Configurar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
