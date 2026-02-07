'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — GESTIÓN DE CONVERSIONES DE UNIDADES
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Componente para gestionar las conversiones de unidades de un producto.
 * Solo visible si ENABLE_CONVERSIONS está activo.
 * 
 * EJEMPLOS HELPER:
 * - CAJA → UNIDAD: factor 12 (1 caja = 12 unidades)
 * - CM → M: factor 0.01 (1 cm = 0.01 m)
 * - ML → L: factor 0.001 (1 ml = 0.001 L)
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, X, RefreshCw, AlertCircle } from 'lucide-react';

interface Unit {
  id: string;
  sunatCode: string | null;
  displayName: string | null;
  symbol: string | null;
  allowDecimals: boolean;
}

interface Conversion {
  id: string;
  fromUnitId: string;
  toUnitId: string;
  factorToBase: number;
  roundingMode: 'NONE' | 'ROUND' | 'CEIL' | 'FLOOR';
  active: boolean;
  fromUnit: Unit;
  toUnit: Unit;
}

interface UnitConversionsManagerProps {
  productMasterId: string;
  productName: string;
  baseUnit: Unit | null;
  onClose?: () => void;
  compact?: boolean;
}

const ROUNDING_MODES = [
  { value: 'NONE', label: 'Sin redondeo', description: 'Mantener decimales exactos' },
  { value: 'ROUND', label: 'Redondear', description: 'Al más cercano' },
  { value: 'CEIL', label: 'Hacia arriba', description: 'Siempre sube' },
  { value: 'FLOOR', label: 'Hacia abajo', description: 'Siempre baja' },
];

const EXAMPLE_CONVERSIONS = [
  { from: 'CAJA', to: 'NIU', factor: 12, desc: '1 caja = 12 unidades' },
  { from: 'DOCENA', to: 'NIU', factor: 12, desc: '1 docena = 12 unidades' },
  { from: 'PAQUETE', to: 'NIU', factor: 6, desc: '1 paquete = 6 unidades' },
  { from: 'CMT', to: 'MTR', factor: 0.01, desc: '1 cm = 0.01 m' },
  { from: 'MMT', to: 'MTR', factor: 0.001, desc: '1 mm = 0.001 m' },
  { from: 'MLT', to: 'LTR', factor: 0.001, desc: '1 ml = 0.001 L' },
  { from: 'GRM', to: 'KGM', factor: 0.001, desc: '1 g = 0.001 kg' },
];

export function UnitConversionsManager({
  productMasterId,
  productName,
  baseUnit,
  onClose,
  compact = false,
}: UnitConversionsManagerProps) {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form para nueva conversión
  const [showAddForm, setShowAddForm] = useState(false);
  const [newConversion, setNewConversion] = useState({
    fromUnitId: '',
    factorToBase: '',
    roundingMode: 'NONE' as 'NONE' | 'ROUND' | 'CEIL' | 'FLOOR',
  });

  // Cargar conversiones existentes
  const loadConversions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/units/conversions?productMasterId=${productMasterId}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Las conversiones de unidades no están habilitadas');
          return;
        }
        throw new Error('Error al cargar conversiones');
      }
      const data = await res.json();
      setConversions(data.conversions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [productMasterId]);

  // Cargar unidades disponibles
  const loadUnits = useCallback(async () => {
    try {
      const res = await fetch('/api/units?profile=FERRETERIA');
      if (!res.ok) throw new Error('Error al cargar unidades');
      const data = await res.json();
      // Filtrar solo unidades GOODS diferentes a la unidad base
      const allUnits = [...(data.topUnits || []), ...(data.otherUnits || [])];
      const filtered = allUnits.filter((u: Unit) => u.id !== baseUnit?.id);
      setAvailableUnits(filtered);
    } catch (err: any) {
      console.error('Error loading units:', err);
    }
  }, [baseUnit?.id]);

  useEffect(() => {
    loadConversions();
    loadUnits();
  }, [loadConversions, loadUnits]);

  // Crear nueva conversión
  const handleAddConversion = async () => {
    if (!newConversion.fromUnitId || !newConversion.factorToBase) {
      setError('Selecciona una unidad y especifica el factor');
      return;
    }

    const factor = parseFloat(newConversion.factorToBase);
    if (isNaN(factor) || factor <= 0) {
      setError('El factor debe ser un número positivo');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/units/conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productMasterId,
          fromUnitId: newConversion.fromUnitId,
          factorToBase: factor,
          roundingMode: newConversion.roundingMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear conversión');
      }

      // Recargar
      await loadConversions();
      setShowAddForm(false);
      setNewConversion({ fromUnitId: '', factorToBase: '', roundingMode: 'NONE' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Actualizar conversión
  const handleUpdateConversion = async (id: string, updates: Partial<{ factorToBase: number; roundingMode: string; active: boolean }>) => {
    try {
      setSaving(true);
      const res = await fetch(`/api/units/conversions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar');
      }

      await loadConversions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Desactivar conversión
  const handleDeleteConversion = async (id: string) => {
    if (!confirm('¿Desactivar esta conversión?')) return;
    
    try {
      setSaving(true);
      const res = await fetch(`/api/units/conversions/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al desactivar');
      }

      await loadConversions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Obtener unidades que ya tienen conversión
  const usedUnitIds = new Set(conversions.map(c => c.fromUnitId));
  const availableForNew = availableUnits.filter(u => !usedUnitIds.has(u.id));

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Cargando conversiones...
      </div>
    );
  }

  return (
    <div className={`${compact ? '' : 'bg-white rounded-lg border border-gray-200 p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Conversiones de Unidades
          </h3>
          <p className="text-sm text-gray-500">
            {productName} — Base: {baseUnit?.displayName || baseUnit?.sunatCode || 'Sin unidad'}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
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

      {/* Lista de conversiones */}
      {conversions.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <p>No hay conversiones configuradas</p>
          <p className="text-xs mt-1">
            Las conversiones permiten vender en unidades diferentes a la base
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {conversions.filter(c => c.active).map((conv) => (
            <div
              key={conv.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {conv.fromUnit.displayName || conv.fromUnit.sunatCode}
                  <span className="text-gray-400 mx-2">→</span>
                  {conv.toUnit.displayName || conv.toUnit.sunatCode}
                </div>
                <div className="text-sm text-gray-500">
                  Factor: <span className="font-mono">{conv.factorToBase}</span>
                  {conv.roundingMode !== 'NONE' && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1 rounded">
                      {conv.roundingMode}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDeleteConversion(conv.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded"
                title="Desactivar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form para añadir */}
      {showAddForm ? (
        <div className="border rounded-lg p-4 bg-blue-50">
          <h4 className="font-medium mb-3">Nueva Conversión</h4>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Unidad de venta</label>
              <select
                value={newConversion.fromUnitId}
                onChange={(e) => setNewConversion({ ...newConversion, fromUnitId: e.target.value })}
                className="w-full h-9 px-2 border rounded text-sm"
              >
                <option value="">Seleccionar...</option>
                {availableForNew.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.sunatCode} ({u.symbol})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Factor (→ {baseUnit?.symbol || 'base'})
              </label>
              <input
                type="number"
                step="any"
                min="0.000001"
                value={newConversion.factorToBase}
                onChange={(e) => setNewConversion({ ...newConversion, factorToBase: e.target.value })}
                placeholder="Ej: 12, 0.01"
                className="w-full h-9 px-2 border rounded text-sm"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Redondeo</label>
            <select
              value={newConversion.roundingMode}
              onChange={(e) => setNewConversion({ ...newConversion, roundingMode: e.target.value as any })}
              className="w-full h-9 px-2 border rounded text-sm"
            >
              {ROUNDING_MODES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </div>

          {/* Ejemplos */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1">Ejemplos típicos:</p>
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_CONVERSIONS.slice(0, 4).map((ex, i) => (
                <span key={i} className="text-xs bg-white px-2 py-0.5 rounded border">
                  {ex.desc}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAddConversion}
              disabled={saving}
              className="flex-1 h-9 bg-green-600 text-white rounded hover:bg-green-700 flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 h-9 border border-gray-300 rounded hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full h-10 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-500 hover:text-green-600 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Agregar Conversión
        </button>
      )}
    </div>
  );
}

export default UnitConversionsManager;
