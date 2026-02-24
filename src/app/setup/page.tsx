// src/app/setup/page.tsx
// Página de provisioning para configurar una nueva instalación desktop
// Flujo: 1) Login con credenciales de la nube  2) Crear tienda y usuario local

'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Store,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  AlertCircle,
  Building,
  Phone,
  FileText,
  MapPin,
  Mail,
} from 'lucide-react';

type Step = 'check' | 'cloud-login' | 'provision' | 'success';

interface AdminData {
  id: string;
  email: string;
  name: string;
  role: string;
  storeName: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('check');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Cloud login
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [showCloudPassword, setShowCloudPassword] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  
  // Provision form
  const [storeName, setStoreName] = useState('');
  const [storeRuc, setStoreRuc] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);

  useEffect(() => {
    // Verificar si viene del login con admin ya autenticado
    const storedAdmin = sessionStorage.getItem('setupAdmin');
    if (storedAdmin) {
      try {
        const admin = JSON.parse(storedAdmin);
        setAdminData(admin);
        setStep('provision'); // Saltar directo a provisioning
        sessionStorage.removeItem('setupAdmin'); // Limpiar
        return;
      } catch (e) {
        console.error('Error parsing stored admin:', e);
      }
    }
    
    // Si no hay admin guardado, verificar estado
    checkProvisioned();
  }, []);

  const checkProvisioned = async () => {
    try {
      const res = await fetch('/api/setup/check');
      const data = await res.json();
      
      if (data.isProvisioned) {
        // Ya está provisionado, ir a login normal
        router.push('/login');
      } else {
        // Mostrar paso de login a la nube
        setStep('cloud-login');
      }
    } catch (error) {
      console.error('Error checking provisioned status:', error);
      setStep('cloud-login');
    }
  };

  const handleCloudLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/setup/login-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cloudEmail, password: cloudPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error de autenticación');
        setLoading(false);
        return;
      }

      // Admin autenticado
      setAdminData(data.admin);
      setStep('provision');
      setLoading(false);
    } catch (err) {
      console.error('Cloud login error:', err);
      setError('Error de conexión al servidor central');
      setLoading(false);
    }
  };

  const handleProvision = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/setup/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          storeRuc,
          storeAddress,
          storePhone,
          userName,
          userEmail,
          userPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al configurar la instalación');
        setLoading(false);
        return;
      }

      // Éxito
      setStep('success');
      setLoading(false);
      
      // Redirigir a login después de 3 segundos
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      console.error('Provision error:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  // Pantalla de verificación
  if (step === 'check') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Verificando instalación...</p>
        </div>
      </div>
    );
  }

  // Pantalla de éxito
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            ¡Instalación Completada!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            La tienda ha sido configurada correctamente. Redirigiendo al inicio de sesión...
          </p>
          <div className="text-sm text-gray-500 dark:text-gray-500">
            <p>Credenciales del cliente:</p>
            <p className="font-mono font-semibold">{userEmail}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden max-w-4xl w-full flex flex-col md:flex-row">
        
        {/* Panel izquierdo - Info */}
        <div className="w-full md:w-2/5 bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <Store className="w-8 h-8" />
              <span className="text-xl font-bold">Monterrial POS</span>
            </div>
            
            <h2 className="text-2xl font-bold mb-4">
              {step === 'cloud-login' ? 'Configuración Inicial' : 'Crear Tienda'}
            </h2>
            
            <p className="text-emerald-100 mb-8">
              {step === 'cloud-login' 
                ? 'Ingrese sus credenciales de administrador para configurar una nueva instalación.'
                : 'Complete los datos de la tienda y el usuario que utilizará este equipo.'
              }
            </p>

            {/* Steps indicator */}
            <div className="space-y-4">
              <div className={`flex items-center gap-3 ${step === 'cloud-login' ? 'opacity-100' : 'opacity-60'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'cloud-login' ? 'bg-white text-emerald-600' : 'bg-emerald-400/30'}`}>
                  {step === 'provision' ? <CheckCircle2 className="w-5 h-5" /> : <Cloud className="w-4 h-4" />}
                </div>
                <span className="font-medium">Autenticar Administrador</span>
              </div>
              
              <div className={`flex items-center gap-3 ${step === 'provision' ? 'opacity-100' : 'opacity-60'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'provision' ? 'bg-white text-emerald-600' : 'bg-emerald-400/30'}`}>
                  <HardDrive className="w-4 h-4" />
                </div>
                <span className="font-medium">Configurar Tienda Local</span>
              </div>
            </div>
          </div>

          {adminData && step === 'provision' && (
            <div className="mt-8 p-4 bg-white/10 rounded-lg">
              <p className="text-sm text-emerald-100 mb-1">Autenticado como:</p>
              <p className="font-semibold">{adminData.name}</p>
              <p className="text-sm text-emerald-200">{adminData.email}</p>
            </div>
          )}
        </div>

        {/* Panel derecho - Formulario */}
        <div className="w-full md:w-3/5 p-8">
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Cloud Login Form */}
          {step === 'cloud-login' && (
            <form onSubmit={handleCloudLogin} className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  Iniciar Sesión
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Use sus credenciales de administrador de la nube
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={cloudEmail}
                      onChange={(e) => setCloudEmail(e.target.value)}
                      className="w-full h-12 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="admin@empresa.com"
                      required
                      disabled={loading}
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showCloudPassword ? 'text' : 'password'}
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      className="w-full h-12 pl-11 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                    />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => setShowCloudPassword(!showCloudPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCloudPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Provision Form */}
          {step === 'provision' && (
            <form onSubmit={handleProvision} className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  Datos de la Tienda
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Configure los datos del cliente que usará este equipo
                </p>
              </div>

              {/* Store fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre de la Tienda *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="Mi Tienda"
                      required
                      disabled={loading}
                    />
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    RUC (opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={storeRuc}
                      onChange={(e) => setStoreRuc(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="20123456789"
                      disabled={loading}
                    />
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Teléfono (opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="999123456"
                      disabled={loading}
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Dirección (opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="Av. Principal 123"
                      disabled={loading}
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Usuario del Cliente
                </h4>
              </div>

              {/* User fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="Juan Pérez"
                      required
                      disabled={loading}
                    />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email *
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      className="w-full h-11 pl-11 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="cliente@tienda.com"
                      required
                      disabled={loading}
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <input
                      type={showUserPassword ? 'text' : 'password'}
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      className="w-full h-11 pl-11 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      disabled={loading}
                    />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => setShowUserPassword(!showUserPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showUserPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('cloud-login')}
                  className="h-12 px-6 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Atrás
                </button>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>
                      Completar Instalación
                      <CheckCircle2 className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
