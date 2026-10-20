import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from './lib/session';
import { getSessionOptions } from './lib/sessionConfig';

const protectedRoutes = ['/pos', '/inventory', '/admin', '/settings'];
const authRoutes = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route needs protection (including exact home route)
  const isProtectedRoute = pathname === '/' || protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Get session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());

  const isLoggedIn = session.isLoggedIn === true;
  const hasStore = !!session.storeId;

  // Redirect to login if trying to access protected route without auth
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to dashboard if trying to access login while already authenticated
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL(hasStore ? '/' : '/admin/stores', request.url));
  }

  // Redirect to admin/stores if logged in but no store yet (fresh install / cloud-only auth)
  // Allow /admin routes through so they can create/manage stores
  if (isLoggedIn && !hasStore && !pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin/stores', request.url));
  }

  // ✅ NOTA: Verificaciones de ARCHIVED store y billing se hacen en cada página/componente
  // No se puede usar Prisma aquí porque el middleware corre en Edge Runtime

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
