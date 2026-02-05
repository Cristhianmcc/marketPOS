'use client';

import { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { toast } from 'sonner';

interface ProductMaster {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  content: string | null;
  category: string;
  unitType: 'UNIT' | 'KG';
  imageUrl: string | null;
}

interface Store {
  id: string;
  name: string;
}

interface ImportProductModalProps {
  product: ProductMaster;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: any;
}

export function ImportProductModal({
  product,
  onClose,
  onSuccess,
  currentUser,
}: ImportProductModalProps) {
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [loadingStores, setLoadingStores] = useState(false);

  // Si el usuario es SUPERADMIN, cargar lista de tiendas
  useEffect(() => {
    // Verificar si es SUPERADMIN por el flag que viene del backend
    if (currentUser?.isSuperAdmin) {
      loadStores();
    } else if (currentUser?.store_id) {
      setSelectedStoreId(currentUser.store_id);
    }
  }, [currentUser]);

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setLoadingStores(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!price || parseFloat(price) <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }

    // SUPERADMIN debe seleccionar tienda
    if (currentUser?.isSuperAdmin && !selectedStoreId) {
      toast.error('Selecciona una tienda');
      return;
    }

    setLoading(true);

    try {
      const body: any = {
        productMasterId: product.id,
        price: parseFloat(price),
        active,
      };

      // Si es SUPERADMIN, agregar store_id al body
      if (currentUser?.isSuperAdmin && selectedStoreId) {
        body.targetStoreId = selectedStoreId;
      }

      // Solo agregar stock si el producto es de tipo UNIT
      if (product.unitType === 'UNIT') {
        if (stock) {
          body.stock = parseFloat(stock);
        }
        if (minStock) {
          body.minStock = parseFloat(minStock);
        }
      } else {
        // Para KG, stock es null
        body.stock = null;
        body.minStock = null;
      }

      const res = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
      } else {
        toast.error(data.error || 'Error al importar producto');
      }
    } catch (error) {
      console.error('Error importing product:', error);
      toast.error('Error al importar producto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Importar Producto
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Selector de Tienda (solo SUPERADMIN) */}
          {currentUser?.isSuperAdmin && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tienda de Destino *
              </label>
              {loadingStores ? (
                <p className="text-sm text-gray-500">Cargando tiendas...</p>
              ) : (
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecciona una tienda</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Producto Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-16 h-16 rounded object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded bg-gray-200 flex items-center justify-center">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{product.name}</h4>
                {product.brand && (
                  <p className="text-sm text-gray-600">{product.brand}</p>
                )}
                {product.content && (
                  <p className="text-xs text-gray-500">{product.content}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {product.barcode ? `Código: ${product.barcode}` : 'Sin código'}
                </p>
              </div>
            </div>
          </div>

          {/* Precio */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio de Venta (S/) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="10.50"
              required
            />
          </div>

          {/* Stock (solo para UNIT) */}
          {product.unitType === 'UNIT' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stock Inicial
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Opcional. Puedes ajustarlo después.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stock Mínimo
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Alerta cuando el stock esté bajo.
                </p>
              </div>
            </>
          )}

          {product.unitType === 'KG' && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                ℹ️ Este producto se vende por kilogramo. No requiere control de
                stock.
              </p>
            </div>
          )}

          {/* Activo */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Producto activo (visible en POS)
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Importando...' : 'Importar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
