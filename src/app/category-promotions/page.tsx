'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Tag, Plus, X, Calendar } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface CategoryPromotion {
  id: string;
  name: string;
  category: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  maxDiscountPerItem: number | null;
  createdAt: string;
}

export default function CategoryPromotionsPage() {
  const router = useRouter();
  const [categoryPromotions, setCategoryPromotions] = useState<CategoryPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<CategoryPromotion | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    type: 'PERCENT' as 'PERCENT' | 'AMOUNT',
    value: '',
    startsAt: '',
    endsAt: '',
    maxDiscountPerItem: '',
  });

  useEffect(() => {
    fetchCategoryPromotions();
    fetchCategories();
  }, []);

  const fetchCategoryPromotions = async () => {
    try {
      const res = await fetch('/api/category-promotions');
      if (res.ok) {
        const data = await res.json();
        setCategoryPromotions(data.categoryPromotions || []);
      }
    } catch (error) {
      console.error('Error fetching category promotions:', error);
      toast.error('Error al cargar promociones por categoría');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        // Extraer categorías únicas de los productos
        const uniqueCategories = [...new Set(
          data.products.map((p: any) => p.category)
        )].filter(Boolean) as string[]; // Filter out null/undefined
        setCategories(uniqueCategories.sort());
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.category || !formData.value) {
      toast.error('Completa los campos requeridos');
      return;
    }

    const valueNum = parseFloat(formData.value);
    if (isNaN(valueNum) || valueNum <= 0) {
      toast.error('Valor inválido');
      return;
    }

    if (formData.type === 'PERCENT' && valueNum > 100) {
      toast.error('El porcentaje no puede ser mayor a 100');
      return;
    }

    setCreating(true);

    try {
      const body: any = {
        name: formData.name,
        category: formData.category,
        type: formData.type,
        value: valueNum,
      };

      if (formData.startsAt) body.startsAt = formData.startsAt;
      if (formData.endsAt) body.endsAt = formData.endsAt;
      if (formData.maxDiscountPerItem) {
        const maxDiscount = parseFloat(formData.maxDiscountPerItem);
        if (!isNaN(maxDiscount) && maxDiscount > 0) {
          body.maxDiscountPerItem = maxDiscount;
        }
      }

      const res = await fetch('/api/category-promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Promoción por categoría creada');
        setShowCreateModal(false);
        setFormData({
          name: '',
          category: '',
          type: 'PERCENT',
          value: '',
          startsAt: '',
          endsAt: '',
          maxDiscountPerItem: '',
        });
        fetchCategoryPromotions();
      } else {
        toast.error(data.message || 'Error al crear promoción');
      }
    } catch (error) {
      console.error('Error creating category promotion:', error);
      toast.error('Error al crear promoción por categoría');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/category-promotions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (res.ok) {
        toast.success(currentActive ? 'Promoción desactivada' : 'Promoción activada');
        fetchCategoryPromotions();
      } else {
        const data = await res.json();
        toast.error(data.message || 'Error al actualizar promoción');
      }
    } catch (error) {
      console.error('Error toggling category promotion:', error);
      toast.error('Error al actualizar promoción');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);

    try {
      const res = await fetch(`/api/category-promotions/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Promoción eliminada');
        fetchCategoryPromotions();
      } else {
        const data = await res.json();
        toast.error(data.message || 'Error al eliminar promoción');
      }
    } catch (error) {
      console.error('Error deleting category promotion:', error);
      toast.error('Error al eliminar promoción');
    } finally {
      setDeleting(null);
      setShowDeleteModal(false);
      setPromoToDelete(null);
    }
  };

  const openDeleteModal = (promo: CategoryPromotion) => {
    setPromoToDelete(promo);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setPromoToDelete(null);
  };

  const getStatus = (promo: CategoryPromotion) => {
    if (!promo.active) return { label: 'Inactiva', color: 'gray' };
    
    const now = new Date();
    if (promo.startsAt && new Date(promo.startsAt) > now) {
      return { label: 'Pendiente', color: 'yellow' };
    }
    if (promo.endsAt && new Date(promo.endsAt) < now) {
      return { label: 'Expirada', color: 'red' };
    }
    return { label: 'Activa', color: 'green' };
  };

  return (
    <AuthLayout>
      <Toaster position="top-right" />
      
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Tag className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Promociones por Categoría
                </h1>
                <p className="text-gray-600 mt-1">
                  Descuentos automáticos por categoría de producto
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nueva Promoción
            </button>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : categoryPromotions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Tag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No hay promociones por categoría
              </h3>
              <p className="text-gray-600 mb-6">
                Crea tu primera promoción automática por categoría
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Crear Promoción
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categoryPromotions.map((promo) => {
                const status = getStatus(promo);
                return (
                  <div
                    key={promo.id}
                    className={`bg-white rounded-lg shadow-sm border-2 transition-all ${
                      promo.active ? 'border-purple-200' : 'border-gray-200 opacity-75'
                    }`}
                  >
                    <div className="p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-1">
                            {promo.name}
                          </h3>
                          <p className="text-sm text-purple-600 font-medium">
                            Categoría: {promo.category}
                          </p>
                        </div>
                        <button
                          onClick={() => openDeleteModal(promo)}
                          disabled={deleting === promo.id}
                          className="text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Status badge */}
                      <div className="mb-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            status.color === 'green'
                              ? 'bg-green-100 text-green-800'
                              : status.color === 'yellow'
                              ? 'bg-yellow-100 text-yellow-800'
                              : status.color === 'red'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>

                      {/* Discount info */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Descuento:</span>
                          <span className="font-bold text-purple-700">
                            {promo.type === 'PERCENT'
                              ? `${Number(promo.value)}%`
                              : `S/ ${Number(promo.value).toFixed(2)}`}
                          </span>
                        </div>

                        {promo.maxDiscountPerItem && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Máx por ítem:</span>
                            <span className="font-medium text-gray-900">
                              S/ {Number(promo.maxDiscountPerItem).toFixed(2)}
                            </span>
                          </div>
                        )}

                        {promo.startsAt && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>Inicia: {new Date(promo.startsAt).toLocaleDateString()}</span>
                          </div>
                        )}

                        {promo.endsAt && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>Expira: {new Date(promo.endsAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleToggleActive(promo.id, promo.active)}
                          className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                            promo.active
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                          }`}
                        >
                          {promo.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Nueva Promoción por Categoría
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la Promoción *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Descuento Bebidas"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categoría *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                    disabled={loadingCategories}
                  >
                    <option value="">
                      {loadingCategories ? 'Cargando categorías...' : 'Selecciona una categoría'}
                    </option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Selecciona la categoría de productos a aplicar descuento
                  </p>
                </div>

                {/* Type and Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value as 'PERCENT' | 'AMOUNT' })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="PERCENT">Porcentaje (%)</option>
                      <option value="AMOUNT">Monto Fijo (S/)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Valor *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      placeholder={formData.type === 'PERCENT' ? '10' : '5.00'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Max Discount Per Item */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descuento Máximo por Ítem (opcional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.maxDiscountPerItem}
                    onChange={(e) =>
                      setFormData({ ...formData, maxDiscountPerItem: e.target.value })
                    }
                    placeholder="Ej: 10.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Tope de descuento por ítem (S/)
                  </p>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha Inicio (opcional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.startsAt}
                      onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha Fin (opcional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.endsAt}
                      onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Actions */}
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
                    className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creando...' : 'Crear Promoción'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && promoToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              {/* Header */}
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

              {/* Content */}
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
                    <span className="text-sm text-gray-500">Categoría:</span>
                    <p className="font-medium text-gray-900">{promoToDelete.category}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm text-gray-500">Descuento:</span>
                    <p className="font-medium text-gray-900">
                      {promoToDelete.type === 'PERCENTAGE' 
                        ? `${Number(promoToDelete.value).toFixed(0)}%`
                        : `S/ ${Number(promoToDelete.value).toFixed(2)}`}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-red-600">
                  Esta acción no se puede deshacer.
                </p>
              </div>

              {/* Actions */}
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
    </AuthLayout>
  );
}
