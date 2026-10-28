'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  ShoppingCart, 
  DollarSign, 
  FileText, 
  Receipt, 
  Package, 
  BarChart3, 
  Tag, 
  Settings, 
  LogOut, 
  ChevronDown, 
  ChevronRight, 
  PanelLeftClose, 
  PanelLeftOpen,
  Globe,
  Pill
} from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ShortcutsButton } from '@/components/shortcuts/ShortcutsModal';
import { useFlags } from '@/hooks/useFlags';

interface SidebarProps {
  user?: {
    name?: string;
    role?: 'OWNER' | 'ADMIN' | 'CASHIER' | 'owner' | 'admin' | 'cashier';
  };
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ user, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [promosExpanded, setPromosExpanded] = useState(false);
  const [pharmaExpanded, setPharmaExpanded] = useState(false);
  const { isOn } = useFlags();

  const isOwner = user?.role?.toUpperCase() === 'OWNER';

  const mainNavItems = [
    { icon: ShoppingCart, label: 'Punto de Venta', href: '/' },
    { icon: DollarSign, label: 'Turnos / Caja', href: '/shifts' },
    { icon: FileText, label: 'Ventas', href: '/sales' },
    { icon: Receipt, label: 'Cuentas por Cobrar', href: '/receivables' },
    { icon: Package, label: 'Inventario', href: '/inventory' },
    { icon: Globe, label: 'Catálogo Web', href: '/settings/catalog' },
    { icon: BarChart3, label: 'Reportes', href: '/reports' },
  ];

  const allPromoItems = [
    { label: 'Promociones', href: '/promotions', flag: 'ENABLE_PROMOTIONS' },
    { label: 'Cupones', href: '/coupons', flag: 'ALLOW_COUPONS' },
    { label: 'Promos Categoría', href: '/category-promotions', flag: 'ENABLE_CATEGORY_PROMOS' },
    { label: 'Promos Pack', href: '/volume-promotions', flag: 'ENABLE_VOLUME_PROMOS' },
    { label: 'Promos N-ésimo', href: '/nth-promotions', flag: 'ENABLE_NTH_PROMOS' },
  ];
  // Filtrar por flags del plan activo
  const promoItems = allPromoItems.filter(item => isOn(item.flag));

  const allPharmaItems = [
    { label: 'Proveedores', href: '/suppliers', flag: 'ENABLE_SUPPLIERS' },
    { label: 'Órdenes de Compra', href: '/purchase-orders', flag: 'ENABLE_SUPPLIERS' },
    { label: 'Pacientes', href: '/patients', flag: 'ENABLE_PATIENTS' },
    { label: 'Libro Controlados', href: '/controlled-book', flag: 'ENABLE_CONTROLLED_BOOK' },
    { label: 'Interacciones', href: '/drug-interactions', flag: 'ENABLE_PATIENTS' },
  ];
  const pharmaItems = allPharmaItems.filter(item => isOn(item.flag));

  // ThemeToggle/ShortcutsButton traen estilos para fondo claro; se adaptan al sidebar oscuro
  const footerTools = '[&_button]:!bg-transparent [&_button:hover]:!bg-white/10 [&_svg]:!text-monterrial-cream/80';
  const navIdle = 'text-monterrial-sage hover:bg-white/5 hover:text-white';
  const navActive = 'bg-monterrial-gold text-monterrial-forest font-bold shadow-md shadow-black/20';

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside className={`
      flex flex-col my-3 ml-3 rounded-3xl bg-gradient-to-b from-monterrial-forest to-monterrial-forest-deep text-monterrial-cream shadow-strong
      dark:ring-1 dark:ring-white/5 overflow-hidden
      transition-all duration-300 ease-in-out flex-shrink-0
      ${collapsed ? 'w-[72px]' : 'w-64'}
    `}>
      {/* Logo + Toggle */}
      <div className={`flex items-center ${collapsed ? 'flex-col justify-center gap-2 py-4' : 'h-[84px]'}`}>
        <div className={`flex items-center gap-3 min-w-0 ${collapsed ? '' : 'pl-5 flex-1'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/monterrial-logo-dark.png"
            alt="Monterrial"
            className="w-11 h-11 rounded-xl ring-1 ring-white/10 flex-shrink-0"
          />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold italic tracking-tight text-white">Monterrial</h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-monterrial-gold">Punto de venta</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`
            flex items-center justify-center w-9 h-9 rounded-lg text-monterrial-cream/60
            hover:bg-white/10 hover:text-monterrial-cream transition-colors flex-shrink-0
            ${collapsed ? 'mx-auto' : 'mr-3'}
          `}
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* User Profile */}
      {user && !collapsed && (
        <div className="flex items-center gap-3 mx-3 mb-2 px-3 py-3 rounded-2xl bg-white/5">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-monterrial-gold text-monterrial-forest font-bold flex-shrink-0">
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-monterrial-cream truncate">
              {user.name || 'Usuario'}
            </p>
            <p className="text-xs text-monterrial-cream/60 truncate">
              {user.role?.toUpperCase() === 'OWNER' ? 'Propietario' : user.role?.toUpperCase() === 'ADMIN' ? 'Administrador' : 'Cajero'}
            </p>
          </div>
        </div>
      )}
      {user && collapsed && (
        <div className="flex justify-center pb-3">
          <div
            title={user.name || 'Usuario'}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-monterrial-gold text-monterrial-forest font-bold text-sm"
          >
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-1">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 rounded-xl font-medium text-sm transition-all duration-200
                ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'}
                ${active ? navActive : navIdle}
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Promociones Section - Only for Owner with at least one promo flag active */}
        {isOwner && promoItems.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => {
                if (collapsed && onToggle) { onToggle(); setPromosExpanded(true); }
                else setPromosExpanded(!promosExpanded);
              }}
              title={collapsed ? 'Promociones' : undefined}
              className={`
                flex items-center rounded-xl font-medium text-sm transition-all duration-200 w-full
                ${collapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-3'}
                ${navIdle}
              `}
            >
              <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                <Tag className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>Promociones</span>}
              </div>
              {!collapsed && (promosExpanded ? (
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              ))}
            </button>

            {promosExpanded && !collapsed && (
              <div className="ml-6 mt-1 space-y-1 border-l border-white/15 pl-2">
                {promoItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
                        ${active
                          ? 'bg-white/10 font-semibold text-monterrial-gold'
                          : 'text-monterrial-cream/60 hover:bg-white/10 hover:text-monterrial-cream'
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

        {/* Farmacia Section - Only for Owner with at least one pharma flag active */}
        {isOwner && pharmaItems.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => {
                if (collapsed && onToggle) { onToggle(); setPharmaExpanded(true); }
                else setPharmaExpanded(!pharmaExpanded);
              }}
              title={collapsed ? 'Farmacia' : undefined}
              className={`
                flex items-center rounded-xl font-medium text-sm transition-all duration-200 w-full
                ${collapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-3'}
                ${navIdle}
              `}
            >
              <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                <Pill className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>Farmacia</span>}
              </div>
              {!collapsed && (pharmaExpanded ? (
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              ))}
            </button>

            {pharmaExpanded && !collapsed && (
              <div className="ml-6 mt-1 space-y-1 border-l border-white/15 pl-2">
                {pharmaItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
                        ${active
                          ? 'bg-white/10 font-semibold text-monterrial-gold'
                          : 'text-monterrial-cream/60 hover:bg-white/10 hover:text-monterrial-cream'
                        }
                      `}
                    >
                      <Pill className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Promo Monterrial: solo con menú expandido y pantallas altas */}
      {!collapsed && (
        <div className="mx-3 mb-3 hidden [@media(min-height:900px)]:block">
          <div className="relative overflow-hidden rounded-2xl h-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/bg-bodega.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#2a0f6b] via-[#3b1a8f]/80 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-monterrial-gold">Factura electrónica</p>
              <p className="text-base font-extrabold leading-tight text-white">Boletas y facturas SUNAT</p>
              <p className="text-[11px] text-white/80">Directo desde tu caja</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="py-3 px-3 space-y-1 border-t border-white/10">
        {/* Theme & Shortcuts */}
        {!collapsed && (
          <div className={`flex items-center gap-2 px-2 py-1.5 mb-2 rounded-xl bg-white/5 ${footerTools}`}>
            <ThemeToggle />
            <ShortcutsButton />
          </div>
        )}
        {collapsed && (
          <div className={`flex flex-col items-center gap-1 mb-2 ${footerTools}`}>
            <ThemeToggle />
          </div>
        )}

        <Link
          href="/settings"
          title={collapsed ? 'Configuración' : undefined}
          className={`
            flex items-center gap-3 rounded-xl font-medium text-sm transition-all duration-200
            ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'}
            ${isActive('/settings') ? navActive : navIdle}
          `}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`
            flex items-center gap-3 rounded-xl font-medium text-sm transition-all duration-200 w-full
            ${collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'}
            text-monterrial-cream/70 hover:bg-red-500/15 hover:text-red-300
          `}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
