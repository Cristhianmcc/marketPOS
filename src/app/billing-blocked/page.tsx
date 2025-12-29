'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function BillingBlockedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason') || 'UNKNOWN';

  const getMessage = () => {
    switch (reason) {
      case 'SUBSCRIPTION_SUSPENDED':
        return {
          title: 'Licencia Suspendida',
          message: 'Tu licencia ha sido suspendida por falta de pago. No puedes acceder al sistema hasta que renueves tu suscripción.',
          color: 'red',
        };
      case 'SUBSCRIPTION_CANCELLED':
        return {
          title: 'Licencia Cancelada',
          message: 'Tu licencia ha sido cancelada. Contacta a soporte para obtener una nueva licencia.',
          color: 'gray',
        };
      case 'NO_SUBSCRIPTION':
        return {
          title: 'Sin Licencia',
          message: 'No tienes una licencia activa para usar MarketPOS. Contacta a soporte para activar tu cuenta.',
          color: 'yellow',
        };
      default:
        return {
          title: 'Acceso Bloqueado',
          message: 'No tienes una licencia válida para acceder a esta función.',
          color: 'red',
        };
    }
  };

  const { title, message, color } = getMessage();

  const handleExportBackup = async () => {
    try {
      const response = await fetch('/api/backups/export', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Error al exportar backup');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Error al exportar backup. Intenta desde Configuración > Backups.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {/* Icon */}
        <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-${color}-100 mb-6`}>
          <svg className={`h-10 w-10 text-${color}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{title}</h1>
          <p className="text-gray-600 mb-8">{message}</p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/settings/billing"
            className="block w-full bg-blue-600 text-white text-center px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Ver Estado de Licencia
          </Link>

          <button
            onClick={handleExportBackup}
            className="block w-full bg-gray-100 text-gray-700 text-center px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Exportar Backup de Datos
          </button>

          <button
            onClick={() => router.push('/login')}
            className="block w-full bg-white text-gray-700 text-center px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* Help */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500 mb-2">¿Necesitas ayuda?</p>
          <a
            href="mailto:soporte@marketpos.com"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            soporte@marketpos.com
          </a>
        </div>
      </div>
    </div>
  );
}
