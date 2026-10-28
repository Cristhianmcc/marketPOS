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
    <div className="bg-monterrial-gold/15 border-b border-monterrial-gold/40 print:hidden">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <AlertCircle className="w-5 h-5 text-[#8a6d2c] dark:text-monterrial-gold flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-main dark:text-text-light">
                Configuración inicial pendiente
              </p>
              <p className="text-xs text-text-secondary dark:text-gray-400 mt-0.5">
                Completa la configuración de tu tienda para empezar a vender (menos de 30 minutos)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleContinue}
              className="px-4 py-2 bg-monterrial-forest text-monterrial-cream rounded-xl hover:bg-monterrial-forest-light font-medium text-sm flex items-center gap-2 whitespace-nowrap"
            >
              Continuar configuración
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleDismiss}
              className="p-2 text-text-secondary hover:text-text-main hover:bg-monterrial-gold/20 rounded-lg"
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
