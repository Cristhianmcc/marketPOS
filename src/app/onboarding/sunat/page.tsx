/**
 * MÓDULO 18.8 — Wizard de Onboarding SUNAT
 * 
 * Página de configuración guiada de facturación electrónica SUNAT.
 * Solo visible para OWNER de la tienda.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Building2,
  Key,
  Shield,
  TestTube,
  Settings,
  Power,
  Check,
  X,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Upload,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';

interface OnboardingStatus {
  enabledFlag: boolean;
  storeStatus: string;
  configured: boolean;
  env: 'BETA' | 'PROD';
  enabled: boolean;
  steps: {
    fiscalData: boolean;
    solCredentials: boolean;
    certificate: boolean;
    testSignedXml: boolean;
    testSunatBeta: boolean;
  };
  preferences: {
    autoEmitBoleta: boolean;
    allowFactura: boolean;
    defaultDocType: string;
  };
  fiscalData?: {
    ruc: string;
    razonSocial: string;
    address: string;
    ubigeo: string;
  };
  message?: string;
}

const STEPS = [
  { id: 'fiscal', title: 'Datos Fiscales', icon: Building2 },
  { id: 'credentials', title: 'Credenciales SOL', icon: Key },
  { id: 'certificate', title: 'Certificado Digital', icon: Shield },
  { id: 'test-sign', title: 'Test Firma', icon: TestTube },
  { id: 'preferences', title: 'Preferencias', icon: Settings },
  { id: 'activate', title: 'Activar', icon: Power },
];

export default function SunatOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form states
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [address, setAddress] = useState('');
  const [ubigeo, setUbigeo] = useState('');

  const [solUser, setSolUser] = useState('');
  const [solPass, setSolPass] = useState('');
  const [showSolPass, setShowSolPass] = useState(false);

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [showCertPass, setShowCertPass] = useState(false);

  const [autoEmitBoleta, setAutoEmitBoleta] = useState(true);
  const [allowFactura, setAllowFactura] = useState(false);
  const [defaultDocType, setDefaultDocType] = useState('NONE');

  const [activateEnv, setActivateEnv] = useState<'BETA' | 'PROD'>('BETA');
  const [activateEnabled, setActivateEnabled] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Cargar estado inicial
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/sunat/status');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al cargar estado');
      }
      
      setStatus(data);

      // Pre-llenar datos fiscales si existen
      if (data.fiscalData) {
        setRuc(data.fiscalData.ruc || '');
        setRazonSocial(data.fiscalData.razonSocial || '');
        setAddress(data.fiscalData.address || '');
        setUbigeo(data.fiscalData.ubigeo || '');
      }

      // Pre-llenar preferencias
      if (data.preferences) {
        setAutoEmitBoleta(data.preferences.autoEmitBoleta);
        setAllowFactura(data.preferences.allowFactura);
        setDefaultDocType(data.preferences.defaultDocType);
      }

      setActivateEnv(data.env || 'BETA');
      setActivateEnabled(data.enabled || false);

      // Ir al primer paso incompleto SOLO en la carga inicial
      // No cambiar el paso si el usuario ya está navegando
      if (data.steps && currentStep === 0 && !data.enabled) {
        const stepsOrder = ['fiscalData', 'solCredentials', 'certificate', 'testSignedXml'];
        const firstIncomplete = stepsOrder.findIndex(s => !data.steps[s]);
        if (firstIncomplete !== -1) {
          setCurrentStep(firstIncomplete);
        } else {
          setCurrentStep(4); // Preferencias
        }
      }

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Guardar datos fiscales
  const saveFiscalData = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/sunat/fiscal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruc, razonSocial, address, ubigeo }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Datos fiscales guardados');
      await loadStatus();
      setCurrentStep(1);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Guardar credenciales SOL
  const saveCredentials = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/sunat/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solUser, solPass }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Credenciales guardadas');
      setSolPass(''); // Limpiar por seguridad
      await loadStatus();
      setCurrentStep(2);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Guardar certificado
  const saveCertificate = async () => {
    if (!certFile) {
      toast.error('Selecciona un archivo .pfx');
      return;
    }

    setSaving(true);
    try {
      // Convertir archivo a Base64
      const reader = new FileReader();
      const certBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(certFile);
      });

      const res = await fetch('/api/onboarding/sunat/certificate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certPfxBase64: certBase64, certPassword }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Certificado guardado');
      setCertPassword(''); // Limpiar por seguridad
      await loadStatus();
      setCurrentStep(3);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Test de firma
  const testSign = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/sunat/test-sign', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success('✓ Firma verificada correctamente');
      await loadStatus();
      setCurrentStep(4); // Ir a Preferencias
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Guardar preferencias
  const savePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/sunat/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoEmitBoleta, allowFactura, defaultDocType }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Preferencias guardadas');
      await loadStatus();
      setCurrentStep(5); // Ir a Activar
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Activar/Desactivar
  const toggleActivation = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/sunat/activate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          enabled: activateEnabled, 
          env: activateEnv,
          confirmText: activateEnv === 'PROD' ? confirmText : undefined,
        }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success(data.message);
      await loadStatus();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // SUNAT no disponible
  if (!status?.enabledFlag) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            SUNAT No Disponible
          </h1>
          <p className="text-gray-600 mb-4">
            {status?.message || 'La facturación electrónica no está disponible en tu plan actual.'}
          </p>
          <button
            onClick={() => router.push('/pos')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Volver al POS
          </button>
        </div>
      </div>
    );
  }

  // Tienda archivada
  if (status?.storeStatus === 'ARCHIVED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <X className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Tienda Archivada
          </h1>
          <p className="text-gray-600">
            No puedes configurar SUNAT en una tienda archivada.
          </p>
        </div>
      </div>
    );
  }

  const currentStepData = STEPS[currentStep];
  const StepIcon = currentStepData?.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Configuración SUNAT
              </h1>
              <p className="text-sm text-gray-500">
                Facturación Electrónica
              </p>
            </div>
            <button
              onClick={() => router.push('/pos')}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b overflow-x-auto">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 min-w-max">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index < currentStep || 
                (status?.steps && Object.values(status.steps)[index]);
              const isCurrent = index === currentStep;
              
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(index)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-blue-100 text-blue-700'
                      : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          {/* Step Header */}
          <div className="flex items-center gap-3 mb-6">
            {StepIcon && <StepIcon className="w-6 h-6 text-blue-600" />}
            <h2 className="text-lg font-semibold text-gray-900">
              {currentStepData?.title}
            </h2>
          </div>

          {/* Step 0: Datos Fiscales */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUC <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="20123456789"
                  maxLength={11}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">11 dígitos</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                  placeholder="MI BODEGA S.A.C."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección Fiscal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Principal 123, Lima"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ubigeo <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={ubigeo}
                  onChange={(e) => setUbigeo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="150101"
                  maxLength={6}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={saveFiscalData}
                disabled={saving || !ruc || !razonSocial || !address}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Guardar y Continuar
              </button>
            </div>
          )}

          {/* Step 1: Credenciales SOL */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <Info className="w-4 h-4 inline mr-1" />
                Las credenciales SOL son las que usas para ingresar a SUNAT Operaciones en Línea.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usuario SOL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={solUser}
                  onChange={(e) => setSolUser(e.target.value.toUpperCase())}
                  placeholder="MIUSUARIO"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clave SOL <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSolPass ? 'text' : 'password'}
                    value={solPass}
                    onChange={(e) => setSolPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSolPass(!showSolPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showSolPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {status?.steps?.solCredentials && (
                <div className="p-3 bg-green-50 rounded-lg text-sm text-green-700">
                  <Check className="w-4 h-4 inline mr-1" />
                  Credenciales ya configuradas. Puedes actualizarlas si es necesario.
                </div>
              )}

              <button
                onClick={saveCredentials}
                disabled={saving || !solUser || !solPass}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Guardar y Continuar
              </button>
            </div>
          )}

          {/* Step 2: Certificado Digital */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <Info className="w-4 h-4 inline mr-1" />
                El certificado digital (.pfx) es necesario para firmar los comprobantes electrónicos.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Archivo PFX <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="cert-upload"
                  />
                  <label htmlFor="cert-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    {certFile ? (
                      <span className="text-sm text-green-600">{certFile.name}</span>
                    ) : (
                      <span className="text-sm text-gray-500">Click para subir archivo .pfx</span>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña del Certificado <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCertPass ? 'text' : 'password'}
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCertPass(!showCertPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showCertPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {status?.steps?.certificate && (
                <div className="p-3 bg-green-50 rounded-lg text-sm text-green-700">
                  <Check className="w-4 h-4 inline mr-1" />
                  Certificado ya configurado. Puedes actualizarlo si es necesario.
                </div>
              )}

              <button
                onClick={saveCertificate}
                disabled={saving || !certFile || !certPassword}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Guardar y Continuar
              </button>
            </div>
          )}

          {/* Step 3: Test Firma */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Vamos a verificar que el certificado digital puede firmar documentos correctamente.
              </p>

              {status?.steps?.testSignedXml ? (
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <Check className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-green-700">Firma verificada correctamente</p>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <TestTube className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-600 mb-4">Haz click para probar la firma</p>
                </div>
              )}

              <button
                onClick={testSign}
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                {status?.steps?.testSignedXml ? 'Probar de Nuevo' : 'Probar Firma'}
              </button>

              {status?.steps?.testSignedXml && (
                <button
                  onClick={() => setCurrentStep(4)}
                  className="w-full py-2.5 border border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 flex items-center justify-center gap-2"
                >
                  <ChevronRight className="w-4 h-4" />
                  Continuar
                </button>
              )}
            </div>
          )}

          {/* Step 4: Preferencias */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                Configura cómo quieres emitir los comprobantes electrónicos.
              </p>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Emisión automática de BOLETA</p>
                  <p className="text-sm text-gray-500">Emitir boleta automáticamente después de cada venta</p>
                </div>
                <button
                  onClick={() => setAutoEmitBoleta(!autoEmitBoleta)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    autoEmitBoleta ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    autoEmitBoleta ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Permitir FACTURA</p>
                  <p className="text-sm text-gray-500">Habilitar emisión de facturas (requiere RUC del cliente)</p>
                </div>
                <button
                  onClick={() => setAllowFactura(!allowFactura)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    allowFactura ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    allowFactura ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de documento por defecto
                </label>
                <select
                  value={defaultDocType}
                  onChange={(e) => setDefaultDocType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NONE">Ninguno (preguntar siempre)</option>
                  <option value="BOLETA">BOLETA</option>
                  {allowFactura && <option value="FACTURA">FACTURA</option>}
                </select>
              </div>

              <button
                onClick={savePreferences}
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Guardar y Continuar
              </button>
            </div>
          )}

          {/* Step 5: Activar */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Activar Facturación Electrónica</p>
                  <p className="text-sm text-gray-500">Habilitar emisión de comprobantes SUNAT</p>
                </div>
                <button
                  onClick={() => setActivateEnabled(!activateEnabled)}
                  className={`w-14 h-7 rounded-full transition-colors ${
                    activateEnabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform ${
                    activateEnabled ? 'translate-x-7' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ambiente
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActivateEnv('BETA')}
                    className={`p-3 rounded-lg border-2 text-center ${
                      activateEnv === 'BETA'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <p className="font-medium">BETA</p>
                    <p className="text-xs text-gray-500">Pruebas</p>
                  </button>
                  <button
                    onClick={() => setActivateEnv('PROD')}
                    className={`p-3 rounded-lg border-2 text-center ${
                      activateEnv === 'PROD'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <p className="font-medium">PRODUCCIÓN</p>
                    <p className="text-xs text-gray-500">Real</p>
                  </button>
                </div>
              </div>

              {activateEnv === 'PROD' && activateEnabled && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 mb-2">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    Para activar PRODUCCIÓN, escribe: <strong>ACTIVAR PRODUCCION</strong>
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Escribe aquí para confirmar"
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <button
                onClick={toggleActivation}
                disabled={saving || (activateEnv === 'PROD' && activateEnabled && confirmText !== 'ACTIVAR PRODUCCION')}
                className={`w-full py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  activateEnabled
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                {activateEnabled ? 'Activar SUNAT' : 'Desactivar SUNAT'}
              </button>

              {status?.enabled && (
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-green-700">
                    SUNAT está activo en modo {status.env}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-gray-500">
              Paso {currentStep + 1} de {STEPS.length}
            </span>
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={currentStep === STEPS.length - 1}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
