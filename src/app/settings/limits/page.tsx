'use client';
// ✅ MÓDULO 15 - FASE 3: UI de Límites Operativos
// Permite configurar guardrails para proteger contra errores operativos

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface OperationalLimits {
  maxDiscountPercent: number | null;
  maxManualDiscountAmount: number | null;
  maxSaleTotal: number | null;
  maxItemsPerSale: number | null;
  maxReceivableBalance: number | null;
}

export default function OperationalLimitsPage() {
  const router = useRouter();
  const [limits, setLimits] = useState<OperationalLimits>({
    maxDiscountPercent: null,
    maxManualDiscountAmount: null,
    maxSaleTotal: null,
    maxItemsPerSale: null,
    maxReceivableBalance: null,
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadLimits();
  }, []);

  const loadLimits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/operational-limits');
      if (!res.ok) throw new Error('Error al cargar límites');
      const data = await res.json();
      setLimits(data.limits);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/admin/operational-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al guardar límites');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNumberChange = (field: keyof OperationalLimits, value: string) => {
    if (value === '' || value === null) {
      setLimits({ ...limits, [field]: null });
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setLimits({ ...limits, [field]: numValue });
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Límites Operativos</h1>
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Cargando límites...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Límites Operativos</h1>
            <p className="text-gray-600">
              Configura límites para proteger contra errores operativos. Dejar en blanco = sin límite.
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            ← Volver
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            <strong>✓</strong> Límites actualizados correctamente
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Límites de Descuentos */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              📉 Límites de Descuentos
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descuento Porcentual Máximo (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={limits.maxDiscountPercent ?? ''}
                  onChange={(e) => handleNumberChange('maxDiscountPercent', e.target.value)}
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ejemplo: 50 = no permite descuentos mayores al 50%
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descuento Manual Máximo (S/)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={limits.maxManualDiscountAmount ?? ''}
                  onChange={(e) => handleNumberChange('maxManualDiscountAmount', e.target.value)}
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ejemplo: 100 = no permite descuentos manuales mayores a S/ 100
                </p>
              </div>
            </div>
          </div>

          {/* Límites de Ventas */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              🛒 Límites de Ventas
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Máximo por Venta (S/)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={limits.maxSaleTotal ?? ''}
                  onChange={(e) => handleNumberChange('maxSaleTotal', e.target.value)}
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ejemplo: 5000 = no permite ventas mayores a S/ 5,000
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de Ítems por Venta
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={limits.maxItemsPerSale ?? ''}
                  onChange={(e) => handleNumberChange('maxItemsPerSale', e.target.value)}
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ejemplo: 50 = no permite más de 50 ítems en una venta
                </p>
              </div>
            </div>
          </div>

          {/* Límites de Cuentas por Cobrar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              💳 Límites de Cuentas por Cobrar (FIADO)
            </h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Balance Máximo por Cliente (S/)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={limits.maxReceivableBalance ?? ''}
                onChange={(e) => handleNumberChange('maxReceivableBalance', e.target.value)}
                placeholder="Sin límite"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Ejemplo: 1000 = no permite que un cliente acumule más de S/ 1,000 en deudas
              </p>
            </div>
          </div>

          {/* Información Importante */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Información Importante</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Los límites se aplican en <strong>tiempo real</strong> durante el checkout</li>
              <li>• Dejar un campo vacío significa <strong>sin límite</strong></li>
              <li>• 0 NO significa deshabilitado (usar campo vacío para eso)</li>
              <li>• Los cambios se aplican inmediatamente</li>
            </ul>
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
            <button
              type="button"
              onClick={loadLimits}
              disabled={saving}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Recargar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
