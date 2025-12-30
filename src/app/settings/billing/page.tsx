'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PLANS_INFO } from '@/lib/planCapabilities';

interface BillingData {
  hasSubscription: boolean;
  subscription?: {
    planCode: string;
    status: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    priceAmount: number;
    priceCurrency: string;
    billingCycle: string;
  };
  effectiveStatus: string | null;
  canOperate: boolean;
  daysUntilExpiration?: number;
  graceDaysRemaining?: number | null;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/billing')
      .then((res) => res.json())
      .then((data) => {
        setBilling(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Licencia y Facturación</h1>
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!billing || !billing.hasSubscription || !billing.subscription) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Licencia y Facturación</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800 font-medium">No tienes una suscripción activa.</p>
          <p className="text-yellow-700 mt-2">Contacta a soporte para activar tu licencia.</p>
        </div>
      </div>
    );
  }

  const { subscription, effectiveStatus, daysUntilExpiration, graceDaysRemaining } = billing;
  const planInfo = PLANS_INFO[subscription.planCode as keyof typeof PLANS_INFO];

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'TRIAL':
        return <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">Prueba</span>;
      case 'ACTIVE':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Activa</span>;
      case 'PAST_DUE':
        return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">Vencida (Gracia)</span>;
      case 'SUSPENDED':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">Suspendida</span>;
      case 'CANCELLED':
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">Cancelada</span>;
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">Desconocido</span>;
    }
  };

  const showWarning = effectiveStatus === 'PAST_DUE' || (daysUntilExpiration !== undefined && daysUntilExpiration <= 7);
  const showDanger = effectiveStatus === 'SUSPENDED' || effectiveStatus === 'CANCELLED';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Licencia y Facturación</h1>

      {/* Warning banner */}
      {showWarning && effectiveStatus !== 'SUSPENDED' && effectiveStatus !== 'CANCELLED' && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 font-medium">
                {effectiveStatus === 'PAST_DUE' 
                  ? `Tu licencia venció. Tienes ${graceDaysRemaining || 0} días de gracia restantes.`
                  : `Tu licencia vence en ${daysUntilExpiration} días.`}
              </p>
              <p className="mt-1 text-sm text-yellow-600">
                Renueva tu suscripción para evitar la interrupción del servicio.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Danger banner */}
      {showDanger && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">
                {effectiveStatus === 'SUSPENDED' 
                  ? 'Tu licencia ha sido suspendida por falta de pago.'
                  : 'Tu licencia ha sido cancelada.'}
              </p>
              <p className="mt-1 text-sm text-red-600">
                Contacta a soporte para reactivar tu cuenta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan info card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{planInfo?.name || subscription.planCode}</h2>
            <p className="text-sm text-gray-500 mt-1">{planInfo?.description}</p>
          </div>
          {getStatusBadge(effectiveStatus)}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <p className="text-sm text-gray-500">Precio</p>
            <p className="text-lg font-semibold text-gray-900">
              {subscription.priceCurrency} {subscription.priceAmount.toFixed(2)} / {subscription.billingCycle === 'MONTHLY' ? 'mes' : 'año'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">
              {effectiveStatus === 'TRIAL' ? 'Trial termina' : 'Próximo pago'}
            </p>
            <p className="text-lg font-semibold text-gray-900">
              {effectiveStatus === 'TRIAL' && subscription.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString('es-PE')
                : new Date(subscription.currentPeriodEnd).toLocaleDateString('es-PE')}
            </p>
          </div>
        </div>

        {planInfo && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Características incluidas:</p>
            <ul className="space-y-2">
              {planInfo.features.map((feature, index) => (
                <li key={index} className="flex items-start text-sm text-gray-600">
                  <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => window.open('mailto:soporte@marketpos.com?subject=Renovar%20Licencia', '_blank')}
          className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Contactar para Renovar
        </button>
        <Link
          href="/settings/backups"
          className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium text-center"
        >
          Exportar Backup
        </Link>
      </div>

      {/* Help text */}
      <p className="text-sm text-gray-500 text-center mt-6">
        ¿Necesitas ayuda? Escríbenos a{' '}
        <a href="mailto:soporte@marketpos.com" className="text-blue-600 hover:text-blue-700">
          soporte@marketpos.com
        </a>
      </p>
    </div>
  );
}
