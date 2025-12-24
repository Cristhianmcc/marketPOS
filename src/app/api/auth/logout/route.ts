import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function POST() {
  try {
    await clearSession();

    // Redirect to login after clearing session
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'));
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Error al cerrar sesión' },
      { status: 500 }
    );
  }
}
