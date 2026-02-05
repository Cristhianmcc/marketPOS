'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface StoreData {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string | null;
}

interface SettingsData {
  id: string;
  ticketFooter: string | null;
  taxRate: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [store, setStore] = useState<StoreData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);

  const [formData, setFormData] = useState({
    storeName: '',
    storeRuc: '',
    storeAddress: '',
    storePhone: '',
    ticketFooter: '',
    taxRate: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.status === 403) {
        router.push('/');
        return;
      }
      if (!res.ok) throw new Error('Error al cargar configuración');

      const data = await res.json();
      setStore(data.store);
      setSettings(data.settings);

      // Llenar formulario
      setFormData({
        storeName: data.store.name || '',
        storeRuc: data.store.ruc || '',
        storeAddress: data.store.address || '',
        storePhone: data.store.phone || '',
        ticketFooter: data.settings?.ticketFooter || '',
        taxRate: data.settings?.taxRate || 0,
      });
    } catch (err) {
      setError('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Error al guardar');
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Error de red');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600 mt-2">Ajustes de la tienda</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Volver
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
              ✓ Configuración guardada correctamente
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            {/* Información de la tienda */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Información de la Tienda</h2>
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
              </div>
            </div>

            {/* Configuración de tickets */}
            <div className="border-t pt-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Configuración de Tickets</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pie de Página del Ticket
                  </label>
                  <textarea
                    rows={3}
                    value={formData.ticketFooter}
                    onChange={(e) => setFormData({ ...formData, ticketFooter: e.target.value })}
                    placeholder="Ej: Gracias por su compra"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Mensaje que aparece al final de cada ticket
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tasa de Impuesto (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.taxRate}
                    onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    IGV u otro impuesto aplicable (0 para sin impuesto)
                  </p>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="border-t pt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>

        {/* Backups Section */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Copias de Seguridad</h2>
          <p className="text-gray-600 mb-4">
            Exporta y gestiona backups de tu tienda para recuperación ante desastres.
          </p>
          <button
            onClick={() => router.push('/settings/backups')}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
          >
            Gestionar Backups
          </button>
        </div>

        {/* SUNAT Section - MÓDULO 18.8 */}
        {process.env.NEXT_PUBLIC_ENABLE_SUNAT === 'true' && (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">🧾 Facturación Electrónica SUNAT</h2>
            <p className="text-gray-600 mb-4">
              Configura la emisión de boletas y facturas electrónicas para tu negocio.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/onboarding/sunat')}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                Configurar SUNAT
              </button>
              <button
                onClick={() => router.push('/sunat/documents')}
                className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
              >
                📋 Ver Documentos Electrónicos
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
