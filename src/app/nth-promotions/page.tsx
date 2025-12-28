'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Tag, Plus, X, Calendar, Percent } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface NthPromotion {
  id: string;
  name: string;
  productId: string;
  product: {
    id: string;
    name: string;
    barcode: string | null;
    unitType: 'UNIT' | 'KG';
  };
  type: 'NTH_PERCENT';
  nthQty: number;
  percentOff: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  unitType: 'UNIT' | 'KG';
}

export default function NthPromotionsPage() {
  const router = useRouter();
  const [nthPromotions, setNthPromotions] = useState<NthPromotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<NthPromotion | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    productId: '',
    nthQty: 2,
    percentOff: 50,
    startsAt: '',
    endsAt: '',
  });

  useEffect(() => {
    fetchNthPromotions();
    fetchProducts();
  }, []);

  const fetchNthPromotions = async () => {
    try {
      const res = await fetch('/api/nth-promotions');
      if (!res.ok) throw new Error('Error al cargar promociones');
      const data = await res.json();
      setNthPromotions(data.promotions || []);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar promociones n-ésimo');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Error al cargar productos');
      const data = await res.json();
      // Solo productos UNIT
      setProducts((data.products || []).filter((p: Product) => p.unitType === 'UNIT'));
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar productos');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Ingresa un nombre para la promoción');
      return;
    }
    
    if (!formData.productId) {
      toast.error('Selecciona un producto');
      return;
    }
    
    if (formData.nthQty < 2) {
      toast.error('El N-ésimo debe ser al menos 2');
      return;
    }
    
    if (formData.percentOff <= 0 || formData.percentOff > 100) {
      toast.error('El descuento debe estar entre 0 y 100%');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/nth-promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          productId: formData.productId,
          nthQty: formData.nthQty,
          percentOff: formData.percentOff,
          startsAt: formData.startsAt || null,
          endsAt: formData.endsAt || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al crear promoción');
      }

      toast.success('Promoción n-ésimo creada');
      setShowCreateModal(false);
      setFormData({
        name: '',
        productId: '',
        nthQty: 2,
        percentOff: 50,
        startsAt: '',
        endsAt: '',
      });
      fetchNthPromotions();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear promoción');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/nth-promotions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (!res.ok) throw new Error('Error al actualizar promoción');

      toast.success(currentActive ? 'Promoción desactivada' : 'Promoción activada');
      fetchNthPromotions();
    } catch (error) {
      toast.error('Error al actualizar promoción');
    }
  };

  const handleDelete = async () => {
    if (!promoToDelete) return;

    setDeleting(promoToDelete.id);
    try {
      const res = await fetch(`/api/nth-promotions/${promoToDelete.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Error al eliminar promoción');

      toast.success('Promoción eliminada');
      setShowDeleteModal(false);
      setPromoToDelete(null);
      fetchNthPromotions();
    } catch (error) {
      toast.error('Error al eliminar promoción');
    } finally {
      setDeleting(null);
    }
  };

  const getNthLabel = (nthQty: number) => {
    if (nthQty === 2) return '2do';
    if (nthQty === 3) return '3ro';
    if (nthQty === 4) return '4to';
    return `${nthQty}to`;
  };

  return (
    <AuthLayout>
      <Toaster position="top-center" richColors />
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Promociones N-ésimo</h1>
            <p className="text-gray-600 mt-1">
              Gestiona promociones tipo "2do al 50%", "3ro gratis", etc.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Promoción
          </button>
        </div>

        {/* Lista de promociones */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Cargando...</div>
        ) : nthPromotions.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay promociones n-ésimo
            </h3>
            <p className="text-gray-500 mb-6">
              Crea tu primera promoción tipo "2do al 50%" o "3ro gratis"
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Crear Promoción
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {nthPromotions.map((promo) => (
              <div
                key={promo.id}
                className={`p-6 border rounded-lg transition-all ${
                  promo.active
                    ? 'bg-white border-yellow-300 shadow-sm'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Tag className={`w-5 h-5 ${promo.active ? 'text-yellow-600' : 'text-gray-400'}`} />
                    <h3 className="font-semibold text-gray-900">{promo.name}</h3>
                  </div>
                  <button
                    onClick={() => handleToggleActive(promo.id, promo.active)}
                    className={`px-3 py-1 text-xs rounded-full font-medium ${
                      promo.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {promo.active ? 'Activa' : 'Inactiva'}
                  </button>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div>
                    <span className="font-medium">Producto:</span>{' '}
                    {promo.product.name}
                  </div>
                  <div className="flex items-center gap-2 text-yellow-700 font-semibold text-base">
                    <Percent className="w-4 h-4" />
                    {getNthLabel(promo.nthQty)} al {promo.percentOff}% de descuento
                  </div>
                  {promo.startsAt && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Desde: {new Date(promo.startsAt).toLocaleDateString()}
                    </div>
                  )}
                  {promo.endsAt && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Hasta: {new Date(promo.endsAt).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setPromoToDelete(promo);
                    setShowDeleteModal(true);
                  }}
                  className="w-full py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Modal de crear */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Nueva Promoción N-ésimo</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la promoción *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: 2do al 50%, 3ro gratis"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Producto (solo UNIT) *
                  </label>
                  <select
                    value={formData.productId}
                    onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Seleccionar producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} {product.barcode ? `(${product.barcode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    N-ésimo (2 = segundo, 3 = tercero, etc.) *
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={formData.nthQty}
                    onChange={(e) => setFormData({ ...formData, nthQty: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Mínimo 2 (segundo producto)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Porcentaje de descuento (%) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.percentOff}
                    onChange={(e) => setFormData({ ...formData, percentOff: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    50 = 50% off, 100 = gratis
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vigencia desde (opcional)
                    </label>
                    <input
                      type="date"
                      value={formData.startsAt}
                      onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vigencia hasta (opcional)
                    </label>
                    <input
                      type="date"
                      value={formData.endsAt}
                      onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    disabled={creating}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
                    disabled={creating}
                  >
                    {creating ? 'Creando...' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de eliminar */}
        {showDeleteModal && promoToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Eliminar Promoción</h2>
              <p className="text-gray-600 mb-6">
                ¿Estás seguro de eliminar la promoción "{promoToDelete.name}"?
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setPromoToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={deleting !== null}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400"
                  disabled={deleting !== null}
                >
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
