import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

function isSuperAdmin(email: string): boolean {
  const superadminEmails = process.env.SUPERADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  return superadminEmails.includes(email);
}

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session.userId) {
      return NextResponse.json({ isSuperAdmin: false });
    }

    return NextResponse.json({ 
      isSuperAdmin: isSuperAdmin(session.email)
    });
  } catch (error) {
    return NextResponse.json({ isSuperAdmin: false });
  }
}
