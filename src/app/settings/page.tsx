'use client';

import { useState, useEffect, useRef } from 'react';
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
  ticketLogo: string | null;
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
    ticketLogo: '',
    taxRate: 0,
  });

  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
        ticketLogo: data.settings?.ticketLogo || '',
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

            {/* Configuración fiscal */}
            <div className="border-t pt-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Configuración Fiscal</h2>
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

        {/* Ticket / Recibo Section - siempre visible en web y desktop */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">🧾 Personalización del Ticket</h2>
          <p className="text-gray-500 text-sm mb-4">
            Configura cómo se ve el ticket impreso (navegador y/o impresora térmica).
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                const res = await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(formData),
                });
                if (res.ok) setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
              } finally {
                setSaving(false);
              }
            }}
            className="space-y-4"
          >
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo de la tienda (en el ticket)
              </label>
              <div className="flex items-center gap-4">
                {formData.ticketLogo ? (
                  <img
                    src={formData.ticketLogo}
                    alt="Logo actual"
                    className="h-14 object-contain border border-gray-200 rounded p-1 bg-white"
                  />
                ) : (
                  <div className="h-14 w-28 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs text-center">
                    Sin logo
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    ref={logoInputRef}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLogoUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('image', file);
                        const res = await fetch('/api/uploads/store-logo', { method: 'POST', body: fd });
                        const data = await res.json();
                        if (data.url) {
                          setFormData(prev => ({ ...prev, ticketLogo: data.url }));
                        } else {
                          alert(data.error || 'Error al subir logo');
                        }
                      } finally {
                        setLogoUploading(false);
                        if (logoInputRef.current) logoInputRef.current.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    {logoUploading ? 'Subiendo...' : '📷 Subir logo'}
                  </button>
                  {formData.ticketLogo && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, ticketLogo: '' }))}
                      className="px-3 py-1.5 text-red-600 text-sm hover:underline text-left"
                    >
                      Quitar logo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Aparece arriba del nombre en el ticket impreso. Máx 3MB, fondo blanco recomendado.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pie de página / Mensaje de despedida
              </label>
              <textarea
                rows={2}
                value={formData.ticketFooter}
                onChange={(e) => setFormData({ ...formData, ticketFooter: e.target.value })}
                placeholder="Ej: Gracias por su compra!"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Aparece al final del recibo web y del ticket de la impresora térmica.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              {success && <span className="text-green-600 text-sm">✓ Guardado</span>}
            </div>
          </form>

          {/* En desktop también hay opciones avanzadas de impresora térmica */}
          {typeof window !== 'undefined' && (window as any).desktop?.isDesktop && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600 mb-2">
                Para configurar la impresora térmica (Epson, USB, ancho de papel, QR, etc.):
              </p>
              <button
                onClick={() => router.push('/settings/printer')}
                className="px-5 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium text-sm"
              >
                ⚙️ Configuración avanzada de impresora
              </button>
            </div>
          )}

          {/* En web, explicar cómo funciona la impresión */}
          {!(typeof window !== 'undefined' && (window as any).desktop?.isDesktop) && (
            <div className="mt-4 pt-4 border-t flex items-start gap-2 text-sm text-gray-500">
              <span className="text-lg">🌐</span>
              <span>
                En la versión web, el ticket se imprime usando el diálogo del navegador.
                Para impresión directa con Epson u otras impresoras térmicas,
                usa la <strong>aplicación de escritorio</strong>.
              </span>
            </div>
          )}
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

        {/* Base de datos y impresora térmica - solo Desktop */}
        {typeof window !== 'undefined' && (window as any).desktop?.isDesktop && (
          <>
            <div className="mt-8 bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">🗄️ Base de Datos Local</h2>
              <p className="text-gray-600 mb-4">
                Configura PostgreSQL embebido para funcionamiento offline completo.
              </p>
              <button
                onClick={() => router.push('/settings/database')}
                className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-medium"
              >
                Configurar Base de Datos
              </button>
            </div>
          </>
        )}

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
