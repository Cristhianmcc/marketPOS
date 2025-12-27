'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Package, Plus, X, Calendar } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface VolumePromotion {
  id: string;
  name: string;
  productId: string;
  product: {
    id: string;
    name: string;
    barcode: string | null;
    unitType: 'UNIT' | 'KG';
  };
  type: 'FIXED_PRICE';
  requiredQty: number;
  packPrice: number;
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

export default function VolumePromotionsPage() {
  const router = useRouter();
  const [volumePromotions, setVolumePromotions] = useState<VolumePromotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<VolumePromotion | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    productId: '',
    requiredQty: 3,
    packPrice: '',
    startsAt: '',
    endsAt: '',
  });

  useEffect(() => {
    fetchVolumePromotions();
    fetchProducts();
  }, []);

  const fetchVolumePromotions = async () => {
    try {
      const res = await fetch('/api/volume-promotions');
      if (!res.ok) throw new Error('Error al cargar promociones');
      const data = await res.json();
      setVolumePromotions(data.volumePromotions || []);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar promociones por volumen');
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
    
    if (formData.requiredQty < 2) {
      toast.error('La cantidad requerida debe ser al menos 2');
      return;
    }
    
    const packPrice = parseFloat(formData.packPrice);
    if (isNaN(packPrice) || packPrice <= 0) {
      toast.error('Ingresa un precio válido para el pack');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/volume-promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          productId: formData.productId,
          requiredQty: formData.requiredQty,
          packPrice,
          startsAt: formData.startsAt || null,
          endsAt: formData.endsAt || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al crear promoción');
      }

      toast.success('Promoción por volumen creada');
      setShowCreateModal(false);
      setFormData({
        name: '',
        productId: '',
        requiredQty: 3,
        packPrice: '',
        startsAt: '',
        endsAt: '',
      });
      fetchVolumePromotions();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear promoción');
    } finally {
      setCreating(false);
    }
  };

  const openDeleteModal = (promo: VolumePromotion) => {
    setPromoToDelete(promo);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setPromoToDelete(null);
    setShowDeleteModal(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/volume-promotions/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al eliminar');
      }

      toast.success('Promoción eliminada');
      fetchVolumePromotions();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar promoción');
    } finally {
      setDeleting(null);
      closeDeleteModal();
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/volume-promotions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (!res.ok) throw new Error('Error al actualizar');

      toast.success(currentActive ? 'Promoción desactivada' : 'Promoción activada');
      fetchVolumePromotions();
    } catch (error) {
      toast.error('Error al actualizar promoción');
    }
  };

  const getStatus = (promo: VolumePromotion) => {
    if (!promo.active) return { text: 'Inactiva', color: 'text-gray-500' };
    
    const now = new Date();
    if (promo.startsAt && now < new Date(promo.startsAt)) {
      return { text: 'Programada', color: 'text-blue-600' };
    }
    if (promo.endsAt && now > new Date(promo.endsAt)) {
      return { text: 'Expirada', color: 'text-red-600' };
    }
    return { text: 'Activa', color: 'text-green-600' };
  };

  if (loading) {
    return (
      <AuthLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Cargando...</div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-7 h-7" />
              Promociones por Volumen
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Ej: "3 unidades por S/ 5.00" - Solo productos UNIT
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Promoción
          </button>
        </div>

        {/* Lista de promociones */}
        {volumePromotions.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No hay promociones por volumen</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-orange-600 hover:text-orange-700 font-medium"
            >
              Crear la primera promoción
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {volumePromotions.map((promo) => {
              const status = getStatus(promo);
              return (
                <div
                  key={promo.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {promo.name}
                        </h3>
                        <span className={`text-sm font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Producto:</span>
                          <p className="font-medium text-gray-900">
                            {promo.product.name}
                            {promo.product.barcode && (
                              <span className="text-gray-500 ml-2">
                                ({promo.product.barcode})
                              </span>
                            )}
                          </p>
                        </div>

                        <div>
                          <span className="text-gray-500">Pack:</span>
                          <p className="font-medium text-gray-900">
                            {promo.requiredQty} unidades por S/ {Number(promo.packPrice).toFixed(2)}
                          </p>
                        </div>

                        {(promo.startsAt || promo.endsAt) && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Vigencia:</span>
                            <p className="font-medium text-gray-900">
                              {promo.startsAt
                                ? new Date(promo.startsAt).toLocaleDateString('es-PE')
                                : '---'}
                              {' → '}
                              {promo.endsAt
                                ? new Date(promo.endsAt).toLocaleDateString('es-PE')
                                : '---'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(promo.id, promo.active)}
                        className={`px-3 py-1.5 text-sm rounded ${
                          promo.active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {promo.active ? 'Activa' : 'Inactiva'}
                      </button>
                      <button
                        onClick={() => openDeleteModal(promo)}
                        disabled={deleting === promo.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de creación */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Nueva Promoción por Volumen
                  </h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
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
                      placeholder="Ej: Pack 3x5"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar producto...</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.barcode && `(${product.barcode})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cantidad requerida *
                      </label>
                      <input
                        type="number"
                        value={formData.requiredQty}
                        onChange={(e) => setFormData({ ...formData, requiredQty: parseInt(e.target.value) || 0 })}
                        min="2"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Precio del pack (S/) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.packPrice}
                        onChange={(e) => setFormData({ ...formData, packPrice: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha inicio (opcional)
                      </label>
                      <input
                        type="date"
                        value={formData.startsAt}
                        onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha fin (opcional)
                      </label>
                      <input
                        type="date"
                        value={formData.endsAt}
                        onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                    >
                      {creating ? 'Creando...' : 'Crear Promoción'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmación de eliminación */}
        {showDeleteModal && promoToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Confirmar Eliminación
                  </h3>
                  <button
                    onClick={closeDeleteModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3 mb-6">
                  <p className="text-gray-600">
                    ¿Estás seguro de que deseas eliminar esta promoción?
                  </p>
                  
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div>
                      <span className="text-sm text-gray-500">Nombre:</span>
                      <p className="font-medium text-gray-900">{promoToDelete.name}</p>
                    </div>
                    
                    <div>
                      <span className="text-sm text-gray-500">Producto:</span>
                      <p className="font-medium text-gray-900">{promoToDelete.product.name}</p>
                    </div>
                    
                    <div>
                      <span className="text-sm text-gray-500">Pack:</span>
                      <p className="font-medium text-gray-900">
                        {promoToDelete.requiredQty} x S/ {Number(promoToDelete.packPrice).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-red-600">
                    Esta acción no se puede deshacer.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(promoToDelete.id)}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
