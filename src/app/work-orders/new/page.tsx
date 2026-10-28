'use client';

import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { ArrowLeft } from 'lucide-react';
import { Toaster } from 'sonner';
import { ReceptionForm } from '../ReceptionForm';
import { useWorkOrderContext } from '../shared';

export default function NewWorkOrderPage() {
  const router = useRouter();
  const ctx = useWorkOrderContext();

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50 dark:bg-background-dark">
        <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => router.push('/work-orders')} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Volver">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ctx.isLaundry ? 'Recibir ropa' : 'Nueva orden de trabajo'}</h1>
              <p className="text-gray-500 text-sm">{ctx.isLaundry ? 'Anota lo que deja el cliente, la fecha de recojo y el adelanto' : 'Registra el trabajo, la fecha de entrega y el adelanto'}</p>
            </div>
          </div>
          <ReceptionForm mode="page" />
        </div>
      </div>
    </AuthLayout>
  );
}
