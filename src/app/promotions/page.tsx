'use client';

import { useState, useEffect } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { formatMoney } from '@/lib/money';

interface Promotion {
  id: string;
  type: 'TWO_FOR_ONE' | 'PACK_PRICE' | 'HAPPY_HOUR';
  name: string;
  active: boolean;
  productId: string | null;
  minQty: number | null;
  packPrice: number | null;
  happyStart: string | null;
  happyEnd: string | null;
  happyPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  product: {
    name: string;
    content: string | null;
  } | null;
}

interface Product {
  id: string;
  name: string;
  content: string | null;
  price: number;
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Form states
  const [type, setType] = useState<'TWO_FOR_ONE' | 'PACK_PRICE' | 'HAPPY_HOUR'>('TWO_FOR_ONE');
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [minQty, setMinQty] = useState('2');
  const [packPrice, setPackPrice] = useState('');
  const [happyStart, setHappyStart] = useState('18:00');
  const [happyEnd, setHappyEnd] = useState('20:00');
  const [happyPrice, setHappyPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    fetchPromotions();
    fetchProducts();
  }, []);

  const fetchPromotions = async () => {
    try {
      const res = await fetch('/api/promotions');
      const data = await res.json();
      setPromotions(data.promotions || []);
    } catch (error) {
      toast.error('Error al cargar promociones');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/inventory?active=true&limit=1000');
      const data = await res.json();
      setProducts(data.products.map((sp: any) => ({
        id: sp.product.id,
        name: sp.product.name,
        content: sp.product.content,
        price: sp.price,
      })));
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const body: any = {
        type,
        name,
        productId: productId || null,
      };

      if (type === 'TWO_FOR_ONE' || type === 'PACK_PRICE') {
        body.minQty = parseInt(minQty);
      }

      if (type === 'PACK_PRICE') {
        body.packPrice = parseFloat(packPrice);
      }

      if (type === 'HAPPY_HOUR') {
        const today = new Date().toISOString().split('T')[0];
        body.happyStart = `${today}T${happyStart}:00`;
        body.happyEnd = `${today}T${happyEnd}:00`;
        body.happyPrice = parseFloat(happyPrice);
      }

      if (startsAt) body.startsAt = startsAt;
      if (endsAt) body.endsAt = endsAt;

      const res = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message);
        return;
      }

      toast.success('Promoción creada');
      setShowCreateModal(false);
      resetForm();
      fetchPromotions();
    } catch (error) {
      toast.error('Error al crear promoción');
    }
  };

  const resetForm = () => {
    setName('');
    setProductId('');
    setMinQty('2');
    setPackPrice('');
    setHappyPrice('');
    setStartsAt('');
    setEndsAt('');
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/promotions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });

      toast.success(active ? 'Promoción desactivada' : 'Promoción activada');
      fetchPromotions();
    } catch (error) {
      toast.error('Error al actualizar promoción');
    }
  };

  const deletePromotion = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;

    try {
      await fetch(`/api/promotions/${id}`, {
        method: 'DELETE',
      });

      toast.success('Promoción eliminada');
      fetchPromotions();
    } catch (error) {
      toast.error('Error al eliminar promoción');
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'TWO_FOR_ONE': return '2x1';
      case 'PACK_PRICE': return 'Pack';
      case 'HAPPY_HOUR': return 'Happy Hour';
      default: return type;
    }
  };

  return (
    <AuthLayout>
      <Toaster position="top-right" />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Promociones</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Nueva Promoción
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">Cargando...</div>
        ) : (
          <div className="grid gap-4">
            {promotions.map((promo) => (
              <div
                key={promo.id}
                className={`border rounded-lg p-4 ${
                  promo.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {getTypeLabel(promo.type)}
                      </span>
                      {promo.active ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{promo.name}</h3>
                    
                    {promo.product && (
                      <p className="text-sm text-gray-600 mb-2">
                        Producto: {promo.product.name}
                        {promo.product.content && ` ${promo.product.content}`}
                      </p>
                    )}
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      {promo.type === 'TWO_FOR_ONE' && (
                        <p>• Compra {promo.minQty}, lleva {Math.floor((promo.minQty || 0) / 2)} gratis</p>
                      )}
                      {promo.type === 'PACK_PRICE' && (
                        <p>• {promo.minQty} unidades por {formatMoney(promo.packPrice || 0)}</p>
                      )}
                      {promo.type === 'HAPPY_HOUR' && promo.happyStart && promo.happyEnd && (
                        <>
                          <p>• Horario: {new Date(promo.happyStart).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} - {new Date(promo.happyEnd).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                          <p>• Precio: {formatMoney(promo.happyPrice || 0)}</p>
                        </>
                      )}
                      
                      {promo.startsAt && (
                        <p>• Desde: {new Date(promo.startsAt).toLocaleDateString('es-PE')}</p>
                      )}
                      {promo.endsAt && (
                        <p>• Hasta: {new Date(promo.endsAt).toLocaleDateString('es-PE')}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleActive(promo.id, promo.active)}
                      className={`p-2 rounded ${
                        promo.active
                          ? 'text-yellow-600 hover:bg-yellow-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {promo.active ? <PowerOff className="w-5 h-5" /> : <Power className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => deletePromotion(promo.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {promotions.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No hay promociones configuradas
              </div>
            )}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Nueva Promoción</h2>
                
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Promoción
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="TWO_FOR_ONE">2x1</option>
                      <option value="PACK_PRICE">Precio por Pack</option>
                      <option value="HAPPY_HOUR">Happy Hour</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Ej: Promo Navidad"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Producto (opcional - dejar vacío para todos)
                    </label>
                    <select
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Todos los productos</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.content && `- ${p.content}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(type === 'TWO_FOR_ONE' || type === 'PACK_PRICE') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cantidad Mínima
                      </label>
                      <input
                        type="number"
                        value={minQty}
                        onChange={(e) => setMinQty(e.target.value)}
                        min="2"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}

                  {type === 'PACK_PRICE' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Precio del Pack (S/)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={packPrice}
                        onChange={(e) => setPackPrice(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}

                  {type === 'HAPPY_HOUR' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hora Inicio
                          </label>
                          <input
                            type="time"
                            value={happyStart}
                            onChange={(e) => setHappyStart(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hora Fin
                          </label>
                          <input
                            type="time"
                            value={happyEnd}
                            onChange={(e) => setHappyEnd(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Precio Happy Hour (S/)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={happyPrice}
                          onChange={(e) => setHappyPrice(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Vigencia (Opcional)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Desde</label>
                        <input
                          type="datetime-local"
                          value={startsAt}
                          onChange={(e) => setStartsAt(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                        <input
                          type="datetime-local"
                          value={endsAt}
                          onChange={(e) => setEndsAt(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        resetForm();
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Crear
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
