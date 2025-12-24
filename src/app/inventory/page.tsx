'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Plus, Search, Edit, TrendingUp, Power } from 'lucide-react';
import { CreateProductModal } from '@/components/inventory/CreateProductModal';
import { EditPriceModal } from '@/components/inventory/EditPriceModal';
import { StockMovementModal } from '@/components/inventory/StockMovementModal';
import { toast, Toaster } from 'sonner';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  content: string | null;
  barcode: string | null;
  internalSku: string;
  unitType: 'UNIT' | 'KG';
}

interface StoreProduct {
  id: string;
  price: number;
  stock: number | null;
  minStock: number | null;
  active: boolean;
  product: Product;
}

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState<boolean | null>(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editPriceModal, setEditPriceModal] = useState<{
    open: boolean;
    storeProduct?: StoreProduct;
  }>({ open: false });
  const [stockModal, setStockModal] = useState<{
    open: boolean;
    storeProduct?: StoreProduct;
  }>({ open: false });

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadProducts();
    }
  }, [user, searchQuery, categoryFilter, lowStockFilter, activeFilter]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (categoryFilter) params.append('category', categoryFilter);
      if (lowStockFilter) params.append('lowStock', 'true');
      if (activeFilter !== null) params.append('active', activeFilter.toString());

      const res = await fetch(`/api/inventory?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (storeProduct: StoreProduct) => {
    try {
      const res = await fetch(`/api/store-products/${storeProduct.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !storeProduct.active }),
      });

      if (res.ok) {
        toast.success(storeProduct.active ? 'Producto desactivado' : 'Producto activado');
        loadProducts();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al cambiar estado');
      }
    } catch (error) {
      console.error('Error toggling active:', error);
      toast.error('Error de conexión');
    }
  };

  const categories = Array.from(new Set(products.map((p) => p.product.category))).filter(
    Boolean
  );

  const isOwner = user?.role === 'OWNER';

  return (
    <AuthLayout storeName="Inventario">
      <Toaster position="top-right" richColors />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2A37]">Gestión de Inventario</h1>
              <p className="text-sm text-gray-500 mt-1">{products.length} productos en tu tienda</p>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/inventory/import')}
                  className="h-10 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Importar CSV
                </button>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Producto
                </button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, código..."
                  className="w-full h-10 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lowStock"
                  checked={lowStockFilter}
                  onChange={(e) => setLowStockFilter(e.target.checked)}
                  className="w-4 h-4 text-[#16A34A] border-gray-300 rounded focus:ring-[#16A34A]"
                />
                <label htmlFor="lowStock" className="text-sm text-[#1F2A37]">
                  Stock bajo
                </label>
              </div>

              <select
                value={activeFilter === null ? '' : activeFilter.toString()}
                onChange={(e) =>
                  setActiveFilter(e.target.value === '' ? null : e.target.value === 'true')
                }
                className="h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
                <option value="">Todos</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Cargando productos...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">
                {searchQuery || categoryFilter || lowStockFilter
                  ? 'No se encontraron productos con esos filtros'
                  : 'No tienes productos en tu inventario'}
              </p>
              {isOwner && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] transition-colors"
                >
                  Crear primer producto
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Código
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Unidad
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Precio
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Stock
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Estado
                      </th>
                      {isOwner && (
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map((sp) => {
                      const isLowStock =
                        sp.product.unitType === 'UNIT' &&
                        sp.stock !== null &&
                        sp.minStock !== null &&
                        sp.stock <= sp.minStock;

                      return (
                        <tr key={sp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-[#1F2A37]">
                                {sp.product.name}
                              </div>
                              {sp.product.brand && (
                                <div className="text-xs text-gray-500">
                                  {sp.product.brand}
                                  {sp.product.content && ` • ${sp.product.content}`}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{sp.product.category}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-600 font-mono">
                              {sp.product.barcode || sp.product.internalSku}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-700">
                              {sp.product.unitType === 'UNIT' ? 'Unidad' : 'KG'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-[#1F2A37]">
                            S/ {sp.price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {sp.stock !== null ? (
                              <span
                                className={`text-sm font-medium ${
                                  isLowStock ? 'text-red-600' : 'text-[#1F2A37]'
                                }`}
                              >
                                {sp.stock}
                                {sp.minStock !== null && (
                                  <span className="text-xs text-gray-500 ml-1">/ {sp.minStock}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                sp.active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {sp.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          {isOwner && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setEditPriceModal({ open: true, storeProduct: sp })}
                                  className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                                  title="Editar precio"
                                >
                                  <Edit className="w-4 h-4 text-gray-600" />
                                </button>
                                <button
                                  onClick={() => setStockModal({ open: true, storeProduct: sp })}
                                  className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                                  title="Movimiento de stock"
                                >
                                  <TrendingUp className="w-4 h-4 text-gray-600" />
                                </button>
                                <button
                                  onClick={() => handleToggleActive(sp)}
                                  className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                                  title={sp.active ? 'Desactivar' : 'Activar'}
                                >
                                  <Power
                                    className={`w-4 h-4 ${
                                      sp.active ? 'text-green-600' : 'text-gray-400'
                                    }`}
                                  />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateProductModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          toast.success('Producto creado exitosamente');
          loadProducts();
        }}
      />

      {editPriceModal.open && editPriceModal.storeProduct && (
        <EditPriceModal
          isOpen={editPriceModal.open}
          onClose={() => setEditPriceModal({ open: false })}
          onSuccess={() => {
            toast.success('Precio actualizado');
            loadProducts();
          }}
          storeProduct={editPriceModal.storeProduct}
        />
      )}

      {stockModal.open && stockModal.storeProduct && (
        <StockMovementModal
          isOpen={stockModal.open}
          onClose={() => setStockModal({ open: false })}
          onSuccess={() => {
            toast.success('Stock actualizado');
            loadProducts();
          }}
          storeProduct={stockModal.storeProduct}
        />
      )}
    </AuthLayout>
  );
}
