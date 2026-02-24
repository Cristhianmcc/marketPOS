'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Store, User, Lock, Eye, EyeOff, ArrowRight, Package, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(false); // No verificar setup, login maneja todo

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión');
        setLoading(false);
        return;
      }

      // Si necesita provisioning (autenticó en nube pero no hay usuarios locales)
      // La sesión ya fue creada en el servidor como SUPERADMIN
      if (data.needsProvisioning) {
        // Redirigir al dashboard donde puede crear tiendas
        router.push('/');
        router.refresh();
        return;
      }

      // Login normal - Redirect to dashboard
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Login error:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  // Mostrar loading mientras carga
  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark">
      <div className="layout-container flex h-full grow flex-col justify-center items-center p-4 md:p-10">
        {/* Main Card Container */}
        <div className="w-full max-w-[1100px] bg-white dark:bg-surface-dark rounded-xl shadow-xl overflow-hidden flex flex-col md:flex-row h-auto md:min-h-[600px] border border-border-subtle dark:border-border-dark">
          
          {/* Left Side: Login Form */}
          <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-16 flex flex-col justify-center relative z-10">
            {/* Header */}
            <div className="flex flex-col gap-2 mb-10">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-2 text-primary">
                  <Store className="w-8 h-8" />
                  <span className="text-xl font-bold tracking-tight text-text-main dark:text-white">
                    Monterrial
                  </span>
                </div>
              </div>
              <h1 className="text-text-main dark:text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.02em]">
                Bienvenido de nuevo
              </h1>
              <p className="text-text-secondary dark:text-gray-400 text-sm md:text-base font-normal leading-normal">
                Ingrese sus credenciales para acceder al sistema de ventas.
              </p>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Email Field */}
              <div className="flex flex-col gap-2">
                <label
                  className="text-text-main dark:text-gray-200 text-sm font-semibold leading-normal"
                  htmlFor="email"
                >
                  Usuario
                </label>
                <div className="relative">
                  <input
                    className="flex w-full rounded-lg text-text-main dark:text-white border border-border-subtle dark:border-border-dark bg-background-light dark:bg-background-dark h-12 px-4 pl-11 text-base focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-text-secondary dark:placeholder:text-gray-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    id="email"
                    placeholder="Ingrese su correo electrónico"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary dark:text-gray-500 pointer-events-none flex items-center">
                    <User className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="flex flex-col gap-2">
                <label
                  className="text-text-main dark:text-gray-200 text-sm font-semibold leading-normal"
                  htmlFor="password"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    className="flex w-full rounded-lg text-text-main dark:text-white border border-border-subtle dark:border-border-dark bg-background-light dark:bg-background-dark h-12 px-4 pl-11 pr-12 text-base focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-text-secondary dark:placeholder:text-gray-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    id="password"
                    placeholder="Ingrese su contraseña"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary dark:text-gray-500 pointer-events-none flex items-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary dark:text-gray-500 hover:text-primary transition-colors flex items-center cursor-pointer disabled:opacity-50"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <button
                  className="w-full flex items-center justify-center rounded-lg h-12 px-6 bg-primary hover:bg-primary-hover text-background-dark text-base font-bold leading-normal tracking-[0.015em] transition-all duration-200 shadow-sm hover:shadow-md transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="truncate">Ingresando...</span>
                  ) : (
                    <>
                      <span className="truncate">Acceder al Sistema</span>
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Footer Links */}
            <div className="mt-8 text-center flex flex-col gap-4">
              <div className="text-xs text-text-secondary/60 dark:text-gray-600">
                Versión 2.4.0 © 2024 Monterrial
              </div>
            </div>
          </div>

          {/* Right Side: Visual Hero */}
          <div className="hidden md:flex md:w-1/2 bg-cover bg-center relative group">
            {/* Background Image with Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary-dark/80 to-primary/70" />
            
            {/* Content Overlay */}
            <div className="absolute inset-0 flex flex-col justify-end p-12 text-white z-20">
              <div className="mb-4 inline-flex items-center justify-center p-3 bg-white/20 backdrop-blur-md rounded-lg border border-white/30 w-fit">
                <Package className="w-6 h-6 text-white" />
              </div>
              
              <h2 className="text-3xl font-bold leading-tight mb-3 text-white drop-shadow-sm">
                Gestión eficiente para su negocio
              </h2>
              
              <p className="text-gray-100 text-lg font-light leading-relaxed max-w-sm drop-shadow-sm">
                Controle su inventario, ventas y clientes desde una sola plataforma unificada.
              </p>

              {/* Floating Stats Card (Decorative) */}
              <div className="absolute top-12 right-12 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-2xl transform rotate-6 hover:rotate-0 transition-transform duration-500 hidden lg:block">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-200 font-medium">Ventas de Hoy</p>
                    <p className="text-sm font-bold text-white">+24% vs ayer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

