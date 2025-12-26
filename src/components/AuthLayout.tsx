'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut, ShoppingCart, Package, BarChart3, DollarSign, FileText, Receipt, Tag } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId: string;
}

interface AuthLayoutProps {
  children: React.ReactNode;
  storeName?: string;
}

export default function AuthLayout({ children, storeName }: AuthLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-[#6B7280]">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-[#1F2A37] text-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {storeName || 'Market POS'}
            </h1>
            {user && (
              <p className="text-sm text-gray-300 mt-1">
                {user.name} • {user.role === 'OWNER' ? 'Propietario' : 'Cajero'}
              </p>
            )}
          </div>

          {user && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-[#1F2A37] hover:bg-[#374151] border border-gray-600 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Cerrar sesión</span>
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        {user && (
          <nav className="bg-[#374151] border-t border-gray-600">
            <div className="container mx-auto px-4">
              <div className="flex gap-1">
                <Link
                  href="/"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname === '/'
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Punto de Venta
                </Link>

                <Link
                  href="/shifts"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname?.startsWith('/shifts')
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  Turnos / Caja
                </Link>

                <Link
                  href="/sales"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname?.startsWith('/sales') || pathname?.startsWith('/receipt')
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Ventas
                </Link>

                <Link
                  href="/receivables"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname?.startsWith('/receivables')
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  Cuentas por Cobrar
                </Link>

                <Link
                  href="/inventory"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname?.startsWith('/inventory')
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Inventario
                </Link>

                <Link
                  href="/reports"
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    pathname?.startsWith('/reports')
                      ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  Reportes
                </Link>

                {user.role === 'OWNER' && (
                  <Link
                    href="/promotions"
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                      pathname?.startsWith('/promotions')
                        ? 'bg-[#1F2A37] text-white border-b-2 border-[#16A34A]'
                        : 'text-gray-300 hover:text-white hover:bg-[#1F2A37]'
                    }`}
                  >
                    <Tag className="w-4 h-4" />
                    Promociones
                  </Link>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>

      <main>{children}</main>
    </div>
  );
}
