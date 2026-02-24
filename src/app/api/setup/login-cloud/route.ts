// src/app/api/setup/login-cloud/route.ts
// Login contra la base de datos de la NUBE para autenticar al admin/owner
// Este endpoint usa CLOUD_DATABASE_URL en lugar de DATABASE_URL

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Cliente Prisma separado que conecta a la nube
function getCloudPrisma() {
  const cloudUrl = process.env.CLOUD_DATABASE_URL;
  
  if (!cloudUrl) {
    throw new Error('CLOUD_DATABASE_URL not configured');
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: cloudUrl,
      },
    },
  });
}

export async function POST(request: Request) {
  let cloudPrisma: PrismaClient | null = null;
  
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que CLOUD_DATABASE_URL esté configurado
    if (!process.env.CLOUD_DATABASE_URL) {
      return NextResponse.json(
        { error: 'Servidor no configurado para provisioning. Falta CLOUD_DATABASE_URL.' },
        { status: 500 }
      );
    }

    // Conectar a la base de datos de la nube
    cloudPrisma = getCloudPrisma();

    // Buscar usuario en la nube
    const user = await cloudPrisma.user.findUnique({
      where: { email },
      include: { store: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Verificar que sea OWNER (solo owners pueden provisionar)
    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo administradores pueden configurar nuevas instalaciones' },
        { status: 403 }
      );
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Login exitoso - devolver datos del admin (sin contraseña)
    return NextResponse.json({
      success: true,
      admin: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeName: user.store?.name || 'Sin tienda',
      },
    });
  } catch (error) {
    console.error('[setup/login-cloud] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    // Errores comunes de conexión
    if (errorMessage.includes('CLOUD_DATABASE_URL')) {
      return NextResponse.json(
        { error: 'Configuración de nube no disponible' },
        { status: 500 }
      );
    }
    
    if (errorMessage.includes('connect') || errorMessage.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'No se puede conectar al servidor central. Verifica tu conexión a internet.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Error al autenticar: ' + errorMessage },
      { status: 500 }
    );
  } finally {
    // Cerrar la conexión a la nube
    if (cloudPrisma) {
      await cloudPrisma.$disconnect();
    }
  }
}
