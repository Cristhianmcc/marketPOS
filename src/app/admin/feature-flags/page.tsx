'use client';
// ✅ MÓDULO 15 - FASE 2: Feature Flags UI
// OWNER y SUPERADMIN pueden activar/desactivar funcionalidades

import { useState, useEffect } from 'react';
import { FeatureFlagKey } from '@prisma/client';

interface FeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
}

const FLAG_LABELS: Record<FeatureFlagKey, { name: string; description: string; critical: boolean }> = {
  ALLOW_FIADO: {
    name: 'Ventas Fiado',
    description: 'Permite realizar ventas a crédito (fiado) con clientes registrados',
    critical: true,
  },
  ALLOW_COUPONS: {
    name: 'Cupones de Descuento',
    description: 'Permite aplicar cupones de descuento en el checkout',
    critical: false,
  },
  ENABLE_PROMOTIONS: {
    name: 'Promociones por Producto',
    description: 'Promociones automáticas (2x1, pack, happy hour)',
    critical: false,
  },
  ENABLE_VOLUME_PROMOS: {
    name: 'Promociones por Volumen',
    description: 'Promociones por cantidad comprada (ej: 6 unidades x S/10)',
    critical: false,
  },
  ENABLE_NTH_PROMOS: {
    name: 'Promociones N-ésimo',
    description: 'Promociones cada N unidades (ej: cada 3era con 50% desc)',
    critical: false,
  },
  ENABLE_CATEGORY_PROMOS: {
    name: 'Promociones por Categoría',
    description: 'Promociones aplicadas a categorías completas',
    critical: false,
  },
  ENABLE_SUNAT: {
    name: 'Facturación Electrónica SUNAT',
    description: 'Habilita la generación de comprobantes electrónicos (facturas, boletas)',
    critical: true,
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // MÓDULO V0 — FLAGS MULTI-RUBRO
  // ═══════════════════════════════════════════════════════════════════════════
  ENABLE_ADVANCED_UNITS: {
    name: 'Unidades Avanzadas (Ferretería)',
    description: 'Permite vender por metro cuadrado, metro lineal, kg fraccionados y conversiones',
    critical: false,
  },
  ENABLE_CONVERSIONS: {
    name: 'Conversiones de Unidades',
    description: 'Convierte automáticamente entre unidades (ej: 1 caja = 12 unidades). Requiere Unidades Avanzadas.',
    critical: false,
  },
  ENABLE_SELLUNIT_PRICING: {
    name: 'Precio por Unidad de Venta',
    description: 'Permite definir precios especiales por presentación (ej: CAJA a S/5 en lugar de 12×S/0.50). Requiere Conversiones.',
    critical: false,
  },
  ENABLE_SERVICES: {
    name: 'Servicios (Taller/Lavandería)',
    description: 'Items de servicio como mano de obra, sin manejo de inventario',
    critical: false,
  },
  ENABLE_WORK_ORDERS: {
    name: 'Órdenes de Trabajo (Taller)',
    description: 'Gestión de recepción, diagnóstico y seguimiento de trabajos',
    critical: false,
  },
  ENABLE_RESERVATIONS: {
    name: 'Reservaciones (Hostal)',
    description: 'Check-in, check-out y disponibilidad de habitaciones',
    critical: false,
  },
  ENABLE_BATCH_EXPIRY: {
    name: 'Lotes y Vencimientos (Botica)',
    description: 'Trazabilidad de lotes, alertas de vencimiento, FIFO automático',
    critical: false,
  },
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<FeatureFlagKey | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ flag: FeatureFlagKey; newValue: boolean } | null>(null);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (!res.ok) throw new Error('Error al cargar flags');
      const data = await res.json();
      setFlags(data.flags);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: FeatureFlagKey, newValue: boolean) => {
    const flagInfo = FLAG_LABELS[key];
    
    // Si es crítica y se va a deshabilitar, pedir confirmación
    if (flagInfo.critical && !newValue) {
      setConfirmDialog({ flag: key, newValue });
      return;
    }

    // Actualizar directamente
    await updateFlag(key, newValue);
  };

  const updateFlag = async (key: FeatureFlagKey, newValue: boolean) => {
    setSaving(key);
    setError(null);
    try {
      // No enviamos store_id porque el API usa session.store_id para OWNER
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: newValue }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al actualizar flag');
      }

      // Actualizar localmente
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: newValue } : f)));
      setConfirmDialog(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleConfirmToggle = async () => {
    if (!confirmDialog) return;
    await updateFlag(confirmDialog.flag, confirmDialog.newValue);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Configuración de Funcionalidades</h1>
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Cargando configuración...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Configuración de Funcionalidades</h1>
          <p className="text-gray-600">
            Activa o desactiva funcionalidades para tu tienda. Los cambios son inmediatos.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Funcionalidad
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {flags.map((flag) => {
                const info = FLAG_LABELS[flag.key];
                const isSaving = saving === flag.key;

                return (
                  <tr key={flag.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        {info.critical && (
                          <div className="mt-1">
                            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" title="Funcionalidad crítica"></span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{info.name}</div>
                          <div className="text-sm text-gray-500 mt-1">{info.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {flag.enabled ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          ○ Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggle(flag.key, !flag.enabled)}
                        disabled={isSaving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          flag.enabled ? 'bg-blue-600' : 'bg-gray-200'
                        } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            flag.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ Información Importante</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Las funcionalidades críticas (con punto naranja) requieren confirmación antes de desactivarse</li>
            <li>• Los cambios son inmediatos y afectan todas las operaciones en curso</li>
            <li>• Al desactivar una funcionalidad, las operaciones relacionadas serán rechazadas</li>
            <li>• Todas las activaciones/desactivaciones quedan registradas en el log de auditoría</li>
          </ul>
        </div>
      </div>

      {/* Modal de Confirmación */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmar Desactivación</h3>
                  <p className="text-sm text-gray-600">Esta es una funcionalidad crítica</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                ¿Estás seguro que deseas desactivar <strong>{FLAG_LABELS[confirmDialog.flag].name}</strong>?
                <br />
                <br />
                <span className="text-sm text-gray-600">
                  {FLAG_LABELS[confirmDialog.flag].description}
                </span>
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmToggle}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                >
                  Desactivar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
