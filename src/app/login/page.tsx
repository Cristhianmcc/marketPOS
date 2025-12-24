'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

      // Redirect to dashboard
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Login error:', err);
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-[#1F2A37] mb-2">
              Market POS
            </h1>
            <p className="text-[#6B7280]">
              Inicia sesión para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#1F2A37] mb-2"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-12 px-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                placeholder="usuario@bodega.com"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#1F2A37] mb-2"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-12 px-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#16A34A] text-white rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <p className="text-sm text-[#6B7280] mb-2">
              Credenciales de prueba:
            </p>
            <div className="space-y-1 text-xs text-[#6B7280] font-mono">
              <p>Owner: owner@bodega.com / password123</p>
              <p>Cajero: cashier@bodega.com / password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
