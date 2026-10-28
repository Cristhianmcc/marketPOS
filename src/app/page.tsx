import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
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

  // Módulos visibles según rol, plan y funcionalidades activas
  type ModuleCard = { href: string; title: string; subtitle: string; emoji: string; tint: string };
  const modules: ModuleCard[] = [
    { href: '/sales', title: 'Ventas', subtitle: 'Historial de ventas', emoji: '🧾', tint: 'bg-[#E4DAFD]' },
  ];
  if (isOwner) {
    modules.push({ href: '/admin/users', title: 'Usuarios', subtitle: 'Gestionar cajeros', emoji: '👥', tint: 'bg-[#DCEBFF]' });
    if (hasFlag(FeatureFlagKey.ENABLE_PROMOTIONS)) modules.push({ href: '/promotions', title: 'Promociones', subtitle: 'Gestionar promociones', emoji: '🎁', tint: 'bg-[#FFE1EC]' });
    if (hasFlag(FeatureFlagKey.ALLOW_COUPONS)) modules.push({ href: '/coupons', title: 'Cupones', subtitle: 'Códigos de descuento', emoji: '🎟️', tint: 'bg-[#E3F6D8]' });
    if (hasFlag(FeatureFlagKey.ENABLE_CATEGORY_PROMOS)) modules.push({ href: '/category-promotions', title: 'Promos Categoría', subtitle: 'Descuentos por categoría', emoji: '🏷️', tint: 'bg-[#FFF6C2]' });
    if (hasFlag(FeatureFlagKey.ENABLE_VOLUME_PROMOS)) modules.push({ href: '/volume-promotions', title: 'Promos Pack', subtitle: 'Por volumen (3x S/5)', emoji: '📦', tint: 'bg-[#FFE7D1]' });
    if (hasFlag(FeatureFlagKey.ENABLE_NTH_PROMOS)) modules.push({ href: '/nth-promotions', title: 'Promos N-ésimo', subtitle: '2do al 50%, 3ro gratis', emoji: '🔁', tint: 'bg-[#E4DAFD]' });
    modules.push({ href: '/admin/quick-sell', title: 'Productos Rápidos', subtitle: 'Botones rápidos POS', emoji: '⚡', tint: 'bg-[#FFF6C2]' });
    modules.push({ href: '/settings', title: 'Configuración', subtitle: 'Ajustes de la tienda', emoji: '⚙️', tint: 'bg-[#ECEAF4]' });
    if (!isStarterPlan) {
      modules.push({ href: '/admin/feature-flags', title: 'Funcionalidades', subtitle: 'Activar/desactivar', emoji: '🎛️', tint: 'bg-[#DCEBFF]' });
      modules.push({ href: '/settings/limits', title: 'Límites Operativos', subtitle: 'Configurar límites', emoji: '🛡️', tint: 'bg-[#FFE1EC]' });
      modules.push({ href: '/admin/audit', title: 'Auditoría', subtitle: 'Historial de operaciones', emoji: '📋', tint: 'bg-[#ECEAF4]' });
      modules.push({ href: '/admin/system', title: 'Observabilidad', subtitle: 'Estado del sistema', emoji: '📡', tint: 'bg-[#E3F6D8]' });
    }
  }
  const platformModules: ModuleCard[] = isSuperAdminUser
    ? [
        { href: '/admin/stores', title: 'Tiendas', subtitle: 'Administrar todas las tiendas', emoji: '🏬', tint: 'bg-[#E4DAFD]' },
        { href: '/admin/billing', title: 'Licencias SaaS', subtitle: 'Suscripciones y pagos', emoji: '💳', tint: 'bg-[#E3F6D8]' },
        { href: '/admin/demo', title: 'Demo Mode', subtitle: 'Activar/resetear demos', emoji: '🎬', tint: 'bg-[#FFF6C2]' },
      ]
    : [];

  const moduleTile = (m: ModuleCard) => (
    <Link
      key={m.href}
      href={m.href}
      className="group flex flex-col items-center text-center gap-3 rounded-2xl bg-surface-light dark:bg-surface-dark p-5 shadow-soft hover:shadow-medium hover:-translate-y-0.5 transition-all"
    >
      <span className={`w-14 h-14 rounded-2xl ${m.tint} flex items-center justify-center text-3xl leading-none`}>{m.emoji}</span>
      <span>
        <span className="block text-sm font-bold text-text-main dark:text-text-light">{m.title}</span>
        <span className="block text-xs text-text-secondary dark:text-gray-400 mt-0.5">{m.subtitle}</span>
      </span>
    </Link>
  );

  const firstName = session.name?.trim().split(/\s+/)[0] ?? '';

  return (
    <AuthLayout storeName="Inicio">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-main dark:text-text-light">Hola, {firstName}</h1>
            <p className="text-sm text-text-secondary dark:text-gray-400 first-letter:uppercase" suppressHydrationWarning>
              {currentDate} · {currentTime} · {roleDisplay}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-surface-light dark:bg-surface-dark shadow-soft px-4 h-11 text-sm font-semibold text-text-main dark:text-text-light">
            <span className="w-2 h-2 rounded-full bg-[#A6E182]" />
            Sistema operativo
          </div>
        </div>

        {/* Banner con foto */}
        <div className="relative h-44 md:h-52 overflow-hidden rounded-3xl bg-[#1d0b4a] shadow-medium mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/bg-new1.jpg" alt="" className="absolute inset-y-0 right-0 h-full w-[62%] object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1d0b4a] from-40% via-[#1d0b4a]/70 via-55% to-transparent" />
          <div className="relative h-full flex flex-col justify-center px-7 md:px-9 max-w-[60%]">
            <span className="self-start -rotate-2 bg-[#ff7a1a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow">
              Monterrial POS
            </span>
            <h2 className="mt-3 text-2xl md:text-[34px] font-black uppercase leading-[0.95] tracking-tight text-white">
              Tu negocio <span className="block text-monterrial-gold">en orden</span>
            </h2>
            <Link
              href="/pos"
              className="mt-4 self-start inline-flex items-center gap-2 rounded-xl bg-monterrial-gold px-4 py-2 text-sm font-bold text-monterrial-forest hover:brightness-95 transition"
            >
              Empezar a vender →
            </Link>
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

        {/* Acciones rápidas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link href="/pos" className="group relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-lg shadow-primary/30 hover:bg-primary-hover transition">
            <span className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">🛒</span>
            <p className="mt-4 text-lg font-bold">Punto de Venta</p>
            <p className="text-sm text-white/80">Iniciar nueva venta</p>
          </Link>
          <Link href="/inventory" className="group rounded-2xl bg-surface-light dark:bg-surface-dark p-5 shadow-soft hover:shadow-medium transition">
            <span className="w-12 h-12 rounded-xl bg-monterrial-gold flex items-center justify-center text-2xl">📦</span>
            <p className="mt-4 text-lg font-bold text-text-main dark:text-text-light">Inventario</p>
            <p className="text-sm text-text-secondary dark:text-gray-400">Gestionar productos</p>
          </Link>
          <Link href="/reports" className="group rounded-2xl bg-surface-light dark:bg-surface-dark p-5 shadow-soft hover:shadow-medium transition">
            <span className="w-12 h-12 rounded-xl bg-monterrial-lime flex items-center justify-center text-2xl">📊</span>
            <p className="mt-4 text-lg font-bold text-text-main dark:text-text-light">Reportes</p>
            <p className="text-sm text-text-secondary dark:text-gray-400">Ver estadísticas</p>
          </Link>
          <Link href="/shifts" className="group rounded-2xl bg-surface-light dark:bg-surface-dark p-5 shadow-soft hover:shadow-medium transition">
            <span className="w-12 h-12 rounded-xl bg-monterrial-lavender flex items-center justify-center text-2xl">💰</span>
            <p className="mt-4 text-lg font-bold text-text-main dark:text-text-light">Turnos</p>
            <p className="text-sm text-text-secondary dark:text-gray-400">Gestionar caja</p>
          </Link>
        </div>

        {/* Módulos del sistema */}
        <h2 className="mb-3 text-lg font-bold text-text-main dark:text-text-light">Módulos del sistema</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
          {modules.map(moduleTile)}
        </div>

        {platformModules.length > 0 && (
          <>
            <h2 className="mb-3 text-lg font-bold text-text-main dark:text-text-light flex items-center gap-2">
              Administración de plataforma
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">SuperAdmin</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
              {platformModules.map(moduleTile)}
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
