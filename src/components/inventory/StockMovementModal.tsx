'use client';

import { useEffect, useState } from 'react';
import { X, Package } from 'lucide-react';
import { useFlags } from '@/hooks/useFlags';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeProduct: {
    id: string;
    stock: number | null;
    product?: {
      name: string;
      unitType: 'UNIT' | 'KG';
    };
  };
}

export function StockMovementModal({
  isOpen,
  onClose,
  onSuccess,
  storeProduct,
}: StockMovementModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<'PURCHASE' | 'ADJUSTMENT'>('PURCHASE');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');

  const { isOn } = useFlags();
  const batchesEnabled = isOn('ENABLE_BATCH_EXPIRY');
  // Lotes activos: si existen, el producto se controla por lote y el ajuste
  // manual solo admite salidas indicando el lote (las entradas van en Lotes).
  const [lots, setLots] = useState<{ id: string; batchNumber: string; expiryDate: string; quantityAvailable: number }[]>([]);
  const [batchId, setBatchId] = useState('');
  const [hasLotHistory, setHasLotHistory] = useState(false);
  const tracksLots = batchesEnabled && hasLotHistory;

  useEffect(() => {
    if (!isOpen || !batchesEnabled) {
      setLots([]);
      setHasLotHistory(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/batches?storeProductId=${encodeURIComponent(storeProduct.id)}`)
      .then((res) => (res.ok ? res.json() : { batches: [] }))
      .then((data) => {
        if (cancelled) return;
        const all = data.batches ?? [];
        setLots(all.filter((b: { active: boolean; quantityAvailable: number }) => b.active && b.quantityAvailable > 0));
        setHasLotHistory(all.length > 0);
        if (all.length > 0) setType('ADJUSTMENT');
      })
      .catch(() => { if (!cancelled) setLots([]); });
    return () => { cancelled = true; };
  }, [isOpen, batchesEnabled, storeProduct.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const qty = parseFloat(quantity);
      if (tracksLots) {
        if (!(qty < 0)) {
          setError('Este producto se controla por lotes: las entradas se registran en "Lotes". Aquí solo puedes descontar (cantidad negativa).');
          setLoading(false);
          return;
        }
        if (!batchId) {
          setError('Elige de qué lote sale el ajuste.');
          setLoading(false);
          return;
        }
      }
      const payload = {
        type,
        quantity: type === 'ADJUSTMENT' && qty > 0 ? qty : qty,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        total: unitPrice && quantity ? parseFloat(unitPrice) * parseFloat(quantity) : null,
        notes: notes || null,
        batchId: tracksLots ? batchId : null,
      };

      const res = await fetch(`/api/store-products/${storeProduct.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al actualizar stock');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error updating stock:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setType('PURCHASE');
    setQuantity('');
    setUnitPrice('');
    setNotes('');
    setBatchId('');
    setError('');
    setLoading(false);
  };

  if (!isOpen) return null;

  const isUnit = storeProduct.product?.unitType === 'UNIT';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-text-main">
              Movimiento de Stock
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {storeProduct.product?.name || 'Producto'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-main mb-2">
              Stock actual
            </label>
            <div className="text-2xl font-semibold text-text-main">
              {storeProduct.stock !== null ? (
                <>
                  {storeProduct.stock} {isUnit ? 'unidades' : 'kg'}
                </>
              ) : (
                'N/A'
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-main mb-2">
              Tipo de movimiento *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'PURCHASE' | 'ADJUSTMENT')}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {!tracksLots && <option value="PURCHASE">Entrada (Compra)</option>}
              <option value="ADJUSTMENT">Ajuste</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {type === 'PURCHASE'
                ? 'Ingreso de mercadería nueva'
                : 'Corrección de stock (positivo/negativo)'}
            </p>
          </div>

          {tracksLots && (
            <div>
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  Producto controlado por lotes. Las entradas se registran en <strong>Lotes</strong>;
                  aquí solo se descuenta (merma, vencido, rotura) indicando el lote.
                </p>
              </div>
              <label className="block text-sm font-medium text-text-main mb-2">Lote *</label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                required
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Selecciona un lote</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.batchNumber} · vence {new Date(lot.expiryDate).toLocaleDateString('es-PE')} · disp. {lot.quantityAvailable}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-main mb-2">
              Cantidad *
            </label>
            <input
              type="number"
              step={isUnit ? '1' : '0.01'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={
                tracksLots ? 'Negativo, ej. -2' : type === 'ADJUSTMENT' ? 'Positivo o negativo' : isUnit ? '1' : '0.00'
              }
            />
            {isUnit && (
              <p className="text-xs text-gray-500 mt-1">
                Productos por unidad deben ser enteros
              </p>
            )}
          </div>

          {type === 'PURCHASE' && (
            <div>
              <label className="block text-sm font-medium text-text-main mb-2">
                Precio unitario (S/)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Opcional"
              />
            </div>
          )}

          {type === 'PURCHASE' && batchesEnabled && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-xs text-blue-700">
                Para registrar esta entrada con trazabilidad de lote (número y vencimiento),
                usa el botón <strong>Lotes</strong> del producto en la lista de inventario.
              </p>
            </div>
          )}

          {unitPrice && quantity && (
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total:</span>
                <span className="font-semibold text-text-main">
                  S/ {(parseFloat(unitPrice) * parseFloat(quantity)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-main mb-2">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="Observaciones opcionales"
            />
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
              className="flex-1 h-10 px-4 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Guardando...' : 'Aplicar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
