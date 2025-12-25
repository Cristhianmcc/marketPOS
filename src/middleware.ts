import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData } from './lib/session';
import { prisma } from './infra/db/prisma';

const protectedRoutes = ['/pos', '/inventory', '/admin', '/settings'];
const authRoutes = ['/login'];

// Rutas que se bloquean si la tienda está ARCHIVED
const operationalRoutes = ['/pos', '/inventory', '/sales', '/shifts', '/customers', '/receivables'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route needs protection (including exact home route)
  const isProtectedRoute = pathname === '/' || protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Get session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_for_security',
    cookieName: 'market_pos_session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    },
  });

  const isLoggedIn = session.isLoggedIn === true;

  // Redirect to login if trying to access protected route without auth
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to dashboard if trying to access login while already authenticated
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Check if accessing operational route with ARCHIVED store
  const isOperationalRoute = operationalRoutes.some((route) => pathname.startsWith(route));
  if (isLoggedIn && isOperationalRoute && session.storeId) {
    try {
      const store = await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { status: true, name: true },
      });

      if (store && store.status === 'ARCHIVED') {
        // Redirect to blocked page or show error
        const blockedUrl = new URL('/store-archived', request.url);
        blockedUrl.searchParams.set('storeName', store.name);
        return NextResponse.redirect(blockedUrl);
      }
    } catch (error) {
      console.error('Error checking store status:', error);
      // Continue on error to avoid blocking legitimate access
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
