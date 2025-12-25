'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function StoreArchivedPage() {
  const searchParams = useSearchParams();
  const storeName = searchParams.get('storeName');

  useEffect(() => {
    // Auto logout after 5 seconds
    const timer = setTimeout(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Tienda Archivada
        </h1>

        {storeName && (
          <p className="text-gray-600 mb-4">
            La tienda <span className="font-semibold">{storeName}</span> está archivada.
          </p>
        )}

        <p className="text-gray-600 mb-6">
          Esta tienda no está operativa. Contacta al soporte para más información.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
          <p className="text-sm text-yellow-800">
            Serás desconectado automáticamente en 5 segundos...
          </p>
        </div>

        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
        >
          Cerrar Sesión Ahora
        </button>
      </div>
    </div>
  );
}
