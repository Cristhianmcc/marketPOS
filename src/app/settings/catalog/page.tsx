'use client';

import { useState, useEffect } from 'react';
import {
  Globe,
  ShoppingBag,
  MessageCircle,
  Save,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Upload,
  X,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface CatalogSettings {
  id: string;
  enabled: boolean;
  slug: string;
  whatsappNumber: string | null;
  catalogUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  storeLogoPath?: string;
  storeBannerPath?: string;
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="currentColor">
    <path d="M16.6 3c1.2 1.2 2.7 1.9 4.4 2.1v2.5c-1.6-.1-3.1-.6-4.4-1.5v7.4c0 3-2.5 5.5-5.5 5.5S5.6 16.9 5.6 13.9s2.5-5.5 5.5-5.5c.4 0 .8 0 1.2.1v2.6c-.4-.2-.8-.3-1.2-.3-1.5 0-2.6 1.2-2.6 2.6s1.2 2.6 2.6 2.6 2.6-1.2 2.6-2.6V3h2.9z" />
  </svg>
);

export default function CatalogSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [formData, setFormData] = useState({
    enabled: false,
    slug: '',
    whatsappNumber: '',
    facebookUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    storeLogoPath: '',
    storeBannerPath: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/catalog/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (data) {
          setFormData({
            enabled: data.enabled,
            slug: data.slug || '',
            whatsappNumber: data.whatsappNumber || '',
            facebookUrl: data.facebookUrl || '',
            instagramUrl: data.instagramUrl || '',
            tiktokUrl: data.tiktokUrl || '',
            storeLogoPath: data.storeLogoPath || '',
            storeBannerPath: data.storeBannerPath || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/catalog/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success('Configuración guardada correctamente');
        fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File, type: 'logo' | 'banner') => {
    if (type === 'logo') setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('type', type);

      const res = await fetch('/api/catalog/upload', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json();
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message || err?.message || JSON.stringify(err);
        toast.error(msg || 'Error al subir imagen');
        return;
      }

      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        [type === 'logo' ? 'storeLogoPath' : 'storeBannerPath']: data.url,
      }));
      toast.success(`${type === 'logo' ? 'Logo' : 'Banner'} actualizado`);
    } catch (error) {
      toast.error('Error al subir imagen');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const publicBaseUrl =
    process.env.NEXT_PUBLIC_CATALOG_BASE_URL ||
    process.env.NEXT_PUBLIC_CATALOG_API_BASE_URL ||
    `${window.location.protocol}//${window.location.host}`;

  const normalizedSlug = (formData.slug || '').trim().replace(/^\/+|\/+$/g, '');
  const catalogPath = normalizedSlug ? `/c/${normalizedSlug}` : '';
  const catalogUrl = normalizedSlug
    ? `${publicBaseUrl.replace(/\/+$/, '')}/c/${normalizedSlug}`
    : (settings?.catalogUrl || '');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Toaster position="top-right" richColors />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" />
            Catálogo Web Público
          </h1>
          <p className="text-muted-foreground">
            Configura cómo se verá tu tienda en línea para tus clientes.
          </p>
        </div>
        {formData.slug && formData.enabled ? (
          <a
            href={catalogPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Ver catálogo <ExternalLink className="w-4 h-4" />
          </a>
        ) : null}
      </div>

      <div className="grid gap-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main Toggle */}
          <div
            className={`p-4 rounded-xl border-2 transition-all ${
              formData.enabled ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    formData.enabled
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Estado del Catálogo</h3>
                  <p className="text-sm text-muted-foreground">
                    Activa o desactiva la visibilidad pública de tus productos.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData({ ...formData, enabled: e.target.checked })
                  }
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Slug Configuration */}
            <div className="bg-card p-6 rounded-xl border border-border space-y-4">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <Globe className="w-4 h-4 text-primary" />
                URL del Catálogo
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Ruta personalizada (Slug)
                </label>
                <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="bg-muted px-3 py-2 text-sm text-muted-foreground border-r">
                    /c/
                  </span>
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-transparent outline-none text-sm"
                    placeholder="mi-tienda"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-'),
                      })
                    }
                    required
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {formData.slug && formData.enabled ? (
                    <>
                      URL actual:{' '}
                      <span className="text-primary break-all">{catalogUrl}</span>
                    </>
                  ) : (
                    <span>Publica el catálogo para obtener el enlace público.</span>
                  )}
                </p>
              </div>
            </div>

            {/* WhatsApp Configuration */}
            <div className="bg-card p-6 rounded-xl border border-border space-y-4">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <MessageCircle className="w-4 h-4 text-green-500" />
                Pedidos por WhatsApp
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Número de WhatsApp
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg flex-1 bg-transparent outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Ej: 51900000000"
                  value={formData.whatsappNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, whatsappNumber: e.target.value })
                  }
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Incluye código de país (ej: 51 para Perú).
                </p>
              </div>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="bg-card p-6 rounded-xl border border-border space-y-4">
            <h3 className="font-semibold">Redes sociales</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1877F2]">
                  <span className="text-[#1877F2] font-semibold">f</span>
                  Facebook
                </div>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="https://facebook.com/tu-pagina"
                  value={formData.facebookUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, facebookUrl: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#E4405F]">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E4405F] text-white text-[10px]">
                    IG
                  </span>
                  Instagram
                </div>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="https://instagram.com/tu-cuenta"
                  value={formData.instagramUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, instagramUrl: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-black">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black text-white">
                    <TikTokIcon />
                  </span>
                  TikTok
                </div>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="https://tiktok.com/@tu-cuenta"
                  value={formData.tiktokUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, tiktokUrl: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Logo & Banner Upload */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Logo Upload */}
            <div className="bg-card p-6 rounded-xl border border-border space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                Logo de la Tienda
              </h3>
              <div className="space-y-3">
                {formData.storeLogoPath && (
                  <div className="relative">
                    <img
                      src={formData.storeLogoPath}
                      alt="Logo preview"
                      className="w-24 h-24 rounded-lg border border-gray-200 object-cover"
                      onError={() =>
                        setFormData((prev) => ({ ...prev, storeLogoPath: '' }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, storeLogoPath: '' }))
                      }
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) handleImageUpload(file, 'logo');
                    }}
                    disabled={uploadingLogo}
                    className="sr-only"
                  />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                    {uploadingLogo ? (
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm font-medium text-gray-700">
                          Haz clic para subir
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG hasta 2MB</p>
                      </>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Banner Upload */}
            <div className="bg-card p-6 rounded-xl border border-border space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                Banner Promocional
              </h3>
              <div className="space-y-3">
                {formData.storeBannerPath && (
                  <div className="relative">
                    <img
                      src={formData.storeBannerPath}
                      alt="Banner preview"
                      className="w-full h-24 rounded-lg border border-gray-200 object-cover"
                      onError={() =>
                        setFormData((prev) => ({ ...prev, storeBannerPath: '' }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, storeBannerPath: '' }))
                      }
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) handleImageUpload(file, 'banner');
                    }}
                    disabled={uploadingBanner}
                    className="sr-only"
                  />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                    {uploadingBanner ? (
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm font-medium text-gray-700">
                          Haz clic para subir
                        </p>
                        <p className="text-xs text-gray-500">
                          PNG, JPG hasta 3MB (ancho: 1200px)
                        </p>
                      </>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Configuración
            </button>
          </div>
        </form>

        {/* Sync Info */}
        <div className="mt-8 bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-blue-900 text-sm">
              Información de Sincronización
            </h4>
            <p className="text-blue-800 text-xs mt-1">
              Recuerda que para que los productos aparezcan en el catálogo, primero
              debes marcarlos como "Mostrar en catálogo" en tu inventario y luego
              pulsar el botón "Publicar" desde la aplicación portable (Desktop).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
