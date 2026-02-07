/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2 — ProductConversionsModal
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Modal para configurar unidad base y conversiones de un producto.
 * Solo visible para OWNER con flags ENABLE_ADVANCED_UNITS + ENABLE_CONVERSIONS.
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, RefreshCw, Scale, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

interface Unit {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isBase: boolean;
}

interface Conversion {
  id: string;
  fromUnit: Unit;
  toUnit: Unit;
  factor: number;
  active: boolean;
}

interface ProductInfo {
  id: string;
  name: string;
  unitType: 'UNIT' | 'KG';
  baseUnit: Unit | null;
}

interface ProductConversionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

export function ProductConversionsModal({
  isOpen,
  onClose,
  productId,
  productName,
}: ProductConversionsModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [baseUnit, setBaseUnit] = useState<Unit | null>(null);
  const [legacyUnitType, setLegacyUnitType] = useState<'UNIT' | 'KG'>('UNIT');

  // Form para nueva conversión
  const [newFromUnitId, setNewFromUnitId] = useState('');
  const [newFactor, setNewFactor] = useState('');

  useEffect(() => {
    if (isOpen && productId) {
      loadData();
    }
  }, [isOpen, productId]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');

    try {
      // Cargar unidades disponibles
      const unitsRes = await fetch('/api/units');
      if (unitsRes.ok) {
        const unitsData = await unitsRes.json();
        setUnits(unitsData.units || []);
      }

      // Cargar info del producto y conversiones
      const convRes = await fetch(`/api/units/products/${productId}/conversions`);
      if (convRes.ok) {
        const convData = await convRes.json();
        setConversions(convData.conversions || []);
        setBaseUnit(convData.baseUnit || null);
        setLegacyUnitType(convData.baseUnitCode || 'UNIT');
      }

      // Cargar unidad base específica
      const baseRes = await fetch(`/api/units/products/${productId}/base-unit`);
      if (baseRes.ok) {
        const baseData = await baseRes.json();
        if (baseData.baseUnit) {
          setBaseUnit(baseData.baseUnit);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar datos');
    } finally {
      setLoadingData(false);
    }
  };

  const handleUpdateBaseUnit = async (unitId: string) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/units/products/${productId}/base-unit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUnitId: unitId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar unidad base');
      }

      const data = await res.json();
      setBaseUnit(data.baseUnit);
      setSuccess('Unidad base actualizada');
      
      // Limpiar conversiones incompatibles (ya que cambiamos el toUnit)
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setLoading(false);
    }
  };

  const handleAddConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newFromUnitId || !newFactor) {
      setError('Selecciona una unidad y escribe el factor');
      return;
    }

    const factor = parseFloat(newFactor);
    if (isNaN(factor) || factor <= 0) {
      setError('El factor debe ser un número positivo');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/units/products/${productId}/conversions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUnitId: newFromUnitId,
          factor,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear conversión');
      }

      setSuccess('Conversión creada');
      setNewFromUnitId('');
      setNewFactor('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear conversión');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleConversion = async (conversionId: string, active: boolean) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/units/products/${productId}/conversions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversionId, active }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar');
      }

      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversion = async (conversionId: string) => {
    if (!window.confirm('¿Eliminar esta conversión?')) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/units/products/${productId}/conversions?conversionId=${conversionId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar');
      }

      setSuccess('Conversión eliminada');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Unidades disponibles para conversiones (excluir la unidad base)
  const availableUnitsForConversion = units.filter(u => u.id !== baseUnit?.id);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Unidades y Conversiones
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Producto */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Producto:</p>
            <p className="font-medium text-gray-900 dark:text-white">{productName}</p>
          </div>

          {loadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Unidad Base */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unidad Base (stock)
                </label>
                <select
                  value={baseUnit?.id || ''}
                  onChange={(e) => handleUpdateBaseUnit(e.target.value)}
                  disabled={loading}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleccionar unidad base</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  El stock se medirá en esta unidad. Actual: {legacyUnitType}
                </p>
              </div>

              {/* Conversiones */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Conversiones
                  </label>
                  <button
                    onClick={loadData}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Refrescar"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {conversions.length === 0 ? (
                  <p className="text-sm text-gray-500 italic py-4 text-center">
                    No hay conversiones configuradas
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conversions.map((conv) => (
                      <div
                        key={conv.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          conv.active
                            ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950'
                            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 opacity-60'
                        }`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            1 {conv.fromUnit.code} = {conv.factor} {conv.toUnit.code}
                          </p>
                          <p className="text-xs text-gray-500">
                            {conv.fromUnit.name} → {conv.toUnit.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleConversion(conv.id, !conv.active)}
                            disabled={loading}
                            className="p-1 hover:bg-white dark:hover:bg-gray-800 rounded transition-colors"
                            title={conv.active ? 'Desactivar' : 'Activar'}
                          >
                            {conv.active ? (
                              <ToggleRight className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteConversion(conv.id)}
                            disabled={loading}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agregar Conversión */}
              {baseUnit && (
                <form onSubmit={handleAddConversion} className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Agregar Conversión
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">De unidad</label>
                      <select
                        value={newFromUnitId}
                        onChange={(e) => setNewFromUnitId(e.target.value)}
                        disabled={loading}
                        className="w-full h-9 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar...</option>
                        {availableUnitsForConversion.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.code} - {unit.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-500 mb-1">Factor</label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={newFactor}
                        onChange={(e) => setNewFactor(e.target.value)}
                        disabled={loading}
                        className="w-full h-9 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="12"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-500 mb-1">A unidad</label>
                      <div className="h-9 px-2 flex items-center text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-400">
                        {baseUnit.code}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !newFromUnitId || !newFactor}
                      className="h-9 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Ejemplo visual */}
                  {newFromUnitId && newFactor && (
                    <div className="mt-2 p-2 bg-indigo-50 dark:bg-indigo-950 rounded-md text-sm text-indigo-700 dark:text-indigo-300">
                      1 {units.find(u => u.id === newFromUnitId)?.code || '?'} = {newFactor} {baseUnit.code}
                    </div>
                  )}
                </form>
              )}
            </>
          )}

          {/* Messages */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md text-sm text-green-700 dark:text-green-300">
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
