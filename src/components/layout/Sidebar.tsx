'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Store, ShoppingCart, DollarSign, FileText, Receipt, Package, BarChart3, Tag, Settings, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ShortcutsButton } from '@/components/shortcuts/ShortcutsModal';

interface SidebarProps {
  user?: {
    name?: string;
    role?: 'OWNER' | 'ADMIN' | 'CASHIER' | 'owner' | 'admin' | 'cashier';
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [promosExpanded, setPromosExpanded] = useState(false);

  const isOwner = user?.role?.toUpperCase() === 'OWNER';

  const mainNavItems = [
    { icon: ShoppingCart, label: 'Punto de Venta', href: '/' },
    { icon: DollarSign, label: 'Turnos / Caja', href: '/shifts' },
    { icon: FileText, label: 'Ventas', href: '/sales' },
    { icon: Receipt, label: 'Cuentas por Cobrar', href: '/receivables' },
    { icon: Package, label: 'Inventario', href: '/inventory' },
    { icon: BarChart3, label: 'Reportes', href: '/reports' },
  ];

  const promoItems = [
    { label: 'Promociones', href: '/promotions', color: 'text-green-600 dark:text-green-400' },
    { label: 'Cupones', href: '/coupons', color: 'text-green-600 dark:text-green-400' },
    { label: 'Promos Categoría', href: '/category-promotions', color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Promos Pack', href: '/volume-promotions', color: 'text-orange-600 dark:text-orange-400' },
    { label: 'Promos N-ésimo', href: '/nth-promotions', color: 'text-yellow-600 dark:text-yellow-400' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20">
          <Store className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-main dark:text-white">BodegaPOS</h1>
          <p className="text-xs text-text-secondary dark:text-gray-400">Sistema de ventas</p>
        </div>
      </div>

      {/* User Profile */}
      {user && (
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark/50">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 dark:bg-primary/30 text-primary font-semibold">
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-main dark:text-white truncate">
              {user.name || 'Usuario'}
            </p>
            <p className="text-xs text-text-secondary dark:text-gray-400 truncate">
              {user.role?.toUpperCase() === 'OWNER' ? 'Propietario' : user.role?.toUpperCase() === 'ADMIN' ? 'Administrador' : 'Cajero'}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
                ${active 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-text-secondary dark:text-gray-400 hover:bg-background-light dark:hover:bg-background-dark hover:text-text-main dark:hover:text-white'
                }
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Promociones Section - Only for Owner */}
        {isOwner && (
          <div className="pt-2">
            <button
              onClick={() => setPromosExpanded(!promosExpanded)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 text-text-secondary dark:text-gray-400 hover:bg-background-light dark:hover:bg-background-dark hover:text-text-main dark:hover:text-white"
            >
              <div className="flex items-center gap-3">
                <Tag className="w-5 h-5 flex-shrink-0" />
                <span>Promociones</span>
              </div>
              {promosExpanded ? (
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              )}
            </button>
            
            {promosExpanded && (
              <div className="ml-4 mt-1 space-y-1 border-l-2 border-border-light dark:border-border-dark pl-2">
                {promoItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
                        ${active 
                          ? 'bg-primary/10 dark:bg-primary/20 font-semibold ' + item.color
                          : 'text-text-secondary dark:text-gray-400 hover:bg-background-light dark:hover:bg-background-dark hover:text-text-main dark:hover:text-white'
                        }
                      `}
                    >
                      <Tag className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="px-3 py-4 space-y-1 border-t border-border-light dark:border-border-dark">
        {/* Theme & Shortcuts */}
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <ThemeToggle />
          <ShortcutsButton />
        </div>
        
        <Link
          href="/settings"
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
            ${isActive('/settings')
              ? 'bg-primary text-white shadow-sm' 
              : 'text-text-secondary dark:text-gray-400 hover:bg-background-light dark:hover:bg-background-dark hover:text-text-main dark:hover:text-white'
            }
          `}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          <span>Configuración</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 w-full text-text-secondary dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
