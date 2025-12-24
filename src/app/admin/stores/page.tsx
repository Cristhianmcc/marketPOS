'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'sonner';

interface Store {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string | null;
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

  const [formData, setFormData] = useState({
    storeName: '',
    storeRuc: '',
    storeAddress: '',
    storePhone: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
  });

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    try {
      const res = await fetch('/api/admin/stores');
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
      });
      setShowForm(false);
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setCreating(false);
    }
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
        <div className="mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Cancelar' : '+ Nueva Tienda'}
          </button>
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
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">RUC</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Usuarios</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Productos</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Creada</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No hay tiendas registradas
                  </td>
                </tr>
              ) : (
                stores.map((store) => (
                  <tr key={store.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{store.name}</p>
                        {store.address && (
                          <p className="text-sm text-gray-500">{store.address}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{store.ruc || '-'}</td>
                    <td className="px-6 py-4 text-gray-700">{store._count.users}</td>
                    <td className="px-6 py-4 text-gray-700">{store._count.storeProducts}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {new Date(store.createdAt).toLocaleDateString('es-PE')}
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
