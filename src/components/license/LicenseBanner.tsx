'use client';

/**
 * LicenseBanner
 *
 * Muestra un banner cuando la licencia está por vencer o ha vencido.
 * Se muestra en la parte superior de la app (en el layout principal).
 * Solo visible en el desktop (usa window.electronAPI).
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

interface LicenseState {
  canOperate: boolean;
  status: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  planCode: string | null;
  daysRemaining: number;
  source: string;
}

const WARNING_DAYS = 7; // mostrar banner si quedan X días o menos

export function LicenseBanner() {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    // Solo en desktop (Electron)
    const api = (window as any).desktop;
    if (!api?.license?.check) return;

    setChecking(true);
    try {
      const state = await api.license.check() as LicenseState;
      setLicense(state);
    } catch {
      // silencioso
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    // Re-verificar cada 6 horas
    const interval = setInterval(check, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!license) return null;

  // NO mostrar si puede operar y tiene más de WARNING_DAYS días
  if (license.canOperate && license.daysRemaining > WARNING_DAYS) return null;

  // NO mostrar si no tiene suscripción configurada (instalación en progreso)
  if (license.status === 'NO_SUBSCRIPTION' && license.source === 'no_config') return null;

  const expiryDate = license.trialEndsAt || license.currentPeriodEnd;
  const formattedDate = expiryDate
    ? new Date(expiryDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  // Licencia vencida — overlay bloqueante de pantalla completa
  if (!license.canOperate) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gray-950/95 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Licencia vencida</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Tu suscripción ha expirado o fue suspendida.<br />
              Contacta a soporte para renovar y continuar operando.
            </p>
          </div>
          {formattedDate && (
            <p className="text-xs text-gray-400">
              Venció el <span className="font-medium text-gray-600">{formattedDate}</span>
            </p>
          )}
          <button
            onClick={check}
            disabled={checking}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors w-full justify-center"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando...' : 'Verificar licencia'}
          </button>
          <p className="text-xs text-gray-400">
            soporte@monterrial.com
          </p>
        </div>
      </div>
    );
  }

  // Próximo a vencer — advertencia
  const isTrialing = license.status === 'TRIAL';
  const isOfflineGrace = license.status === 'OFFLINE_GRACE';

  const bgColor = license.daysRemaining <= 3
    ? 'bg-red-50 border-red-300 text-red-800'
    : 'bg-amber-50 border-amber-300 text-amber-800';

  const iconColor = license.daysRemaining <= 3 ? 'text-red-500' : 'text-amber-500';

  let message = '';
  if (isOfflineGrace) {
    message = `Sin conexión al servidor de licencias. Gracia offline activa.`;
  } else if (isTrialing) {
    message = `Período de prueba: vence el ${formattedDate} (${license.daysRemaining} día${license.daysRemaining !== 1 ? 's' : ''} restante${license.daysRemaining !== 1 ? 's' : ''}).`;
  } else {
    message = `Tu licencia vence el ${formattedDate} (${license.daysRemaining} día${license.daysRemaining !== 1 ? 's' : ''} restante${license.daysRemaining !== 1 ? 's' : ''}).`;
  }

  return (
    <div className={`w-full border-b px-4 py-2 flex items-center justify-between gap-4 ${bgColor}`}>
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        <span>{message}</span>
        {!isOfflineGrace && (
          <span className="font-medium">Contacta a soporte para renovar.</span>
        )}
      </div>
      <button
        onClick={check}
        disabled={checking}
        className="flex items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
        Actualizar
      </button>
    </div>
  );
}
