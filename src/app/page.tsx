import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getSession();
  
  if (!session?.isLoggedIn) {
    redirect('/login');
  }

  const isSuperAdminUser = isSuperAdmin(session.email);
  const isOwner = session.role === 'OWNER';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Market POS</h1>
          <p className="text-gray-600">Bienvenido, {session.name}</p>
          <p className="text-sm text-gray-500 mt-1">Rol: {session.role}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Módulos principales */}
          <Link
            href="/pos"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">🛒 Punto de Venta</h2>
            <p className="text-gray-600">Procesar ventas y gestionar turno</p>
          </Link>

          <Link
            href="/inventory"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">📦 Inventario</h2>
            <p className="text-gray-600">Gestión de productos y stock</p>
          </Link>

          <Link
            href="/sales"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">📊 Ventas</h2>
            <p className="text-gray-600">Historial de ventas</p>
          </Link>

          <Link
            href="/shifts"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">💵 Turnos</h2>
            <p className="text-gray-600">Historial de turnos y caja</p>
          </Link>

          <Link
            href="/reports"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">📈 Reportes</h2>
            <p className="text-gray-600">Reportes y exportación</p>
          </Link>

          {/* Administración - Solo Owner */}
          {isOwner && (
            <>
              <Link
                href="/admin/users"
                className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 hover:border-blue-300 transition-colors"
              >
                <h2 className="text-xl font-bold text-blue-900 mb-2">👥 Usuarios</h2>
                <p className="text-blue-700">Gestionar cajeros</p>
              </Link>

              <Link
                href="/settings"
                className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 hover:border-blue-300 transition-colors"
              >
                <h2 className="text-xl font-bold text-blue-900 mb-2">⚙️ Configuración</h2>
                <p className="text-blue-700">Ajustes de la tienda</p>
              </Link>
            </>
          )}

          {/* SuperAdmin */}
          {isSuperAdminUser && (
            <Link
              href="/admin/stores"
              className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6 hover:border-purple-300 transition-colors"
            >
              <h2 className="text-xl font-bold text-purple-900 mb-2">🏪 Tiendas</h2>
              <p className="text-purple-700">Administrar tiendas (SuperAdmin)</p>
            </Link>
          )}
        </div>

        <div className="mt-8 text-center">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Cerrar Sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
