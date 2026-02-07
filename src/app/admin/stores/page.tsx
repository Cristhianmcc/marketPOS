'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'sonner';

// ✅ MÓDULO V1: Tipos de perfiles de negocio
type BusinessProfile = 'BODEGA' | 'FERRETERIA' | 'TALLER' | 'LAVANDERIA' | 'POLLERIA' | 'HOSTAL' | 'BOTICA' | 'ACCESORIOS';

interface ProfileOption {
  profile: BusinessProfile;
  name: string;
  description: string;
  icon: string;
}

interface Store {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  businessProfile: BusinessProfile; // ✅ MÓDULO V1
  archivedAt: string | null;
  createdAt: string;
  _count: {
    users: number;
    storeProducts: number;
  };
}

export default function AdminStoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [actioningStoreId, setActioningStoreId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [changingProfileStoreId, setChangingProfileStoreId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    storeName: '',
    storeRuc: '',
    storeAddress: '',
    storePhone: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    businessProfile: 'BODEGA' as BusinessProfile, // ✅ MÓDULO V1
  });

  useEffect(() => {
    loadStores();
    loadProfiles(); // ✅ MÓDULO V1
  }, [showArchived]);

  // ✅ MÓDULO V1: Cargar perfiles disponibles
  async function loadProfiles() {
    try {
      const res = await fetch('/api/admin/business-profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles);
      }
    } catch (err) {
      console.error('Error cargando perfiles:', err);
    }
  }

  async function loadStores() {
    try {
      const res = await fetch(`/api/admin/stores?showArchived=${showArchived}`);
      if (res.status === 403) {
        router.push('/');
        return;
      }
      if (!res.ok) throw new Error('Error al cargar tiendas');
      const data = await res.json();
      setStores(data.stores);
    } catch (err) {
      setError('Error al cargar tiendas');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveStore(store_id: string) {
    if (!confirm('¿Seguro que quieres archivar esta tienda? Los usuarios no podrán acceder a las operaciones.')) {
      return;
    }

    setActioningStoreId(store_id);
    try {
      const res = await fetch(`/api/admin/stores/${store_id}/archive`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al archivar tienda');
        return;
      }

      toast.success(data.message);
      loadStores();
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setActioningStoreId(null);
    }
  }

  async function handleReactivateStore(store_id: string) {
    if (!confirm('¿Seguro que quieres reactivar esta tienda?')) {
      return;
    }

    setActioningStoreId(store_id);
    try {
      const res = await fetch(`/api/admin/stores/${store_id}/reactivate`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al reactivar tienda');
        return;
      }

      toast.success(data.message);
      loadStores();
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setActioningStoreId(null);
    }
  }

  async function handleCreateStore(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Error al crear tienda');
        return;
      }

      toast.success('Tienda creada exitosamente');
      loadStores();
      setFormData({
        storeName: '',
        storeRuc: '',
        storeAddress: '',
        storePhone: '',
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
        businessProfile: 'BODEGA',
      });
      setShowForm(false);
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setCreating(false);
    }
  }

  const archivedCount = stores.filter(s => s.status === 'ARCHIVED').length;

  // ✅ MÓDULO V1: Cambiar perfil de tienda
  async function handleChangeProfile(storeId: string, newProfile: BusinessProfile) {
    setChangingProfileStoreId(storeId);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/set-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessProfile: newProfile }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Error al cambiar perfil');
        return;
      }

      toast.success(`Perfil cambiado a ${newProfile}`);
      loadStores();
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setChangingProfileStoreId(null);
    }
  }

  // Helper para obtener info del perfil
  function getProfileInfo(profile: BusinessProfile) {
    return profiles.find(p => p.profile === profile) || { icon: '🏪', name: profile };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Administración de Tiendas</h1>
            <p className="text-gray-600 mt-2">SUPERADMIN Panel</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Volver
          </button>
        </div>

        {/* Botón crear tienda */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Cancelar' : '+ Nueva Tienda'}
          </button>

          {/* Toggle mostrar archivadas */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Mostrar archivadas {archivedCount > 0 && `(${archivedCount})`}
            </span>
          </label>
        </div>

        {/* Formulario crear tienda */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Crear Nueva Tienda</h2>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateStore} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la Tienda *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.storeName}
                    onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* ✅ MÓDULO V1: Selector de Perfil de Negocio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rubro / Perfil de Negocio *
                  </label>
                  <select
                    required
                    value={formData.businessProfile}
                    onChange={(e) => setFormData({ ...formData, businessProfile: e.target.value as BusinessProfile })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  >
                    {profiles.map(p => (
                      <option key={p.profile} value={p.profile}>
                        {p.icon} {p.name}
                      </option>
                    ))}
                  </select>
                  {profiles.find(p => p.profile === formData.businessProfile) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {profiles.find(p => p.profile === formData.businessProfile)?.description}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC
                  </label>
                  <input
                    type="text"
                    value={formData.storeRuc}
                    onChange={(e) => setFormData({ ...formData, storeRuc: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={formData.storeAddress}
                    onChange={(e) => setFormData({ ...formData, storeAddress: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.storePhone}
                    onChange={(e) => setFormData({ ...formData, storePhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Owner *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.ownerName}
                    onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email del Owner *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña del Owner *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={formData.ownerPassword}
                      onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {creating ? 'Creando...' : 'Crear Tienda'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabla de tiendas */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tienda</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rubro</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">RUC</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Usuarios</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Productos</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Creada</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    {showArchived ? 'No hay tiendas archivadas' : 'No hay tiendas activas'}
                  </td>
                </tr>
              ) : (
                stores.map((store) => (
                  <tr 
                    key={store.id} 
                    className={`border-b hover:bg-gray-50 ${store.status === 'ARCHIVED' ? 'bg-gray-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className={`font-medium ${store.status === 'ARCHIVED' ? 'text-gray-500' : 'text-gray-900'}`}>
                          {store.name}
                        </p>
                        {store.address && (
                          <p className="text-sm text-gray-500">{store.address}</p>
                        )}
                      </div>
                    </td>
                    {/* ✅ MÓDULO V1: Columna Rubro */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getProfileInfo(store.businessProfile).icon}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            {getProfileInfo(store.businessProfile).name}
                          </p>
                          {store.status === 'ACTIVE' && (
                            <select
                              value={store.businessProfile}
                              onChange={(e) => handleChangeProfile(store.id, e.target.value as BusinessProfile)}
                              disabled={changingProfileStoreId === store.id}
                              className="text-xs text-blue-600 bg-transparent border-none cursor-pointer hover:underline p-0 focus:ring-0"
                            >
                              {profiles.map(p => (
                                <option key={p.profile} value={p.profile}>
                                  {p.icon} {p.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{store.ruc || '-'}</td>
                    <td className="px-6 py-4">
                      {store.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ACTIVA
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          ARCHIVADA
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{store._count.users}</td>
                    <td className="px-6 py-4 text-gray-700">{store._count.storeProducts}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {new Date(store.createdAt).toLocaleDateString('es-PE')}
                    </td>
                    <td className="px-6 py-4">
                      {store.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleArchiveStore(store.id)}
                          disabled={actioningStoreId === store.id}
                          className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50"
                        >
                          {actioningStoreId === store.id ? 'Archivando...' : 'Archivar'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivateStore(store.id)}
                          disabled={actioningStoreId === store.id}
                          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                        >
                          {actioningStoreId === store.id ? 'Reactivando...' : 'Reactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
