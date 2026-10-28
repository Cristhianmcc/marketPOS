import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { getAllFeatureFlags } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

export default async function HomePage() {
  const session = await getSession();
  
  if (!session?.isLoggedIn) {
    redirect('/login');
  }

  // Si no tiene tienda asignada → ir a crear/gestionar tiendas (instalación nueva)
  if (!session.storeId) {
    redirect('/admin/stores');
  }

  const isSuperAdminUser = isSuperAdmin(session.email);
  const isOwner = session.role === 'OWNER';

  // Flags del plan activo — solo se consultan para OWNER no-superadmin
  const storeFlags = (isOwner && !isSuperAdminUser && session.storeId)
    ? await getAllFeatureFlags(session.storeId)
    : null;
  // null = superadmin o sin tienda → muestra todo; array = filtra por plan
  const hasFlag = (key: FeatureFlagKey) =>
    storeFlags === null || (storeFlags.find(f => f.key === key)?.enabled ?? false);

  // Plan del store — para ocultar módulos avanzados en STARTER
  let planCode: string | null = null;
  if (isOwner && !isSuperAdminUser && session.storeId) {
    const sub = await prisma.subscription.findUnique({
      where: { storeId: session.storeId },
      select: { planCode: true },
    });
    planCode = sub?.planCode ?? 'DEMO';
  }
  // STARTER no tiene acceso a módulos admin avanzados
  const isStarterPlan = planCode === 'STARTER';

  // ✅ MÓDULO PH3: Alertas de vencimiento para dashboard (solo FARMACIA/BOTICA)
  let expiryAlertSummary: { expired: number; expiringSoon: number } | null = null;
  if (session.storeId && hasFlag(FeatureFlagKey.ENABLE_BATCH_EXPIRY)) {
    const storeSettings = await prisma.storeSettings.findUnique({
      where: { storeId: session.storeId },
      select: { expiryAlertDays: true },
    });
    const alertDays = storeSettings?.expiryAlertDays ?? 60;
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + alertDays);

    const [expiredCount, expiringSoonCount] = await Promise.all([
      prisma.productBatch.count({
        where: { storeId: session.storeId, active: true, expiryDate: { lt: now } },
      }),
      prisma.productBatch.count({
        where: { storeId: session.storeId, active: true, expiryDate: { gte: now, lt: thresholdDate } },
      }),
    ]);
    expiryAlertSummary = { expired: expiredCount, expiringSoon: expiringSoonCount };
  }

  const roleDisplay = session.role === 'OWNER' ? 'Propietario' : 'Cajero';
  const currentTime = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/monterrial-logo-dark.png" alt="Monterrial" className="w-8 h-8 rounded-lg" />
              <span className="text-sm font-semibold text-text-main dark:text-text-light">Monterrial</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-main dark:text-text-light">
              Hola, {session.name}
            </h1>
            <div className="mt-1.5 flex items-center gap-4 text-sm text-text-secondary dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {roleDisplay}
              </span>
              <span className="flex items-center gap-1.5" suppressHydrationWarning>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {currentTime}
              </span>
            </div>
          </div>

          <div className="sm:text-right text-sm text-text-secondary dark:text-gray-400">
            <p className="first-letter:uppercase" suppressHydrationWarning>{currentDate}</p>
            <div className="flex items-center gap-2 mt-1 sm:justify-end">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Sistema operativo</span>
            </div>
          </div>
        </div>

        {/* ✅ MÓDULO PH3: Widget de alertas de vencimiento — solo FARMACIA/BOTICA */}
        {expiryAlertSummary && (expiryAlertSummary.expired > 0 || expiryAlertSummary.expiringSoon > 0) && (
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              {expiryAlertSummary.expired > 0 && (
                <a href="/inventory/expiry-alerts?status=EXPIRED" className="flex-1 flex items-center gap-4 bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors">
                  <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-800">{expiryAlertSummary.expired} lote{expiryAlertSummary.expired !== 1 ? 's' : ''} vencido{expiryAlertSummary.expired !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-red-600">Requieren atención inmediata · Click para ver</p>
                  </div>
                </a>
              )}
              {expiryAlertSummary.expiringSoon > 0 && (
                <a href="/inventory/expiry-alerts?status=WARNING" className="flex-1 flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors">
                  <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-800">{expiryAlertSummary.expiringSoon} lote{expiryAlertSummary.expiringSoon !== 1 ? 's' : ''} próximo{expiryAlertSummary.expiringSoon !== 1 ? 's' : ''} a vencer</p>
                    <p className="text-xs text-amber-600">Dentro del umbral de alerta · Click para ver</p>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Acciones rápidas estilo Stitch */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary dark:text-gray-400 mb-3">
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/pos"
              className="group bg-primary hover:bg-primary-hover rounded-xl transition-colors p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-white/15 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-base font-semibold text-white mb-0.5">Punto de Venta</h3>
              <p className="text-white/75 text-sm">Iniciar nueva venta</p>
            </Link>

            <Link
              href="/inventory"
              className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <h3 className="text-base font-semibold text-text-main dark:text-text-light mb-0.5">Inventario</h3>
              <p className="text-text-secondary dark:text-gray-400 text-sm">Gestionar productos</p>
            </Link>

            <Link
              href="/reports"
              className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-base font-semibold text-text-main dark:text-text-light mb-0.5">Reportes</h3>
              <p className="text-text-secondary dark:text-gray-400 text-sm">Ver estadísticas</p>
            </Link>

            <Link
              href="/shifts"
              className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-base font-semibold text-text-main dark:text-text-light mb-0.5">Turnos</h3>
              <p className="text-text-secondary dark:text-gray-400 text-sm">Gestionar caja</p>
            </Link>
          </div>
        </div>

        {/* Módulos principales */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary dark:text-gray-400 mb-3">
            Módulos del Sistema
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/sales"
            className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
          >
            <div className="contents">
              <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Ventas</h2>
              <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Historial de ventas</p>
            </div>
          </Link>

          {/* Administración - Solo Owner */}
          {isOwner && (
            <>
              <Link
                href="/admin/users"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Usuarios</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Gestionar cajeros</p>
                </div>
              </Link>

              {hasFlag(FeatureFlagKey.ENABLE_PROMOTIONS) && (
              <Link
                href="/promotions"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Promociones</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Gestionar promociones</p>
                </div>
              </Link>
              )}

              {hasFlag(FeatureFlagKey.ALLOW_COUPONS) && (
              <Link
                href="/coupons"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Cupones</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Códigos de descuento</p>
                </div>
              </Link>
              )}

              {hasFlag(FeatureFlagKey.ENABLE_CATEGORY_PROMOS) && (
              <Link
                href="/category-promotions"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Promos Categoría</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Descuentos por categoría</p>
                </div>
              </Link>
              )}

              {hasFlag(FeatureFlagKey.ENABLE_VOLUME_PROMOS) && (
              <Link
                href="/volume-promotions"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Promos Pack</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Por volumen (3x S/5)</p>
                </div>
              </Link>
              )}

              {hasFlag(FeatureFlagKey.ENABLE_NTH_PROMOS) && (
              <Link
                href="/nth-promotions"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Promos N-ésimo</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">2do al 50%, 3ro gratis</p>
                </div>
              </Link>
              )}

              <Link
                href="/admin/quick-sell"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Productos Rápidos</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Botones rápidos POS</p>
                </div>
              </Link>

              <Link
                href="/settings"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Configuración</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Ajustes de la tienda</p>
                </div>
              </Link>

              {!isStarterPlan && (
              <Link
                href="/admin/feature-flags"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Funcionalidades</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Activar/desactivar</p>
                </div>
              </Link>
              )}

              {!isStarterPlan && (
              <Link
                href="/settings/limits"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Límites Operativos</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Configurar límites</p>
                </div>
              </Link>
              )}

              {!isStarterPlan && (
              <Link
                href="/admin/audit"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Auditoría</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Historial de operaciones</p>
                </div>
              </Link>
              )}

              {!isStarterPlan && (
              <Link
                href="/admin/system"
                className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
              >
                <div className="contents">
                  <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Observabilidad</h2>
                  <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Estado del sistema</p>
                </div>
              </Link>
              )}
            </>
          )}
          </div>
        </div>

        {/* SuperAdmin Section */}
        {isSuperAdminUser && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary dark:text-gray-400 mb-3 flex items-center gap-2">
              Administración de Plataforma
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/admin/stores"
              className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
            >
              <div className="contents">
                <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Tiendas</h2>
                <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Administrar todas las tiendas</p>
              </div>
            </Link>

            <Link
              href="/admin/billing"
              className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
            >
              <div className="contents">
                <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Licencias SaaS</h2>
                <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Suscripciones y pagos</p>
              </div>
            </Link>

            <Link
              href="/admin/demo"
              className="group flex items-center gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark hover:border-primary/40 transition-colors p-4"
            >
              <div className="contents">
                <div className="p-2.5 bg-background-light dark:bg-background-dark rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-main dark:text-text-light">Demo Mode</h2>
                <p className="text-text-secondary dark:text-gray-400 text-xs mt-0.5">Activar/resetear demos</p>
              </div>
            </Link>
            </div>
          </div>
        )}

        {/* Footer con Logout */}
        <div className="mt-8 flex items-center justify-center pb-6">
          <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl px-5 py-2.5 inline-flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-400">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Sesión activa</span>
            </div>
            <div className="w-px h-5 bg-border-light dark:bg-border-dark"></div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
