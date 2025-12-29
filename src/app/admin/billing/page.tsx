'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLANS_INFO } from '@/lib/planCapabilities';
import { ArrowLeft, CreditCard, TrendingUp, Calendar, Ban, CheckCircle, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Store {
  id: string;
  name: string;
  status: string;
  subscription: {
    id: string;
    planCode: string;
    status: string;
    effectiveStatus: string;
    currentPeriodEnd: string;
    daysUntilExpiration: number;
    priceAmount: number;
  } | null;
}

type ModalType = 'payment' | 'plan' | 'extend' | 'confirm' | null;
type ToastType = 'success' | 'error' | null;

interface ConfirmModal {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText: string;
  type: 'danger' | 'success';
}

export default function AdminBillingPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  
  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  
  // Form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('YAPE');
  const [paymentReference, setPaymentReference] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('STARTER');
  const [extendDays, setExtendDays] = useState('30');
  const [demoValue, setDemoValue] = useState('1'); // Valor numérico
  const [demoUnit, setDemoUnit] = useState<'hours' | 'days'>('days'); // Unidad

  // Calcular días totales basado en unidad
  const getDemoDays = () => {
    const value = parseFloat(demoValue) || 1;
    return demoUnit === 'hours' ? (value / 24).toFixed(4) : value.toFixed(4);
  };

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const showConfirmModal = (config: ConfirmModal) => {
    setModalType('confirm');
    setConfirmModal(config);
  };

  const executeConfirmAction = async () => {
    if (confirmModal?.onConfirm) {
      await confirmModal.onConfirm();
    }
  };

  const loadStores = async () => {
    try {
      const res = await fetch('/api/admin/billing/stores');
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      TRIAL: 'bg-blue-100 text-blue-800',
      ACTIVE: 'bg-green-100 text-green-800',
      PAST_DUE: 'bg-yellow-100 text-yellow-800',
      SUSPENDED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const handleRegisterPayment = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    setSelectedStore(store || null);
    setModalType('payment');
  };

  const submitPayment = async () => {
    if (!selectedStore || !paymentAmount) return;

    try {
      const res = await fetch(`/api/admin/billing/stores/${selectedStore.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          method: paymentMethod,
          reference: paymentReference || undefined,
        }),
      });

      if (res.ok) {
        showToast('✅ Pago registrado y suscripción reactivada', 'success');
        closeModal();
        loadStores();
      } else {
        const error = await res.json();
        showToast(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showToast('Error al registrar pago', 'error');
    }
  };

  const handleExtendSubscription = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    setSelectedStore(store || null);
    setModalType('extend');
  };

  const submitExtend = async () => {
    if (!selectedStore || !extendDays) return;

    try {
      const res = await fetch(`/api/admin/billing/stores/${selectedStore.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extendDays: parseInt(extendDays),
        }),
      });

      if (res.ok) {
        showToast('✅ Suscripción extendida', 'success');
        closeModal();
        loadStores();
      } else {
        const error = await res.json();
        showToast(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showToast('Error al extender suscripción', 'error');
    }
  };

  const handleChangePlan = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    setSelectedStore(store || null);
    setSelectedPlan(store?.subscription?.planCode || 'STARTER');
    setModalType('plan');
  };

  const submitChangePlan = async () => {
    if (!selectedStore || !selectedPlan) return;

    // Si es DEMO, usar getDemoDays(); si no, usar 30 días por defecto (mensual)
    const daysToAssign = selectedPlan === 'DEMO' ? getDemoDays() : 30;

    try {
      const res = await fetch(`/api/admin/billing/stores/${selectedStore.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: selectedPlan,
          extendDays: daysToAssign,
        }),
      });

      if (res.ok) {
        const durationText = selectedPlan === 'DEMO' ? ` por ${demoValue} ${demoUnit === 'hours' ? (demoValue === '1' ? 'hora' : 'horas') : (demoValue === '1' ? 'día' : 'días')}` : '';
        showToast(`✅ Plan ${selectedPlan} asignado${durationText}`, 'success');
        closeModal();
        loadStores();
      } else {
        const error = await res.json();
        showToast(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showToast('Error al cambiar plan', 'error');
    }
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedStore(null);
    setConfirmModal(null);
    setPaymentAmount('');
    setPaymentMethod('YAPE');
    setPaymentReference('');
    setExtendDays('30');
    setDemoValue('1');
    setDemoUnit('days');
  };

  const handleSuspend = async (storeId: string) => {
    console.log('🔴 handleSuspend llamado para:', storeId);
    showConfirmModal({
      title: '⚠️ Confirmar Suspensión',
      message: '¿Estás seguro de suspender esta suscripción? La tienda no podrá operar hasta que se reactive.',
      confirmText: 'Suspender',
      type: 'danger',
      onConfirm: async () => {
        console.log('🔴 Ejecutando suspensión para:', storeId);
        try {
          const res = await fetch(`/api/admin/billing/stores/${storeId}/subscription`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              setStatus: 'SUSPENDED',
            }),
          });

          console.log('🔴 Respuesta suspensión:', res.status);
          if (res.ok) {
            showToast('🚫 Suscripción suspendida', 'success');
            loadStores();
          } else {
            showToast('Error al suspender', 'error');
          }
        } catch (error) {
          console.error('🔴 Error suspender:', error);
          showToast('Error al suspender', 'error');
        }
        closeModal();
      },
    });
  };

  const handleReactivate = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    const planName = store?.subscription?.planCode || 'plan actual';
    
    showConfirmModal({
      title: '✅ Confirmar Reactivación',
      message: `¿Reactivar la suscripción ${planName} por 30 días más?`,
      confirmText: 'Reactivar',
      type: 'success',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/billing/stores/${storeId}/subscription`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              setStatus: 'ACTIVE',
              extendDays: 30, // Siempre 30 días para planes mensuales
            }),
          });

          if (res.ok) {
            showToast('✅ Suscripción reactivada por 30 días', 'success');
            loadStores();
          } else {
            showToast('Error al reactivar', 'error');
          }
        } catch (error) {
          console.error('Error al reactivar:', error);
          showToast('Error al reactivar', 'error');
        }
        closeModal();
      },
    });
  };

  if (loading) {
    return <div className="p-8">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-4 font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver al Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Licencias y Billing</h1>
          <p className="text-gray-600 mt-2">Panel de administración de suscripciones SaaS</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tiendas</p>
                <p className="text-2xl font-bold text-gray-900">{stores.length}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Activas</p>
                <p className="text-2xl font-bold text-green-600">
                  {stores.filter(s => s.subscription?.effectiveStatus === 'ACTIVE').length}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Trial</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stores.filter(s => s.subscription?.effectiveStatus === 'TRIAL').length}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Suspendidas</p>
                <p className="text-2xl font-bold text-red-600">
                  {stores.filter(s => s.subscription?.effectiveStatus === 'SUSPENDED').length}
                </p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Días</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stores.map((store) => (
                <tr key={store.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{store.name}</div>
                    <div className="text-sm text-gray-500">{store.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {store.subscription ? (
                      <div className="text-sm">
                        <div className="font-medium">{PLANS_INFO[store.subscription.planCode as keyof typeof PLANS_INFO]?.name || store.subscription.planCode}</div>
                        <div className="text-gray-500">PEN {store.subscription.priceAmount}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Sin suscripción</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {store.subscription ? (
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(store.subscription.effectiveStatus)}`}>
                        {store.subscription.effectiveStatus}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {store.subscription ? new Date(store.subscription.currentPeriodEnd).toLocaleDateString('es-PE') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {store.subscription ? (
                      <span className={store.subscription.daysUntilExpiration < 0 ? 'text-red-600 font-medium' : 'text-gray-900'}>
                        {store.subscription.daysUntilExpiration} días
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRegisterPayment(store.id)}
                        className="text-green-600 hover:text-green-700 font-medium"
                      >
                        Pago
                      </button>
                      <button
                        onClick={() => handleChangePlan(store.id)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Plan
                      </button>
                      <button
                        onClick={() => handleExtendSubscription(store.id)}
                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Extender
                      </button>
                      {store.subscription?.effectiveStatus === 'SUSPENDED' ? (
                        <button
                          onClick={() => handleReactivate(store.id)}
                          className="text-green-600 hover:text-green-700 font-medium"
                        >
                          Reactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspend(store.id)}
                          className="text-red-600 hover:text-red-700 font-medium"
                        >
                          Suspender
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal de Registro de Pago */}
        {modalType === 'payment' && selectedStore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Registrar Pago</h3>
                  <p className="text-sm text-gray-600">{selectedStore.name}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monto (PEN)
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="49.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="YAPE">Yape</option>
                    <option value="PLIN">Plin</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="CASH">Efectivo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referencia / Nº Operación (opcional)
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="000123456789"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitPayment}
                  disabled={!paymentAmount}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Registrar Pago
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Cambio de Plan */}
        {modalType === 'plan' && selectedStore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Cambiar Plan</h3>
                  <p className="text-sm text-gray-600">{selectedStore.name}</p>
                </div>
              </div>

              {/* Selección de Plan */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Selecciona el plan:
                </label>
                
                {/* DEMO Plan - Destacado */}
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('DEMO')}
                    className={`w-full p-4 rounded-xl border-3 transition-all ${
                      selectedPlan === 'DEMO'
                        ? 'border-purple-600 bg-gradient-to-r from-purple-50 to-purple-100 shadow-lg'
                        : 'border-purple-300 bg-purple-50/30 hover:border-purple-400 hover:bg-purple-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">🎉</div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-lg font-bold text-purple-900">Plan DEMO / Trial</p>
                            <p className="text-xs text-purple-700">Acceso completo temporal para evaluar el sistema</p>
                          </div>
                          <div className="text-right bg-white px-4 py-2 rounded-lg border-2 border-purple-300">
                            <p className="text-2xl font-black text-purple-600">GRATIS</p>
                            <p className="text-xs text-purple-600 font-bold">Duración flexible</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Paid Plans - Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(PLANS_INFO).filter(([code]) => code !== 'DEMO').map(([code, plan]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setSelectedPlan(code)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        selectedPlan === code
                          ? 'border-blue-600 bg-blue-50 shadow-md scale-105'
                          : 'border-gray-300 bg-white hover:border-blue-400 hover:shadow'
                      }`}
                    >
                      <div className="text-center mb-2">
                        <p className="font-bold text-gray-900 text-sm mb-1">{plan.name}</p>
                        <div className="bg-blue-100 py-2 px-3 rounded-lg">
                          <p className="text-2xl font-black text-blue-600">
                            PEN {plan.monthlyPrice}
                          </p>
                          <p className="text-xs text-blue-700 font-medium">/mes · 30 días</p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 text-xs text-gray-700 text-left mt-3">
                        {plan.features.slice(0, 4).map((feature: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-green-600 font-bold mt-0.5">✓</span>
                            <span className="leading-tight">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>

              {/* Si seleccionó DEMO, mostrar configuración de duración */}
              {selectedPlan === 'DEMO' && (
                <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg">
                  <label className="block text-sm font-bold text-purple-900 mb-3">
                    ⏱️ Duración del acceso DEMO (con todas las funciones)
                  </label>
                  
                  {/* Botones de acción rápida */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setDemoValue('1'); setDemoUnit('hours'); }}
                      className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                        demoValue === '1' && demoUnit === 'hours'
                          ? 'bg-purple-600 text-white shadow-lg scale-105'
                          : 'bg-white text-purple-700 border-2 border-purple-300 hover:bg-purple-100 hover:scale-102'
                      }`}
                    >
                      ⚡ 1 hora
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDemoValue('3'); setDemoUnit('hours'); }}
                      className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                        demoValue === '3' && demoUnit === 'hours'
                          ? 'bg-purple-600 text-white shadow-lg scale-105'
                          : 'bg-white text-purple-700 border-2 border-purple-300 hover:bg-purple-100 hover:scale-102'
                      }`}
                    >
                      ⚡ 3 horas
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDemoValue('1'); setDemoUnit('days'); }}
                      className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                        demoValue === '1' && demoUnit === 'days'
                          ? 'bg-purple-600 text-white shadow-lg scale-105'
                          : 'bg-white text-purple-700 border-2 border-purple-300 hover:bg-purple-100 hover:scale-102'
                      }`}
                    >
                      📅 1 día
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDemoValue('7'); setDemoUnit('days'); }}
                      className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                        demoValue === '7' && demoUnit === 'days'
                          ? 'bg-purple-600 text-white shadow-lg scale-105'
                          : 'bg-white text-purple-700 border-2 border-purple-300 hover:bg-purple-100 hover:scale-102'
                      }`}
                    >
                      📅 7 días
                    </button>
                  </div>

                  {/* Input personalizado con selector de unidad */}
                  <div className="bg-white p-3 rounded-lg border-2 border-purple-200">
                    <label className="block text-xs font-medium text-purple-900 mb-2">
                      O ingresa una duración personalizada:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={demoValue}
                        onChange={(e) => setDemoValue(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center font-bold text-purple-900"
                        placeholder="Cantidad"
                        min="1"
                        step="1"
                      />
                      <select
                        value={demoUnit}
                        onChange={(e) => setDemoUnit(e.target.value as 'hours' | 'days')}
                        className="px-4 py-2 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-bold text-purple-900 bg-white"
                      >
                        <option value="hours">Horas</option>
                        <option value="days">Días</option>
                      </select>
                    </div>
                    <p className="text-xs text-purple-600 mt-2">
                      💡 Ejemplo: "2 Horas" para demos rápidos, "14 Días" para evaluación completa
                    </p>
                  </div>
                  
                  {/* Mensaje de confirmación */}
                  <div className="mt-3 p-3 bg-purple-100 border border-purple-300 rounded-lg">
                    <p className="text-sm text-purple-900 font-medium">
                      ✨ El cliente tendrá <strong className="text-purple-700">acceso completo</strong> por:
                    </p>
                    <p className="text-lg font-bold text-purple-700 mt-1">
                      {demoValue} {demoUnit === 'hours' ? (demoValue === '1' ? 'hora' : 'horas') : (demoValue === '1' ? 'día' : 'días')}
                    </p>
                  </div>
                </div>
              )}

              {/* Info de ayuda */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-xs text-blue-800">
                  <strong>💡 Guía:</strong> 
                  {selectedPlan === 'DEMO' ? (
                    <span> DEMO da acceso completo temporal. Usa 1-3h para demos rápidos, 7 días para evaluación seria.</span>
                  ) : (
                    <span> Los planes pagados se asignan por 30 días mensuales. El cliente deberá pagar para renovar.</span>
                  )}
                </p>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitChangePlan}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Actualizar Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Extender Suscripción */}
        {modalType === 'extend' && selectedStore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Extender Suscripción</h3>
                  <p className="text-sm text-gray-600">{selectedStore.name}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Días a extender
                </label>
                <input
                  type="number"
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="30"
                  min="0.001"
                  step="0.001"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Se extenderá {extendDays} días desde la fecha de vencimiento actual
                </p>
              </div>

              {/* Quick Actions para Demos y Extensiones */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎯 Accesos rápidos
                </label>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 mb-2">Para demos y pruebas cortas:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExtendDays((1/24).toFixed(3))}
                      className="flex-1 px-3 py-2 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 border border-purple-200 font-medium"
                    >
                      1 hora
                    </button>
                    <button
                      onClick={() => setExtendDays((3/24).toFixed(3))}
                      className="flex-1 px-3 py-2 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 border border-purple-200 font-medium"
                    >
                      3 horas
                    </button>
                    <button
                      onClick={() => setExtendDays('1')}
                      className="flex-1 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 font-medium"
                    >
                      1 día
                    </button>
                    <button
                      onClick={() => setExtendDays('7')}
                      className="flex-1 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 font-medium"
                    >
                      7 días
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mb-2 mt-3">Para extensiones de planes:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExtendDays('30')}
                      className="flex-1 px-3 py-2 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 font-medium"
                    >
                      30 días
                    </button>
                    <button
                      onClick={() => setExtendDays('90')}
                      className="flex-1 px-3 py-2 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 font-medium"
                    >
                      90 días
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitExtend}
                  disabled={!extendDays}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Extender
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 animate-slide-in">
            <div
              className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg ${
                toast.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <p
                className={`font-medium ${
                  toast.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {toast.message}
              </p>
              <button
                onClick={() => setToast(null)}
                className={`ml-2 ${
                  toast.type === 'success' ? 'text-green-600 hover:text-green-700' : 'text-red-600 hover:text-red-700'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {modalType === 'confirm' && confirmModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`p-3 rounded-lg ${
                    confirmModal.type === 'danger' ? 'bg-red-100' : 'bg-green-100'
                  }`}
                >
                  {confirmModal.type === 'danger' ? (
                    <Ban className="w-6 h-6 text-red-600" />
                  ) : (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900">{confirmModal.title}</h3>
              </div>

              <p className="text-gray-700 mb-6">{confirmModal.message}</p>

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeConfirmAction}
                  className={`flex-1 px-4 py-2 text-white rounded-lg font-medium ${
                    confirmModal.type === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
