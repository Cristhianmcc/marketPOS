'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.3 — GESTIÓN DE PRECIOS POR UNIDAD DE VENTA
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Componente para gestionar precios especiales por unidad de venta.
 * Solo visible si ENABLE_SELLUNIT_PRICING está activo.
 * 
 * EJEMPLOS:
 * - CAJA (12 und) → Precio normal: 12 × S/0.50 = S/6.00
 *                   Precio especial: S/5.00 (ahorro de S/1.00)
 * - PAQUETE (6 und) → Precio especial: S/2.50 (en lugar de S/3.00)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Save, X, RefreshCw, AlertCircle, Tag, Info } from 'lucide-react';

interface Unit {
  id: string;
  sunatCode: string | null;
  displayName: string | null;
  symbol: string | null;
}

interface Conversion {
  id: string;
  fromUnitId: string;
  toUnitId: string;
  factorToBase: number;
  active: boolean;
  fromUnit: Unit;
  toUnit: Unit;
}

interface SellUnitPrice {
  id: string;
  sellUnitId: string;
  price: number;
  active: boolean;
  notes: string | null;
  sellUnit: Unit;
}

interface SellUnitPriceManagerProps {
  productMasterId: string;
  productName: string;
  baseUnit: Unit | null;
  basePrice: number; // Precio base por unidad
  onClose?: () => void;
  compact?: boolean;
}

export function SellUnitPriceManager({
  productMasterId,
  productName,
  baseUnit,
  basePrice,
  onClose,
  compact = false,
}: SellUnitPriceManagerProps) {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [sellUnitPrices, setSellUnitPrices] = useState<SellUnitPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // ID del que está guardando
  const [error, setError] = useState<string | null>(null);

  // Form para editar/crear precios
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Cargar conversiones (para saber qué unidades tiene el producto)
  const loadConversions = useCallback(async () => {
    try {
      const res = await fetch(`/api/units/conversions?productMasterId=${productMasterId}`);
      if (!res.ok) {
        if (res.status === 403) {
          // Conversiones deshabilitadas = sin unidades alternativas
          setConversions([]);
          return;
        }
        throw new Error('Error al cargar conversiones');
      }
      const data = await res.json();
      setConversions((data.conversions || []).filter((c: Conversion) => c.active));
    } catch (err: any) {
      console.error('Error loading conversions:', err);
    }
  }, [productMasterId]);

  // Cargar precios por unidad de venta
  const loadSellUnitPrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/units/sell-prices?productMasterId=${productMasterId}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Los precios por unidad de venta no están habilitados');
          return;
        }
        throw new Error('Error al cargar precios');
      }
      const data = await res.json();
      setSellUnitPrices(data.prices || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [productMasterId]);

  useEffect(() => {
    loadConversions();
    loadSellUnitPrices();
  }, [loadConversions, loadSellUnitPrices]);

  // Mapear precios por sellUnitId para acceso rápido
  const priceByUnit = useMemo(() => {
    const map = new Map<string, SellUnitPrice>();
    sellUnitPrices.forEach(p => map.set(p.sellUnitId, p));
    return map;
  }, [sellUnitPrices]);

  // Calcular precio "normal" (factor × precio base) para cada conversión
  const getCalculatedPrice = useCallback((factor: number) => {
    return Math.round(factor * basePrice * 100) / 100;
  }, [basePrice]);

  // Guardar precio
  const handleSavePrice = async (sellUnitId: string) => {
    const priceValue = parseFloat(editPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      setError('Ingresa un precio válido');
      return;
    }

    try {
      setSaving(sellUnitId);
      setError(null);

      const existingPrice = priceByUnit.get(sellUnitId);

      if (existingPrice) {
        // Actualizar precio existente
        const res = await fetch(`/api/units/sell-prices/${existingPrice.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            price: priceValue,
            notes: editNotes.trim() || null,
            active: priceValue > 0,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al actualizar');
        }
      } else {
        // Crear nuevo precio
        const res = await fetch('/api/units/sell-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productMasterId,
            sellUnitId,
            price: priceValue,
            notes: editNotes.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al crear');
        }
      }

      await loadSellUnitPrices();
      setEditingId(null);
      setEditPrice('');
      setEditNotes('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  // Eliminar precio (vuelve a precio calculado)
  const handleRemovePrice = async (sellUnitId: string) => {
    const existingPrice = priceByUnit.get(sellUnitId);
    if (!existingPrice) return;

    try {
      setSaving(sellUnitId);
      setError(null);

      const res = await fetch(`/api/units/sell-prices/${existingPrice.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar');
      }

      await loadSellUnitPrices();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  // Iniciar edición
  const startEditing = (sellUnitId: string, currentPrice?: number, currentNotes?: string | null) => {
    setEditingId(sellUnitId);
    setEditPrice(currentPrice?.toString() || '');
    setEditNotes(currentNotes || '');
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Cargando precios...
      </div>
    );
  }

  // Sin conversiones = no hay unidades alternativas para fijar precio
  if (conversions.length === 0) {
    return (
      <div className={`${compact ? '' : 'bg-white rounded-lg border border-gray-200 p-4'}`}>
        <div className="flex items-center gap-2 text-amber-600 mb-2">
          <Info className="w-5 h-5" />
          <span className="font-medium">Sin unidades alternativas</span>
        </div>
        <p className="text-sm text-gray-500">
          Primero configura conversiones de unidades para poder asignar precios por presentación.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-3 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            Cerrar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${compact ? '' : 'bg-white rounded-lg border border-gray-200 p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-green-600" />
            Precios por Presentación
          </h3>
          <p className="text-sm text-gray-500">
            {productName} — Precio base: S/ {basePrice.toFixed(2)} / {baseUnit?.symbol || 'und'}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <strong>Precio especial:</strong> Define un precio fijo por presentación en lugar del precio calculado.
        El precio especial aplica ANTES de promociones y descuentos.
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lista de unidades con precio */}
      <div className="space-y-2">
        {conversions.map((conv) => {
          const existingPrice = priceByUnit.get(conv.fromUnitId);
          const calculatedPrice = getCalculatedPrice(conv.factorToBase);
          const hasOverride = existingPrice && existingPrice.active;
          const isEditing = editingId === conv.fromUnitId;
          const isSaving = saving === conv.fromUnitId;

          return (
            <div
              key={conv.id}
              className={`p-3 rounded-lg border ${
                hasOverride 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {/* Nombre de unidad */}
                  <div className="font-medium text-gray-900">
                    {conv.fromUnit.displayName || conv.fromUnit.sunatCode}
                    <span className="text-gray-400 text-sm ml-2">
                      ({conv.factorToBase} {baseUnit?.symbol || 'und'})
                    </span>
                  </div>

                  {/* Precio */}
                  {isEditing ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">
                          S/
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 pl-7 pr-2 py-1 border rounded text-sm"
                          placeholder={calculatedPrice.toFixed(2)}
                          autoFocus
                        />
                      </div>
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                        placeholder="Notas (opcional)"
                        maxLength={100}
                      />
                      <button
                        onClick={() => handleSavePrice(conv.fromUnitId)}
                        disabled={isSaving}
                        className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {isSaving ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-500 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-3">
                      {hasOverride ? (
                        <>
                          <span className="text-lg font-bold text-green-700">
                            S/ {Number(existingPrice.price).toFixed(2)}
                          </span>
                          <span className="text-sm text-gray-400 line-through">
                            S/ {calculatedPrice.toFixed(2)}
                          </span>
                          {calculatedPrice > Number(existingPrice.price) && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              Ahorro: S/ {(calculatedPrice - Number(existingPrice.price)).toFixed(2)}
                            </span>
                          )}
                          {existingPrice.notes && (
                            <span className="text-xs text-gray-500 italic">
                              {existingPrice.notes}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-600">
                          S/ {calculatedPrice.toFixed(2)}
                          <span className="text-xs text-gray-400 ml-1">(calculado)</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditing(
                        conv.fromUnitId, 
                        hasOverride ? Number(existingPrice.price) : undefined,
                        existingPrice?.notes
                      )}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title={hasOverride ? 'Editar precio' : 'Agregar precio especial'}
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                    {hasOverride && (
                      <button
                        onClick={() => handleRemovePrice(conv.fromUnitId)}
                        disabled={isSaving}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                        title="Quitar precio especial"
                      >
                        {isSaving ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen */}
      <div className="mt-4 pt-3 border-t text-sm text-gray-500">
        {sellUnitPrices.filter(p => p.active).length} de {conversions.length} presentaciones con precio especial
      </div>
    </div>
  );
}
