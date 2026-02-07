import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { UserRole } from '@/domain/types';

export interface SessionData {
  userId: string;
  storeId: string;
  email: string;
  name: string;
  role: UserRole;
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_for_security',
  cookieName: 'market_pos_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Get current session (server-side only)
 * MÓDULO S2: Cached per request using React.cache()
 * This eliminates duplicate session reads within the same request
 */
export const getSession = cache(async (): Promise<IronSession<SessionData>> => {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
});

/**
 * Set session data after login
 */
export async function setSession(data: Omit<SessionData, 'isLoggedIn'>): Promise<void> {
  const session = await getSession();
  session.userId = data.userId;
  session.storeId = data.storeId;
  session.email = data.email;
  session.name = data.name;
  session.role = data.role;
  session.isLoggedIn = true;
  await session.save();
}

/**
 * Clear session (logout)
 */
export async function clearSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session.isLoggedIn === true;
}

/**
 * Get current user from session (or null if not authenticated)
 */
export async function getCurrentUser(): Promise<SessionData | null> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return null;
  }
  return {
    userId: session.userId,
    storeId: session.storeId,
    email: session.email,
    name: session.name,
    role: session.role,
    isLoggedIn: session.isLoggedIn,
  };
}

/**
 * Get session or throw error if not authenticated (MÓDULO 16)
 */
export async function getSessionOrThrow(): Promise<SessionData> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    throw new Error('UNAUTHORIZED');
  }
  return {
    userId: session.userId,
    storeId: session.storeId,
    email: session.email,
    name: session.name,
    role: session.role,
    isLoggedIn: session.isLoggedIn,
  };
}
