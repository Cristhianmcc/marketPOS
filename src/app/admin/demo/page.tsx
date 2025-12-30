'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Zap, RotateCcw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { toast } from 'sonner';

export default function DemoModePage() {
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [checking, setChecking] = useState(true);

  // ✅ Verificar estado actual al cargar
  useEffect(() => {
    checkDemoStatus();
  }, []);

  const checkDemoStatus = async () => {
    try {
      const response = await fetch('/api/store');
      if (response.ok) {
        const data = await response.json();
        setIsDemoActive(data.store?.isDemoStore || false);
      }
    } catch (error) {
      console.error('[Demo Check] Error:', error);
    } finally {
      setChecking(false);
    }
  };

  // ✅ Activar Demo Mode
  const handleEnableDemo = async () => {
    if (!showEnableConfirm) {
      setShowEnableConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/demo/enable', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al activar Demo Mode');
      }

      toast.success(data.message);
      setIsDemoActive(true);
      setShowEnableConfirm(false);
      // Recargar para actualizar estado en toda la app
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('[Demo Enable] Error:', error);
      toast.error(error.message || 'Error al activar Demo Mode');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Resetear Demo Mode
  const handleResetDemo = async () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    setResetting(true);
    try {
      const response = await fetch('/api/admin/demo/reset', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al resetear Demo Mode');
      }

      toast.success(data.message);
      setIsDemoActive(false);
      setShowResetConfirm(false);
      // Recargar para actualizar estado en toda la app
      setTimeout(() => window.location.reload(), 1500);
      
      // Mostrar resumen de lo eliminado
      if (data.deletedData) {
        const summary = Object.entries(data.deletedData)
          .filter(([_, count]) => (count as number) > 0)
          .map(([key, count]) => `${key}: ${count}`)
          .join(', ');
        
        toast.info(`Eliminado: ${summary}`, { duration: 5000 });
      }
    } catch (error: any) {
      console.error('[Demo Reset] Error:', error);
      toast.error(error.message || 'Error al resetear Demo Mode');
    } finally {
      setResetting(false);
    }
  };

  return (
    <AuthLayout storeName="Demo Mode">
      {checking ? (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verificando estado de Demo Mode...</p>
          </div>
        </div>
      ) : (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="bg-white border-2 border-orange-500 rounded-lg shadow-lg p-8 mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-orange-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Demo Mode</h1>
                  <p className="text-gray-600 mt-1">
                    Modo demostración para ventas comerciales
                  </p>
                </div>
              </div>

              {/* Badge de estado */}
              {isDemoActive && (
                <div className="mt-4 bg-yellow-100 border-2 border-yellow-500 text-yellow-900 px-4 py-3 rounded-lg font-bold text-center flex items-center justify-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  DEMO MODE ACTIVO
                </div>
              )}
            </div>

            {/* Advertencia de seguridad */}
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-8">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-lg font-bold text-red-900 mb-2">
                    ADVERTENCIA DE SEGURIDAD
                  </h2>
                  <ul className="space-y-2 text-sm text-red-800">
                    <li className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Solo SUPERADMIN puede activar/resetear Demo Mode</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Demo Mode NO debe usarse en tiendas reales</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Resetear eliminará TODOS los datos de demo (ventas, clientes, turnos, etc.)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Los productos se resetearán a stock inicial</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Información de Demo Mode */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-blue-600" />
                ¿Qué incluye Demo Mode?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Productos</h3>
                  <p className="text-sm text-blue-800">
                    15 productos variados con precios reales, stock y quick-sell configurado
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Ventas</h3>
                  <p className="text-sm text-green-800">
                    3 ventas de ejemplo (CASH, YAPE, FIADO) con diferentes escenarios
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-2">Promociones</h3>
                  <p className="text-sm text-purple-800">
                    Promo por categoría, promo por volumen y cupón activo
                  </p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h3 className="font-semibold text-orange-900 mb-2">Cliente Fiado</h3>
                  <p className="text-sm text-orange-800">
                    1 cliente demo con cuenta pendiente de S/ 15.00
                  </p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <h3 className="font-semibold text-teal-900 mb-2">Turnos</h3>
                  <p className="text-sm text-teal-800">
                    1 turno cerrado (ayer) y 1 turno abierto (actual)
                  </p>
                </div>
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <h3 className="font-semibold text-pink-900 mb-2">Reportes</h3>
                  <p className="text-sm text-pink-800">
                    Datos visibles en todos los reportes para demostración
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Activar Demo */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <Zap className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Activar Demo Mode</h3>
                    <p className="text-sm text-gray-600">Cargar datos ficticios</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-4">
                  Crea productos, ventas, clientes, promociones y cupones de ejemplo.
                  Ideal para demostraciones comerciales.
                </p>
                
                {!showEnableConfirm ? (
                  <button
                    onClick={() => setShowEnableConfirm(true)}
                    disabled={loading || isDemoActive}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isDemoActive ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Ya Activo
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Activar Demo
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-2">
                      <p className="text-sm font-bold text-green-900 text-center">
                        ¿Activar Demo Mode?
                      </p>
                      <p className="text-xs text-green-700 text-center mt-1">
                        Se cargarán datos ficticios para demostración
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowEnableConfirm(false)}
                        className="py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancelar
                      </button>
                      <button
                        onClick={handleEnableDemo}
                        disabled={loading}
                        className="py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Activando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Confirmar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Resetear Demo */}
              <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-red-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <RotateCcw className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Resetear Demo</h3>
                    <p className="text-sm text-gray-600">Eliminar todos los datos</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-4">
                  Elimina TODOS los datos de demo: ventas, clientes, turnos, promos.
                  Los productos vuelven a stock inicial.
                </p>

                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={!isDemoActive}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Resetear Demo
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-2">
                      <p className="text-sm font-bold text-red-900 text-center">
                        ¿Confirmas eliminar TODOS los datos?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancelar
                      </button>
                      <button
                        onClick={handleResetDemo}
                        disabled={resetting}
                        className="py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {resetting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Reseteando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Confirmar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Guía de uso */}
            <div className="mt-8 bg-blue-50 border-2 border-blue-300 rounded-lg p-6">
              <h2 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-6 h-6" />
                Guía de Uso - Demo Mode
              </h2>
              <ol className="space-y-3 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">1.</span>
                  <span>
                    <strong>Activar Demo Mode:</strong> Click en "Activar Demo" para cargar datos ficticios
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">2.</span>
                  <span>
                    <strong>Demostrar el sistema:</strong> Ve al POS y realiza ventas con los productos demo
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">3.</span>
                  <span>
                    <strong>Probar funciones:</strong> Aplica promociones, cupones, fiado, etc.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">4.</span>
                  <span>
                    <strong>Ver reportes:</strong> Muestra reportes con datos demo
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">5.</span>
                  <span>
                    <strong>Resetear:</strong> Cuando termines, resetea para limpiar todo
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">6.</span>
                  <span>
                    <strong>Repetir:</strong> Puedes activar demo nuevamente para otra demostración
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      )}
    </AuthLayout>
  );
}
