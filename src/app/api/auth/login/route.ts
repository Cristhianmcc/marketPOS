import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '@/infra/db/repositories/PrismaUserRepository';
import { verifyPassword } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { checkRateLimit, getClientIP, resetRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/auditLog';
import bcrypt from 'bcrypt';

const userRepo = new PrismaUserRepository();

// Cliente Prisma para la nube
function getCloudPrisma() {
  const cloudUrl = process.env.CLOUD_DATABASE_URL;
  console.log('[Login] CLOUD_DATABASE_URL exists:', !!cloudUrl);
  if (cloudUrl) {
    console.log('[Login] Cloud URL (masked):', cloudUrl.replace(/:[^:@]+@/, ':****@'));
  }
  if (!cloudUrl) return null;
  
  return new PrismaClient({
    datasources: { db: { url: cloudUrl } },
  });
}

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

    // ========================================
    // PASO 1: SIEMPRE intentar login LOCAL primero
    // ========================================
    let localUser = null;
    try {
      localUser = await userRepo.findByEmail(email);
      console.log('[Login] Local user lookup result:', localUser ? 'found' : 'not found');
    } catch (localDbError) {
      console.error('[Login] Error connecting to local DB:', localDbError);
      // Si falla la conexión local, intentar cloud
    }

    // Si encontramos usuario local, autenticar contra local
    if (localUser) {
      // Check if user is active
      if (!localUser.active) {
        return NextResponse.json(
          { error: 'Usuario desactivado. Contacta al administrador.' },
          { status: 403 }
        );
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, localUser.password);

      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Contraseña incorrecta' },
          { status: 401 }
        );
      }

      // ✅ Login LOCAL exitoso
      resetRateLimit('login', clientIP);

      await setSession({
        userId: localUser.id,
        storeId: localUser.storeId,
        email: localUser.email,
        name: localUser.name,
        role: localUser.role,
      });

      console.log('[Login] Local auth SUCCESS for:', email);
      return NextResponse.json({
        success: true,
        authType: 'LOCAL',
        user: {
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          role: localUser.role,
          storeId: localUser.storeId,
        },
      });
    }

    // ========================================
    // PASO 2: Usuario NO existe localmente → ir a NUBE
    // (Solo para primera configuración con OWNER)
    // ========================================
    console.log('[Login] User not found locally, attempting cloud authentication...');
    
    const cloudPrisma = getCloudPrisma();
    if (!cloudPrisma) {
      return NextResponse.json(
        { error: 'Usuario no encontrado. Verifique sus credenciales.' },
        { status: 401 }
      );
    }

    try {
      // Buscar usuario en la nube
        const cloudUser = await cloudPrisma.user.findUnique({
          where: { email },
          include: { store: true },
        });

        if (!cloudUser) {
          await cloudPrisma.$disconnect();
          return NextResponse.json(
            { error: `Usuario "${email}" no encontrado en la nube` },
            { status: 401 }
          );
        }

        // Verificar que sea OWNER
        if (cloudUser.role !== 'OWNER') {
          await cloudPrisma.$disconnect();
          return NextResponse.json(
            { error: 'Solo administradores (OWNER) pueden configurar nuevas instalaciones' },
            { status: 403 }
          );
        }

        // Verificar contraseña
        const isValid = await bcrypt.compare(password, cloudUser.password);
        if (!isValid) {
          await cloudPrisma.$disconnect();
          return NextResponse.json(
            { error: 'Contraseña incorrecta (verificada contra la nube)' },
            { status: 401 }
          );
        }

        await cloudPrisma.$disconnect();
        
        // Login exitoso en la nube - crear sesión SUPERADMIN para acceder al dashboard
        // El storeId es null porque aún no hay tienda local
        await setSession({
          userId: cloudUser.id,
          storeId: null, // Sin tienda local aún
          email: cloudUser.email,
          name: cloudUser.name,
          role: 'SUPERADMIN', // Rol elevado para crear tiendas
        });
        
        // Reset rate limit después de éxito
        resetRateLimit('login', clientIP);
        
        return NextResponse.json({
          success: true,
          needsProvisioning: true,
          user: {
            id: cloudUser.id,
            email: cloudUser.email,
            name: cloudUser.name,
            role: 'SUPERADMIN',
            storeId: null,
          },
          message: 'Autenticado. Redirigiendo al dashboard...',
        });
      } catch (cloudError) {
        console.error('[Login] Cloud auth error:', cloudError);
        const errMsg = cloudError instanceof Error ? cloudError.message : String(cloudError);
        return NextResponse.json(
          { error: `Error conectando a la nube: ${errMsg.substring(0, 100)}` },
          { status: 503 }
        );
      }

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
