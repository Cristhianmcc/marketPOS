// src/app/onboarding/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from '@/components/onboarding/Stepper';
import {
  Step1Content,
  Step2Content,
  Step3Content,
  Step4Content,
  Step5Content,
  Step6Content,
} from '@/components/onboarding/StepComponents';
import { Loader2, AlertCircle } from 'lucide-react';

const STEPS = [
  { number: 1, title: 'Datos de tienda', description: 'Información básica' },
  { number: 2, title: 'Configuración', description: 'Caja y pagos' },
  { number: 3, title: 'Productos', description: 'Importar catálogo' },
  { number: 4, title: 'Usuarios', description: 'Crear cajero' },
  { number: 5, title: 'Ticket', description: 'Preview impresión' },
  { number: 6, title: 'Listo', description: '¡A vender!' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Datos de tienda
  const [storeName, setStoreName] = useState('');
  const [storeRuc, setStoreRuc] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [ticketHeader1, setTicketHeader1] = useState('');
  const [ticketHeader2, setTicketHeader2] = useState('');

  // Step 2: Configuración
  const [useShifts, setUseShifts] = useState(true);
  const [initialCash, setInitialCash] = useState('100.00');
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState('CASH');

  // Step 3: Productos
  const [importMethod, setImportMethod] = useState<'csv' | 'manual' | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Step 4: Usuarios
  const [cashierName, setCashierName] = useState('');
  const [cashierEmail, setCashierEmail] = useState('');
  const [cashierPassword, setCashierPassword] = useState('');

  useEffect(() => {
    loadOnboardingState();
  }, []);

  const loadOnboardingState = async () => {
    try {
      const res = await fetch('/api/settings/onboarding');
      const data = await res.json();
      
      if (data.completedAt) {
        // Ya completó onboarding, redirigir
        router.push('/pos');
      } else if (data.step > 0) {
        // Continuar desde donde se quedó
        setCurrentStep(data.step);
      }
    } catch (error) {
      console.error('Error loading onboarding state:', error);
    }
  };

  const updateStep = async (step: number) => {
    try {
      await fetch('/api/settings/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
    } catch (error) {
      console.error('Error updating step:', error);
    }
  };

  const handleNextStep = async () => {
    setError('');
    setLoading(true);

    try {
      // Validar y guardar según el paso
      if (currentStep === 1) {
        if (!storeName || storeName.length < 3) {
          setError('El nombre de la tienda debe tener al menos 3 caracteres');
          setLoading(false);
          return;
        }

        // Guardar información de tienda
        const res = await fetch('/api/onboarding/store-info', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: storeName,
            ruc: storeRuc,
            address: storeAddress,
            phone: storePhone,
            ticketHeaderLine1: ticketHeader1,
            ticketHeaderLine2: ticketHeader2,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al guardar información');
        }
      }

      if (currentStep === 2) {
        // Guardar configuración
        await fetch('/api/settings/onboarding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultPaymentMethod,
          }),
        });
      }

      if (currentStep === 3 && importMethod === 'csv' && csvPreview && !importing) {
        // Confirmar import de productos
        await handleConfirmImport();
      }

      if (currentStep === 4 && cashierName && cashierEmail && cashierPassword) {
        // Crear cajero
        const res = await fetch('/api/onboarding/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cashierName,
            email: cashierEmail,
            password: cashierPassword,
            role: 'CASHIER',
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al crear cajero');
        }
      }

      // Avanzar al siguiente paso
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      await updateStep(nextStep);
    } catch (err: any) {
      setError(err.message || 'Error al procesar el paso');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    try {
      await fetch('/api/settings/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
      router.push('/pos');
    } catch (error) {
      console.error('Error dismissing onboarding:', error);
    }
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      await fetch('/api/settings/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      router.push('/pos');
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/onboarding/import-csv', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al procesar CSV');
      }

      const data = await res.json();
      setCsvPreview(data);
    } catch (err: any) {
      setError(err.message || 'Error al procesar archivo');
      setCsvFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!csvPreview) return;

    setImporting(true);
    setError('');

    try {
      const validProducts = csvPreview.preview.filter((p: any) => p.errors.length === 0);

      const res = await fetch('/api/onboarding/import-csv/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: validProducts }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al importar productos');
      }

      const data = await res.json();
      alert(`✅ ${data.message}`);
    } catch (err: any) {
      setError(err.message || 'Error al importar productos');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Configuración Inicial</h1>
          <p className="text-gray-600 mt-1">Completa estos pasos para empezar a vender en menos de 30 minutos</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b">
        <Stepper steps={STEPS} currentStep={currentStep} />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <Step1Content
              storeName={storeName}
              setStoreName={setStoreName}
              storeRuc={storeRuc}
              setStoreRuc={setStoreRuc}
              storeAddress={storeAddress}
              setStoreAddress={setStoreAddress}
              storePhone={storePhone}
              setStorePhone={setStorePhone}
              ticketHeader1={ticketHeader1}
              setTicketHeader1={setTicketHeader1}
              ticketHeader2={ticketHeader2}
              setTicketHeader2={setTicketHeader2}
            />
          )}

          {currentStep === 2 && (
            <Step2Content
              useShifts={useShifts}
              setUseShifts={setUseShifts}
              initialCash={initialCash}
              setInitialCash={setInitialCash}
              defaultPaymentMethod={defaultPaymentMethod}
              setDefaultPaymentMethod={setDefaultPaymentMethod}
            />
          )}

          {currentStep === 3 && (
            <Step3Content
              importMethod={importMethod}
              setImportMethod={setImportMethod}
              csvFile={csvFile}
              handleFileSelect={handleFileSelect}
              csvPreview={csvPreview}
              loading={loading}
              importing={importing}
            />
          )}

          {currentStep === 4 && (
            <Step4Content
              cashierName={cashierName}
              setCashierName={setCashierName}
              cashierEmail={cashierEmail}
              setCashierEmail={setCashierEmail}
              cashierPassword={cashierPassword}
              setCashierPassword={setCashierPassword}
            />
          )}

          {currentStep === 5 && (
            <Step5Content
              storeName={storeName}
              ticketHeader1={ticketHeader1}
              ticketHeader2={ticketHeader2}
            />
          )}

          {currentStep === 6 && (
            <Step6Content onComplete={handleComplete} loading={loading} />
          )}

          {/* Navigation Buttons */}
          {currentStep < 6 && (
            <div className="flex justify-between items-center mt-8 pt-6 border-t">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Lo haré luego
              </button>

              <div className="flex gap-3">
                {currentStep > 1 && (
                  <button
                    onClick={handlePreviousStep}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                    disabled={loading}
                  >
                    Anterior
                  </button>
                )}
                
                <button
                  onClick={handleNextStep}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                  disabled={loading}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {currentStep === 3 && csvPreview ? 'Importar y Continuar' : 'Siguiente'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
