'use client';

import { useEffect, useState, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { Plus, Search, Edit, Trash2, Wrench, Power, AlertCircle } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useFlags } from '@/hooks/useFlags';

interface Unit {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  sunatCode: string | null;
}

interface Service {
  id: string;
  name: string;
  price: number;
  taxable: boolean;
  active: boolean;
  baseUnitId: string | null;
  baseUnit: Unit | null;
  createdAt: string;
  updatedAt: string;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | null>(true);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  
  // Form
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formTaxable, setFormTaxable] = useState(false);
  const [formBaseUnitId, setFormBaseUnitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Unidades disponibles
  const [units, setUnits] = useState<Unit[]>([]);

  // Feature Flags
  const { isOn: isFlagOn, isLoading: flagsLoading } = useFlags();
  const servicesEnabled = isFlagOn('ENABLE_SERVICES');

  // Check auth
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          window.location.href = '/login';
          return;
        }
        setUser(data);
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (activeFilter !== null) params.set('active', String(activeFilter));
      
      const res = await fetch(`/api/services?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar servicios');
      const data = await res.json();
      setServices(data.data || []);
    } catch (error) {
      console.error('Error loading services:', error);
      toast.error('Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeFilter]);

  useEffect(() => {
    if (user && servicesEnabled && !flagsLoading) {
      loadServices();
    }
  }, [user, servicesEnabled, flagsLoading, loadServices]);

  const resetForm = () => {
    setFormName('');
    setFormPrice('');
    setFormTaxable(false);
    setFormBaseUnitId(null);
  };

  // Cargar unidades de servicio
  useEffect(() => {
    fetch('/api/units?kind=SERVICES')
      .then((r) => r.json())
      .then((data) => {
        if (data.units) {
          setUnits(data.units);
        }
      })
      .catch(() => {
        console.error('Error cargando unidades');
      });
  }, []);

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    const price = parseFloat(formPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          price,
          taxable: formTaxable,
          baseUnitId: formBaseUnitId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear servicio');
      }

      toast.success('Servicio creado');
      setShowCreateModal(false);
      resetForm();
      loadServices();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear servicio');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingService) return;
    
    if (!formName.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    const price = parseFloat(formPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingService.id,
          name: formName.trim(),
          price,
          taxable: formTaxable,
          active: editingService.active,
          baseUnitId: formBaseUnitId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar servicio');
      }

      toast.success('Servicio actualizado');
      setEditingService(null);
      resetForm();
      loadServices();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar servicio');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (service: Service) => {
    try {
      const res = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: service.id,
          active: !service.active,
        }),
      });

      if (!res.ok) throw new Error('Error al actualizar');
      
      toast.success(service.active ? 'Servicio desactivado' : 'Servicio activado');
      loadServices();
    } catch {
      toast.error('Error al actualizar servicio');
    }
  };

  const handleDelete = async () => {
    if (!deletingService) return;

    setSaving(true);
    try {
      const res = await fetch('/api/services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingService.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar');
      }

      const data = await res.json();
      toast.success(data.message || 'Servicio eliminado');
      setDeletingService(null);
      loadServices();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar servicio');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (service: Service) => {
    setFormName(service.name);
    setFormPrice(String(service.price));
    setFormTaxable(service.taxable);
    setFormBaseUnitId(service.baseUnitId);
    setEditingService(service);
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  // Role check
  const isOwner = user?.role === 'OWNER';

  if (flagsLoading) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      </AuthLayout>
    );
  }

  if (!servicesEnabled) {
    return (
      <AuthLayout>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-12 px-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                Módulo de Servicios No Habilitado
              </h2>
              <p className="text-yellow-700">
                Contacta al administrador para habilitar la funcionalidad de servicios.
              </p>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Wrench className="w-7 h-7 text-indigo-600" />
                Servicios
              </h1>
              <p className="text-gray-500 mt-1">
                Gestiona los servicios que ofrece tu negocio (corte, instalación, delivery, etc.)
              </p>
            </div>
            
            {isOwner && (
              <button
                onClick={() => {
                  resetForm();
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nuevo Servicio
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar servicio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <select
                value={activeFilter === null ? 'all' : String(activeFilter)}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveFilter(val === 'all' ? null : val === 'true');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </select>
            </div>
          </div>

          {/* Services List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-3">Cargando servicios...</p>
              </div>
            ) : services.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No hay servicios</p>
                <p className="text-sm mt-1">
                  {searchQuery ? 'No se encontraron resultados' : 'Crea tu primer servicio para comenzar'}
                </p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Servicio
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Precio
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unidad SUNAT
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gravado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    {isOwner && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {services.map((service) => (
                    <tr key={service.id} className={!service.active ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <Wrench className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {service.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg font-semibold text-gray-900">
                          {formatMoney(service.price)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {service.baseUnit ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">
                            {service.baseUnit.symbol || service.baseUnit.code} ({service.baseUnit.sunatCode || 'N/A'})
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500">
                            ZZ (defecto)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          service.taxable 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {service.taxable ? 'Gravado' : 'Exonerado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          service.active 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {service.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {isOwner && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(service)}
                              title="Editar"
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(service)}
                              title={service.active ? 'Desactivar' : 'Activar'}
                              className={`p-1.5 rounded ${
                                service.active
                                  ? 'text-gray-500 hover:text-orange-600 hover:bg-orange-50'
                                  : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                              }`}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingService(service)}
                              title="Eliminar"
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Servicio</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Corte de material"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio (S/) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="taxable"
                    checked={formTaxable}
                    onChange={(e) => setFormTaxable(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="taxable" className="text-sm text-gray-700">
                    Servicio gravado con IGV
                  </label>
                </div>

                {/* Selector de Unidad SUNAT */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad SUNAT
                  </label>
                  <select
                    value={formBaseUnitId || ''}
                    onChange={(e) => setFormBaseUnitId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Sin unidad (ZZ por defecto)</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol || unit.code}) - {unit.sunatCode || 'N/A'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Código de unidad para SUNAT (opcional)
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear Servicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Editar Servicio</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio (S/) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="taxable-edit"
                    checked={formTaxable}
                    onChange={(e) => setFormTaxable(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="taxable-edit" className="text-sm text-gray-700">
                    Servicio gravado con IGV
                  </label>
                </div>

                {/* Selector de Unidad SUNAT */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad SUNAT
                  </label>
                  <select
                    value={formBaseUnitId || ''}
                    onChange={(e) => setFormBaseUnitId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Sin unidad (ZZ por defecto)</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol || unit.code}) - {unit.sunatCode || 'N/A'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Código de unidad para SUNAT (opcional)
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => {
                  setEditingService(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                ¿Eliminar servicio?
              </h2>
              <p className="text-gray-600">
                ¿Estás seguro de eliminar <strong>{deletingService.name}</strong>?
                {deletingService.active && (
                  <span className="block mt-2 text-sm text-amber-600">
                    Si el servicio tiene ventas asociadas, será desactivado en lugar de eliminado.
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setDeletingService(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
