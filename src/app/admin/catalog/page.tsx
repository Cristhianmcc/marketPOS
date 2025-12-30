'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Search, Plus, Package, ShoppingCart, Filter } from 'lucide-react';
import { ImportProductModal } from '@/components/catalog/ImportProductModal';
import { toast, Toaster } from 'sonner';

interface ProductMaster {
  id: string;
  barcode: string | null;
  internalSku: string;
  name: string;
  brand: string | null;
  content: string | null;
  category: string;
  unitType: 'UNIT' | 'KG';
  imageUrl: string | null;
  isGlobal: boolean;
  alreadyImported: boolean;
  createdByStore?: {
    name: string;
  };
  createdAt: string;
}

export default function CatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitTypeFilter, setUnitTypeFilter] = useState('');
  const [hasBarcodeFilter, setHasBarcodeFilter] = useState('');
  const [importModal, setImportModal] = useState<{
    open: boolean;
    product?: ProductMaster;
  }>({ open: false });

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user && user.role === 'OWNER') {
      loadCatalog();
    }
  }, [user, searchQuery, categoryFilter, unitTypeFilter, hasBarcodeFilter]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        if (data.user.role !== 'OWNER') {
          router.push('/pos');
        }
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      router.push('/login');
    }
  };

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (categoryFilter) params.append('category', categoryFilter);
      if (unitTypeFilter) params.append('unitType', unitTypeFilter);
      if (hasBarcodeFilter) params.append('hasBarcode', hasBarcodeFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/catalog/global?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      } else {
        toast.error('Error al cargar catálogo');
      }
    } catch (error) {
      console.error('Error loading catalog:', error);
      toast.error('Error al cargar catálogo');
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = () => {
    setImportModal({ open: false });
    loadCatalog(); // Recargar para actualizar flags "alreadyImported"
    toast.success('Producto importado exitosamente');
  };

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  if (!user || user.role !== 'OWNER') {
    return null;
  }

  return (
    <AuthLayout>
      <div className="max-w-7xl mx-auto p-6">
        <Toaster position="top-center" richColors />

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-8 h-8 text-blue-600" />
                Catálogo Global
              </h1>
              <p className="text-gray-600 mt-1">
                Importa productos compartidos por otras tiendas
              </p>
            </div>
            <button
              onClick={() => router.push('/inventory')}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Volver a Inventario
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Categoría */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Tipo de Unidad */}
            <select
              value={unitTypeFilter}
              onChange={(e) => setUnitTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos los tipos</option>
              <option value="UNIT">Unidad</option>
              <option value="KG">Kilogramo</option>
            </select>

            {/* Con/Sin Barcode */}
            <select
              value={hasBarcodeFilter}
              onChange={(e) => setHasBarcodeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Con o sin código</option>
              <option value="true">Solo con código de barras</option>
              <option value="false">Solo sin código de barras</option>
            </select>
          </div>
        </div>

        {/* Tabla de productos */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando catálogo...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No hay productos en el catálogo
            </h3>
            <p className="text-gray-600">
              {searchQuery || categoryFilter || unitTypeFilter
                ? 'Intenta con otros filtros'
                : 'Aún no hay productos compartidos en el catálogo global'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Compartido por
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-10 h-10 rounded object-cover mr-3"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center mr-3">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {product.name}
                          </div>
                          {product.brand && (
                            <div className="text-sm text-gray-500">
                              {product.brand}
                            </div>
                          )}
                          {product.content && (
                            <div className="text-xs text-gray-400">
                              {product.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {product.barcode || (
                          <span className="text-gray-400 italic">Sin código</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        SKU: {product.internalSku}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.unitType === 'UNIT' ? 'Unidad' : 'Kilogramo'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.createdByStore?.name || 'Catálogo'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {product.alreadyImported ? (
                        <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Ya importado
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            setImportModal({ open: true, product })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          Importar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Import Modal */}
        {importModal.open && importModal.product && (
          <ImportProductModal
            product={importModal.product}
            onClose={() => setImportModal({ open: false })}
            onSuccess={handleImportSuccess}
            currentUser={user}
          />
        )}
      </div>
    </AuthLayout>
  );
}
