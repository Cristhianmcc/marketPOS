'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProductModal({ isOpen, onClose, onSuccess }: CreateProductModalProps) {
  const [tab, setTab] = useState<'with-code' | 'without-code'>('with-code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    unitType: 'UNIT' as 'UNIT' | 'KG',
    category: 'Abarrotes',
    brand: '',
    content: '',
    barcode: '',
    price: '',
    stock: '',
    minStock: '',
  });

  const categories = [
    'Abarrotes',
    'Bebidas',
    'Lácteos',
    'Carnes',
    'Frutas y Verduras',
    'Panadería',
    'Snacks',
    'Limpieza',
    'Cuidado Personal',
    'Otros',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validar precio
      const price = parseFloat(formData.price);
      if (isNaN(price) || price <= 0) {
        setError('El precio debe ser mayor a 0');
        setLoading(false);
        return;
      }

      // Validar stock si es UNIT
      if (formData.unitType === 'UNIT' && formData.stock) {
        const stock = parseFloat(formData.stock);
        if (!Number.isInteger(stock)) {
          setError('El stock para productos por UNIDAD debe ser un número entero');
          setLoading(false);
          return;
        }
      }

      // Paso 1: Crear producto en catálogo maestro
      const productPayload = {
        name: formData.name,
        unitType: formData.unitType,
        category: formData.category,
        barcode: tab === 'with-code' && formData.barcode ? formData.barcode : null,
        brand: formData.brand || null,
        content: formData.content || null,
      };

      const productRes = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productPayload),
      });

      const productData = await productRes.json();

      if (!productRes.ok) {
        setError(productData.error || 'Error al crear producto');
        setLoading(false);
        return;
      }

      // Paso 2: Configurar producto para la tienda
      const stock = formData.stock && formData.stock.trim() !== '' ? parseFloat(formData.stock) : null;
      const minStock = formData.minStock && formData.minStock.trim() !== '' ? parseFloat(formData.minStock) : null;

      const storeProductPayload = {
        productId: productData.product.id,
        price,
        stock,
        minStock,
        active: true,
      };

      const storeRes = await fetch('/api/store-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeProductPayload),
      });

      if (!storeRes.ok) {
        const storeData = await storeRes.json();
        setError(storeData.error || 'Error al configurar producto en tienda');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error creating product:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      unitType: 'UNIT',
      category: 'Abarrotes',
      brand: '',
      content: '',
      barcode: '',
      price: '',
      stock: '',
      minStock: '',
    });
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#1F2A37]">Nuevo Producto</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('with-code')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'with-code'
                ? 'text-[#16A34A] border-b-2 border-[#16A34A]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Con código de barras
          </button>
          <button
            onClick={() => setTab('without-code')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'without-code'
                ? 'text-[#16A34A] border-b-2 border-[#16A34A]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sin código
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Ej: Arroz Extra"
            />
          </div>

          {tab === 'with-code' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                Código de barras *
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                required={tab === 'with-code'}
                pattern="[0-9]{8,14}"
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                placeholder="8-14 dígitos numéricos"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Tipo de unidad *
            </label>
            <select
              value={formData.unitType}
              onChange={(e) =>
                setFormData({ ...formData, unitType: e.target.value as 'UNIT' | 'KG' })
              }
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              <option value="UNIT">Unidad</option>
              <option value="KG">Kilogramo (kg)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Categoría *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Marca
            </label>
            <input
              type="text"
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Contenido
            </label>
            <input
              type="text"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Ej: 1kg, 500ml"
            />
          </div>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <p className="text-sm font-medium text-[#1F2A37] mb-3">Configuración para tu tienda</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Precio de venta (S/) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="Ej: 2.50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock inicial {formData.unitType === 'KG' ? '(Opcional)' : ''}
                </label>
                <input
                  type="number"
                  step={formData.unitType === 'UNIT' ? '1' : '0.01'}
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder={formData.unitType === 'UNIT' ? 'Ej: 100' : 'Ej: 25.5'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock mínimo (Opcional)
                </label>
                <input
                  type="number"
                  step={formData.unitType === 'UNIT' ? '1' : '0.01'}
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="Para alertas de stock bajo"
                />
              </div>
            </div>
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
              {loading ? 'Creando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
