'use client';

export function LogoutButton({ className = 'px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700' }: { className?: string }) {
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
      className={className}
    >
      Cerrar Sesión
    </button>
  );
}
