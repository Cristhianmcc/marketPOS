'use client';

import { useEffect } from 'react';

export default function PosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Error POS]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl p-8 max-w-md w-full text-center border border-gray-700">
        <div className="w-16 h-16 bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Error en el POS</h2>
        <p className="text-gray-400 text-sm mb-6">
          El módulo de ventas encontró un error. Las ventas guardadas no se han perdido.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors font-medium text-sm"
          >
            Recargar página
          </button>
        </div>
      </div>
    </div>
  );
}
