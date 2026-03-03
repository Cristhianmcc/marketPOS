'use client';

import { useState, useEffect } from 'react';
import { X, Lock, Upload, Loader2 } from 'lucide-react';

interface UnitOption {
  id: string;
  code: string;
  sunatCode: string | null;
  name: string;
  displayName: string | null;
  symbol: string | null;
  allowDecimals: boolean;
  precision: number;
}

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeProduct: {
    id: string;
    price: number;
    minStock: number | null;
    product: {
      id: string;
      name: string;
      brand: string | null;
      content: string | null;
      barcode: string | null;
      category: string;
      unitType: 'UNIT' | 'KG';
      isGlobal: boolean;
      imageUrl?: string | null;
      baseUnitId?: string | null;
    };
  };
}

export function EditProductModal({
  isOpen,
  onClose,
  onSuccess,
  storeProduct,
}: EditProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [availableUnits, setAvailableUnits] = useState<UnitOption[]>([]);

  const [form, setForm] = useState({
    name: storeProduct.product.name,
    brand: storeProduct.product.brand ?? '',
    content: storeProduct.product.content ?? '',
    barcode: storeProduct.product.barcode ?? '',
    category: storeProduct.product.category,
    price: storeProduct.price.toString(),
    minStock: storeProduct.minStock !== null ? storeProduct.minStock.toString() : '',
    imageUrl: storeProduct.product.imageUrl ?? '',
    baseUnitId: storeProduct.product.baseUnitId ?? '',
  });

  // Restablecer form cuando cambia el producto
  useEffect(() => {
    setForm({
      name: storeProduct.product.name,
      brand: storeProduct.product.brand ?? '',
      content: storeProduct.product.content ?? '',
      barcode: storeProduct.product.barcode ?? '',
      category: storeProduct.product.category,
      price: storeProduct.price.toString(),
      minStock: storeProduct.minStock !== null ? storeProduct.minStock.toString() : '',
      imageUrl: storeProduct.product.imageUrl ?? '',
      baseUnitId: storeProduct.product.baseUnitId ?? '',
    });
    setError('');
  }, [storeProduct]);

  // Cargar categorías y unidades SUNAT
  useEffect(() => {
    if (!isOpen) return;
    const defaultCats = ['Abarrotes','Bebidas','Lácteos','Carnes','Frutas y Verduras','Panadería','Snacks','Limpieza','Cuidado Personal','Otros'];

    fetch('/api/store/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => setCategories(data?.categories?.length ? data.categories : defaultCats))
      .catch(() => setCategories(defaultCats));

    fetch('/api/units?kind=GOODS')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.units?.length) {
          setAvailableUnits(data.units);
          // Si el producto no tiene baseUnitId asignado, poner el primero como default
          if (!storeProduct.product.baseUnitId) {
            const def = data.units.find((u: UnitOption) => u.code === 'UNIT') || data.units[0];
            setForm(prev => ({ ...prev, baseUnitId: def.id }));
          }
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar 5MB');
      return;
    }

    try {
      setUploadingImage(true);
      setError('');
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/uploads/product-image', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al subir imagen');
      }
      const d = await res.json();
      setForm(prev => ({ ...prev, imageUrl: d.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('El precio debe ser mayor a 0');
      setLoading(false);
      return;
    }

    try {
      const body: Record<string, string | number | null> = {
        price: priceNum,
        minStock: form.minStock !== '' ? Number(form.minStock) : null,
      };

      // Solo enviar campos del producto si no es global
      if (!storeProduct.product.isGlobal) {
        body.name      = form.name.trim();
        body.brand     = form.brand.trim() || null;
        body.content   = form.content.trim() || null;
        body.barcode   = form.barcode.trim() || null;
        body.category  = form.category;
        body.imageUrl  = form.imageUrl || null;
        body.baseUnitId = form.baseUnitId || null;
      }

      const res = await fetch(`/api/store-products/${storeProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al actualizar el producto');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating product:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isGlobal = storeProduct.product.isGlobal;
  const inputClass = "w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A] text-sm";
  const disabledClass = "w-full h-10 px-3 border border-gray-200 rounded-md bg-gray-50 text-gray-500 text-sm cursor-not-allowed";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2A37]">Editar Producto</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{storeProduct.product.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 space-y-4">
          {isGlobal && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Producto del catálogo global — solo puedes editar el precio y stock mínimo.</span>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Nombre *</label>
            {isGlobal ? (
              <input className={disabledClass} value={form.name} disabled />
            ) : (
              <input
                className={inputClass}
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                required
                placeholder="Ej: Arroz Extra"
              />
            )}
          </div>

          {/* Código de barras */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Código de barras
              <span className="text-xs text-gray-500 ml-2">(Puedes usar pistola escáner)</span>
            </label>
            {isGlobal ? (
              <input className={disabledClass} value={form.barcode} disabled />
            ) : (
              <input
                className={inputClass}
                value={form.barcode}
                onChange={e => handleChange('barcode', e.target.value)}
                placeholder="Escanea o escribe el código"
              />
            )}
          </div>

          {/* Imagen */}
          {!isGlobal && (
            <div>
              <label className="block text-sm font-medium text-[#1F2A37] mb-2">Imagen del producto</label>
              <div className="flex items-center gap-3">
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded-md border border-gray-300"
                  />
                )}
                <label className="flex-1">
                  <div className="flex items-center justify-center gap-2 h-10 px-4 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                    {uploadingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                        <span className="text-sm text-gray-600">Subiendo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-gray-600" />
                        <span className="text-sm text-gray-600">
                          {form.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                        </span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG o WEBP. Máximo 5MB.</p>
            </div>
          )}

          {/* Unidad de medida */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Unidad de medida *</label>
            {isGlobal ? (
              <input
                className={disabledClass}
                value={availableUnits.find(u => u.id === form.baseUnitId)?.displayName || availableUnits.find(u => u.id === form.baseUnitId)?.name || storeProduct.product.unitType}
                disabled
              />
            ) : (
              <select
                className={inputClass}
                value={form.baseUnitId}
                onChange={e => handleChange('baseUnitId', e.target.value)}
                required
              >
                {availableUnits.length === 0 ? (
                  <option value="">Cargando...</option>
                ) : (
                  availableUnits.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.sunatCode ? `${unit.sunatCode} — ` : ''}{unit.displayName || unit.name}{unit.symbol ? ` (${unit.symbol})` : ''}
                    </option>
                  ))
                )}
              </select>
            )}
            {availableUnits.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{availableUnits.length} unidades SUNAT disponibles</p>
            )}
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Categoría *</label>
            {isGlobal ? (
              <input className={disabledClass} value={form.category} disabled />
            ) : (
              <select
                className={inputClass}
                value={form.category}
                onChange={e => handleChange('category', e.target.value)}
                required
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Marca */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Marca</label>
            {isGlobal ? (
              <input className={disabledClass} value={form.brand} disabled />
            ) : (
              <input
                className={inputClass}
                value={form.brand}
                onChange={e => handleChange('brand', e.target.value)}
                placeholder="Opcional"
              />
            )}
          </div>

          {/* Contenido */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">Contenido</label>
            {isGlobal ? (
              <input className={disabledClass} value={form.content} disabled />
            ) : (
              <input
                className={inputClass}
                value={form.content}
                onChange={e => handleChange('content', e.target.value)}
                placeholder="Ej: 1kg, 500ml"
              />
            )}
          </div>

          {/* Sección tienda */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-[#1F2A37] mb-3">Configuración para tu tienda</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">Precio de venta (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={inputClass}
                  value={form.price}
                  onChange={e => handleChange('price', e.target.value)}
                  required
                  placeholder="Ej: 2.50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">Stock mínimo (Opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  value={form.minStock}
                  onChange={e => handleChange('minStock', e.target.value)}
                  placeholder="Para alertas de stock bajo"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || uploadingImage}
            className="flex-1 h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
