import { NextResponse } from 'next/server';
import { PrismaUserRepository } from '@/infra/db/repositories/PrismaUserRepository';
import { verifyPassword } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { checkRateLimit, getClientIP, resetRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/auditLog';

const userRepo = new PrismaUserRepository();

export async function POST(request: Request) {
  try {
    // ✅ MÓDULO S8: Rate limit por IP
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit('login', clientIP);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      
      // Log rate limit exceeded
      await logAudit({
        action: 'LOGIN_RATE_LIMIT_EXCEEDED',
        entityType: 'USER',
        severity: 'WARN',
        ip: clientIP,
        userAgent: request.headers.get('user-agent'),
        meta: { 
          resetAt: new Date(rateLimitResult.resetAt).toISOString(),
          waitSeconds 
        },
      });
      
      return NextResponse.json(
        { 
          error: 'Demasiados intentos de login. Intenta de nuevo en ' + waitSeconds + ' segundos.',
          code: 'TOO_MANY_ATTEMPTS',
          retryAfter: waitSeconds
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(waitSeconds),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitResult.resetAt),
          }
        }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await userRepo.findByEmail(email);

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!user.active) {
      return NextResponse.json(
        { error: 'Usuario desactivado. Contacta al administrador.' },
        { status: 403 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // ✅ Login exitoso: resetear rate limit para esta IP
    resetRateLimit('login', clientIP);

    // Set session
    await setSession({
      userId: user.id,
      storeId: user.storeId,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
