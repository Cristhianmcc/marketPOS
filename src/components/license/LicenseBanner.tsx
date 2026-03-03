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

  // Licencia vencida — bloqueante
  if (!license.canOperate) {
    return (
      <div className="w-full bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-semibold">Licencia vencida.</span>
            {' '}Contacta a soporte para renovar y continuar operando.
          </div>
        </div>
        <button
          onClick={check}
          disabled={checking}
          className="flex items-center gap-2 bg-red-700 hover:bg-red-800 px-3 py-1.5 rounded text-sm font-medium transition-colors flex-shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          Verificar
        </button>
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
