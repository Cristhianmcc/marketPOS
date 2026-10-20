import type { SessionOptions } from 'iron-session';

export const MIN_SESSION_SECRET_LENGTH = 32;

export function requireSessionSecret(value = process.env.SESSION_SECRET): string {
  if (!value || value.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters');
  }

  return value;
}

export function getSessionOptions(): SessionOptions {
  return {
    password: requireSessionSecret(),
    cookieName: 'market_pos_session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}
