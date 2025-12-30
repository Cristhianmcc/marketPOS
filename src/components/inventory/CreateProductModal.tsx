'use client';

import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Upload, Loader2 } from 'lucide-react';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductSuggestion {
  id: string;
  name: string;
  brand: string | null;
  content: string | null;
  barcode: string | null;
  category: string;
  alreadyInStore: boolean;
  matchType: 'exact_barcode' | 'name_contains';
}

export function CreateProductModal({ isOpen, onClose, onSuccess }: CreateProductModalProps) {
  const [tab, setTab] = useState<'with-code' | 'without-code'>('with-code');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    unitType: 'UNIT' as 'UNIT' | 'KG',
    category: 'Abarrotes',
    brand: '',
    content: '',
    barcode: '',
    price: '',
    stock: '',
    minStock: '',
    imageUrl: '',
  });

  const categories = [
    'Abarrotes',
    'Bebidas',
    'Lácteos',
    'Carnes',
    'Frutas y Verduras',
    'Panadería',
    'Snacks',
    'Limpieza',
    'Cuidado Personal',
    'Otros',
  ];

  // Autofocus en barcode cuando se abre el modal (para pistola escáner)
  useEffect(() => {
    if (isOpen && tab === 'with-code' && barcodeInputRef.current) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, tab]);

  // ✅ MÓDULO 18.1: Buscar sugerencias cuando cambia el barcode
  useEffect(() => {
    const checkDuplicates = async () => {
      if (tab === 'with-code' && formData.barcode && formData.barcode.length >= 8) {
        try {
          const res = await fetch(`/api/products/suggest?barcode=${encodeURIComponent(formData.barcode)}`);
          if (res.ok) {
            const data = await res.json();
            setSuggestions(data.suggestions || []);
            if (data.suggestions && data.suggestions.length > 0) {
              setShowDuplicateWarning(true);
            }
          }
        } catch (err) {
          console.error('Error checking duplicates:', err);
        }
      } else {
        setSuggestions([]);
        setShowDuplicateWarning(false);
      }
    };

    const timeoutId = setTimeout(checkDuplicates, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [formData.barcode, tab]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP');
      return;
    }

    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar 5MB');
      return;
    }

    try {
      setUploadingImage(true);
      setError('');

      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/uploads/product-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al subir imagen');
      }

      const data = await res.json();
      setFormData(prev => ({ ...prev, imageUrl: data.url }));
    } catch (err) {
      console.error('Error uploading image:', err);
      setError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // ✅ MÓDULO 18.1: Si hay duplicado por barcode, reutilizar ProductMaster
      const barcodeSuggestion = suggestions.find(s => s.matchType === 'exact_barcode');
      
      if (barcodeSuggestion && !barcodeSuggestion.alreadyInStore) {
        // Producto existe en catálogo pero no en esta tienda → importar
        const price = parseFloat(formData.price);
        if (isNaN(price) || price <= 0) {
          setError('El precio debe ser mayor a 0');
          setLoading(false);
          return;
        }

        const stock = formData.stock && formData.stock.trim() !== '' ? parseFloat(formData.stock) : null;
        const minStock = formData.minStock && formData.minStock.trim() !== '' ? parseFloat(formData.minStock) : null;

        const storeProductPayload = {
          productId: barcodeSuggestion.id,
          price,
          stock,
          minStock,
          active: true,
        };

        const storeRes = await fetch('/api/store-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storeProductPayload),
        });

        if (!storeRes.ok) {
          const storeData = await storeRes.json();
          setError(storeData.error || 'Error al configurar producto en tienda');
          setLoading(false);
          return;
        }

        onSuccess();
        onClose();
        resetForm();
        return;
      }

      if (barcodeSuggestion && barcodeSuggestion.alreadyInStore) {
        setError('Este producto ya existe en tu tienda');
        setLoading(false);
        return;
      }

      // Validar precio
      const price = parseFloat(formData.price);
      if (isNaN(price) || price <= 0) {
        setError('El precio debe ser mayor a 0');
        setLoading(false);
        return;
      }

      // Validar stock si es UNIT
      if (formData.unitType === 'UNIT' && formData.stock) {
        const stock = parseFloat(formData.stock);
        if (!Number.isInteger(stock)) {
          setError('El stock para productos por UNIDAD debe ser un número entero');
          setLoading(false);
          return;
        }
      }

      // Paso 1: Crear producto en catálogo maestro
      const productPayload = {
        name: formData.name,
        unitType: formData.unitType,
        category: formData.category,
        barcode: tab === 'with-code' && formData.barcode ? formData.barcode : null,
        brand: formData.brand || null,
        content: formData.content || null,
        imageUrl: formData.imageUrl || null,
      };

      const productRes = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productPayload),
      });

      const productData = await productRes.json();

      if (!productRes.ok) {
        setError(productData.error || 'Error al crear producto');
        setLoading(false);
        return;
      }

      // Paso 2: Configurar producto para la tienda
      const stock = formData.stock && formData.stock.trim() !== '' ? parseFloat(formData.stock) : null;
      const minStock = formData.minStock && formData.minStock.trim() !== '' ? parseFloat(formData.minStock) : null;

      const storeProductPayload = {
        productId: productData.product.id,
        price,
        stock,
        minStock,
        active: true,
      };

      const storeRes = await fetch('/api/store-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeProductPayload),
      });

      if (!storeRes.ok) {
        const storeData = await storeRes.json();
        setError(storeData.error || 'Error al configurar producto en tienda');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error creating product:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      unitType: 'UNIT',
      category: 'Abarrotes',
      brand: '',
      content: '',
      barcode: '',
      price: '',
      stock: '',
      minStock: '',
      imageUrl: '',
    });
    setError('');
    setSuggestions([]);
    setShowDuplicateWarning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#1F2A37]">Nuevo Producto</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('with-code')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'with-code'
                ? 'text-[#16A34A] border-b-2 border-[#16A34A]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Con código de barras
          </button>
          <button
            onClick={() => setTab('without-code')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'without-code'
                ? 'text-[#16A34A] border-b-2 border-[#16A34A]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sin código
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Ej: Arroz Extra"
            />
          </div>

          {tab === 'with-code' && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Código de barras *
                  <span className="text-xs text-gray-500 ml-2">(Puedes usar pistola escáner)</span>
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  required={tab === 'with-code'}
                  pattern="[0-9]{8,14}"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="Escanea o escribe el código"
                  autoComplete="off"
                />
              </div>

              {/* ✅ MÓDULO 18.1: Mostrar advertencia de duplicado */}
              {showDuplicateWarning && suggestions.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        Producto encontrado en el catálogo
                      </p>
                      {suggestions.map((sug) => (
                        <div key={sug.id} className="text-sm text-blue-800 mb-2">
                          <p className="font-medium">{sug.name}</p>
                          {sug.brand && <p className="text-xs">{sug.brand}</p>}
                          {sug.alreadyInStore ? (
                            <p className="text-xs text-red-600 font-medium mt-1">
                              ⚠️ Ya existe en tu tienda
                            </p>
                          ) : (
                            <p className="text-xs text-green-600 font-medium mt-1">
                              ✓ Se reutilizará este producto. Solo configura tu precio y stock.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Campo de imagen del producto */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Imagen del producto
            </label>
            <div className="flex items-center gap-3">
              {formData.imageUrl && (
                <img
                  src={formData.imageUrl}
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
                        {formData.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
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
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG o WEBP. Máximo 5MB.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Tipo de unidad *
            </label>
            <select
              value={formData.unitType}
              onChange={(e) =>
                setFormData({ ...formData, unitType: e.target.value as 'UNIT' | 'KG' })
              }
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              <option value="UNIT">Unidad</option>
              <option value="KG">Kilogramo (kg)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Categoría *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Marca
            </label>
            <input
              type="text"
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2A37] mb-2">
              Contenido
            </label>
            <input
              type="text"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              placeholder="Ej: 1kg, 500ml"
            />
          </div>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <p className="text-sm font-medium text-[#1F2A37] mb-3">Configuración para tu tienda</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Precio de venta (S/) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder="Ej: 2.50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock inicial {formData.unitType === 'KG' ? '(Opcional)' : ''}
                </label>
                <input
                  type="number"
                  step={formData.unitType === 'UNIT' ? '1' : '0.01'}
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  placeholder={formData.unitType === 'UNIT' ? 'Ej: 100' : 'Ej: 25.5'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2A37] mb-2">
                  Stock mínimo (Opcional)
                </label>
                <input
                  type="number"
                  step={formData.unitType === 'UNIT' ? '1' : '0.01'}
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
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

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-10 px-4 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
