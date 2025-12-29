// src/components/onboarding/OnboardingBanner.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, X, ArrowRight } from 'lucide-react';

export default function OnboardingBanner() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const res = await fetch('/api/settings/onboarding');
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      
      // Mostrar banner si:
      // 1. No ha completado onboarding (completedAt === null)
      // 2. No lo ha desestimado recientemente (dismissedAt === null o hace más de 7 días)
      const shouldShow = !data.completedAt && !data.dismissedAt;
      setShow(shouldShow);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch('/api/settings/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
      setShow(false);
    } catch (error) {
      console.error('Error dismissing banner:', error);
    }
  };

  const handleContinue = () => {
    router.push('/onboarding');
  };

  if (loading || !show) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 print:hidden">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">
                Configuración inicial pendiente
              </p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Completa la configuración de tu tienda para empezar a vender (menos de 30 minutos)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleContinue}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium text-sm flex items-center gap-2 whitespace-nowrap"
            >
              Continuar configuración
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleDismiss}
              className="p-2 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 rounded-lg"
              title="Recordarme después"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
