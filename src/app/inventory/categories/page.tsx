'use client';

import { useEffect, useState } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  GripVertical,
  Palette,
  Save,
  X,
  FolderPlus
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Category {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  active: boolean;
  children?: Category[];
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    color: '#6b7280',
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/categories?includeInactive=true');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        // Expandir todos los grupos por defecto
        const allIds = new Set<string>((data.categories || []).map((c: Category) => c.id));
        setExpandedGroups(allIds);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openCreateModal = (parentCategoryId: string | null = null) => {
    setEditingCategory(null);
    setParentId(parentCategoryId);
    setFormData({ name: '', color: '#6b7280' });
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setParentId(null);
    setFormData({
      name: category.name,
      color: category.color || '#6b7280',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      if (editingCategory) {
        // Actualizar
        const res = await fetch(`/api/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            color: formData.color,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Error al actualizar');
        }

        toast.success('Categoría actualizada');
      } else {
        // Crear
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            color: formData.color,
            parentId: parentId,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Error al crear');
        }

        toast.success('Categoría creada');
      }

      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`¿Desactivar la categoría "${category.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al eliminar');
      }

      toast.success('Categoría desactivada');
      loadCategories();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (category: Category) => {
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !category.active }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al actualizar');
      }

      toast.success(category.active ? 'Categoría desactivada' : 'Categoría activada');
      loadCategories();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const PRESET_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#78716c', '#6b7280', '#64748b',
  ];

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Categorías</h1>
            <p className="text-gray-500 mt-1">
              {categories.length} grupos de categorías
            </p>
          </div>
          <button
            onClick={() => openCreateModal(null)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={20} />
            Nueva Categoría
          </button>
        </div>

        {/* Lista de categorías */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderPlus size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay categorías
            </h3>
            <p className="text-gray-500 mb-6">
              Crea tu primera categoría para organizar tus productos
            </p>
            <button
              onClick={() => openCreateModal(null)}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              <Plus size={20} />
              Crear primera categoría
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border divide-y">
            {categories.map((group) => (
              <div key={group.id}>
                {/* Grupo principal */}
                <div
                  className={`flex items-center gap-3 p-4 hover:bg-gray-50 ${
                    !group.active ? 'opacity-50' : ''
                  }`}
                >
                  {/* Expandir/Colapsar */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {group.children && group.children.length > 0 ? (
                      expandedGroups.has(group.id) ? (
                        <ChevronDown size={20} className="text-gray-500" />
                      ) : (
                        <ChevronRight size={20} className="text-gray-500" />
                      )
                    ) : (
                      <div className="w-5" />
                    )}
                  </button>

                  {/* Color indicator */}
                  <div
                    className="w-4 h-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: group.color || '#6b7280' }}
                  />

                  {/* Nombre */}
                  <span className="flex-1 font-medium text-gray-900">
                    {group.name}
                  </span>

                  {/* Badge de subcategorías */}
                  {group.children && group.children.length > 0 && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {group.children.length} subcategorías
                    </span>
                  )}

                  {/* Estado */}
                  <button
                    onClick={() => handleToggleActive(group)}
                    className={`text-xs px-2 py-1 rounded ${
                      group.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {group.active ? 'Activo' : 'Inactivo'}
                  </button>

                  {/* Acciones */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openCreateModal(group.id)}
                      className="p-2 hover:bg-gray-200 rounded text-gray-500 hover:text-green-600"
                      title="Agregar subcategoría"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={() => openEditModal(group)}
                      className="p-2 hover:bg-gray-200 rounded text-gray-500 hover:text-blue-600"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(group)}
                      className="p-2 hover:bg-gray-200 rounded text-gray-500 hover:text-red-600"
                      title="Desactivar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Subcategorías */}
                {expandedGroups.has(group.id) && group.children && group.children.length > 0 && (
                  <div className="bg-gray-50 border-t">
                    {group.children.map((child) => (
                      <div
                        key={child.id}
                        className={`flex items-center gap-3 p-3 pl-12 hover:bg-gray-100 border-b last:border-b-0 ${
                          !child.active ? 'opacity-50' : ''
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full border border-gray-200"
                          style={{ backgroundColor: child.color || group.color || '#6b7280' }}
                        />
                        <span className="flex-1 text-gray-700">{child.name}</span>
                        
                        <button
                          onClick={() => handleToggleActive(child)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            child.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {child.active ? 'Activo' : 'Inactivo'}
                        </button>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(child)}
                            className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(child)}
                            className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingCategory ? 'Editar Categoría' : parentId ? 'Nueva Subcategoría' : 'Nueva Categoría'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Ej: Herramientas Manuales"
                  autoFocus
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        formData.color === color
                          ? 'border-gray-900 scale-110'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">Color personalizado</span>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Save size={18} />
                  {editingCategory ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
