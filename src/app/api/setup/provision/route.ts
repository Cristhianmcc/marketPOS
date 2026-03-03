// src/app/api/setup/provision/route.ts
// Crea la tienda y usuario del cliente en la base de datos LOCAL

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Ruta fija sin depender de env vars — siempre disponible en Node.js
const MONTERRIAL_DIR = path.join(os.homedir(), 'Documents', 'MonterrialPOS');

interface ProvisionRequest {
  // Datos de la tienda
  storeName: string;
  storeRuc?: string;
  storeAddress?: string;
  storePhone?: string;
  
  // Datos del usuario
  userName: string;
  userEmail: string;
  userPassword: string;
}

export async function POST(request: Request) {
  try {
    const body: ProvisionRequest = await request.json();
    
    // Validaciones
    if (!body.storeName || body.storeName.length < 3) {
      return NextResponse.json(
        { error: 'El nombre de la tienda debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    if (!body.userName || body.userName.length < 2) {
      return NextResponse.json(
        { error: 'El nombre del usuario debe tener al menos 2 caracteres' },
        { status: 400 }
      );
    }

    if (!body.userEmail || !body.userEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    if (!body.userPassword || body.userPassword.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Verificar que no haya usuarios existentes (solo se puede provisionar una vez)
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { error: 'Esta instalación ya fue configurada. Si necesita reconfigurar, contacte soporte.' },
        { status: 409 }
      );
    }

    // Hash de la contraseña
    const hashedPassword = await hashPassword(body.userPassword);

    // Crear tienda y usuario en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear la tienda
      const store = await tx.store.create({
        data: {
          name: body.storeName,
          ruc: body.storeRuc || null,
          address: body.storeAddress || null,
          phone: body.storePhone || null,
          status: 'ACTIVE',
        },
      });

      // 2. Crear el usuario OWNER
      const user = await tx.user.create({
        data: {
          storeId: store.id,
          email: body.userEmail.toLowerCase().trim(),
          name: body.userName,
          password: hashedPassword,
          role: 'OWNER',
          active: true,
        },
      });

      // 3. Crear configuración inicial de la tienda
      await tx.storeSettings.create({
        data: {
          storeId: store.id,
          // Valores por defecto (campos correctos del schema)
          ticketHeaderLine1: body.storeName,
          ticketHeaderLine2: body.storeAddress || null,
          ticketFooter: '¡Gracias por su compra!',
          defaultPaymentMethod: 'CASH',
          onboardingStep: 6, // Completado
          onboardingCompletedAt: new Date(),
        },
      });

      // 4. Crear suscripción TRIAL de 30 días automáticamente
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 30);
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await tx.subscription.create({
        data: {
          storeId: store.id,
          planCode: 'STARTER',
          status: 'TRIAL',
          startAt: now,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          priceAmount: 0,
          priceCurrency: 'PEN',
          billingCycle: 'MONTHLY',
          notes: 'Trial automático al instalar desktop',
        },
      });

      // 5. Crear categorías por defecto
      const defaultCategories = [
        { name: 'Abarrotes',            slug: 'abarrotes',            color: '#F59E0B', icon: '🛒', sortOrder: 1 },
        { name: 'Bebidas',              slug: 'bebidas',              color: '#3B82F6', icon: '🥤', sortOrder: 2 },
        { name: 'Lácteos y Derivados',  slug: 'lacteos-derivados',    color: '#BFDBFE', icon: '🥛', sortOrder: 3 },
        { name: 'Panadería y Pastelería', slug: 'panaderia-pasteleria', color: '#D97706', icon: '🍞', sortOrder: 4 },
        { name: 'Carnes y Embutidos',   slug: 'carnes-embutidos',     color: '#EF4444', icon: '🥩', sortOrder: 5 },
        { name: 'Frutas y Verduras',    slug: 'frutas-verduras',      color: '#10B981', icon: '🥦', sortOrder: 6 },
        { name: 'Limpieza del Hogar',   slug: 'limpieza-hogar',       color: '#6366F1', icon: '🧹', sortOrder: 7 },
        { name: 'Cuidado Personal',     slug: 'cuidado-personal',     color: '#EC4899', icon: '🧴', sortOrder: 8 },
        { name: 'Golosinas y Snacks',   slug: 'golosinas-snacks',     color: '#F97316', icon: '🍬', sortOrder: 9 },
        { name: 'Congelados',           slug: 'congelados',           color: '#60A5FA', icon: '🧊', sortOrder: 10 },
        { name: 'Farmacia',             slug: 'farmacia',             color: '#34D399', icon: '💊', sortOrder: 11 },
        { name: 'Otros',               slug: 'otros',                color: '#9CA3AF', icon: '📦', sortOrder: 12 },
      ];
      await tx.category.createMany({
        data: defaultCategories.map((cat) => ({
          storeId: store.id,
          name: cat.name,
          slug: cat.slug,
          color: cat.color,
          icon: cat.icon,
          sortOrder: cat.sortOrder,
          active: true,
        })),
        skipDuplicates: true,
      });

      return { store, user };
    });

    console.log(`[setup/provision] Store created: ${result.store.name} (ID: ${result.store.id})`);
    console.log(`[setup/provision] User created: ${result.user.email} (Role: ${result.user.role})`);

    // Escribir store_info.json en disco — lo lee server.ts para sincronizar con cloud
    const storeInfoPayload = {
      storeId: result.store.id,
      storeName: result.store.name,
      ownerEmail: result.user.email,
      ownerName: result.user.name,
    };
    try {
      fs.mkdirSync(MONTERRIAL_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(MONTERRIAL_DIR, 'store_info.json'),
        JSON.stringify(storeInfoPayload, null, 2)
      );
      console.log('[setup/provision] store_info.json escrito en disco');
    } catch (e: any) {
      console.warn('[setup/provision] No se pudo escribir store_info.json:', e.message);
    }

    // Registrar la tienda en la BD cloud para que aparezca en /admin/billing
    const cloudUrl = process.env.CLOUD_URL || process.env.NEXT_PUBLIC_CLOUD_URL;
    const licenseApiKey = process.env.LICENSE_API_KEY;
    if (cloudUrl && licenseApiKey) {
      const registrationPayload = {
        storeId: result.store.id,
        storeName: result.store.name,
        ownerEmail: result.user.email,
        ownerName: result.user.name,
        ruc: body.storeRuc || null,
        address: body.storeAddress || null,
        phone: body.storePhone || null,
      };

      // Intentar registro en la nube, con fallback a archivo pendiente
      const tryRegister = async () => {
        try {
          const res = await fetch(`${cloudUrl}/api/license/register-store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': licenseApiKey },
            body: JSON.stringify(registrationPayload),
            signal: AbortSignal.timeout(15000), // 15 segundos máximo
          });
          if (res.ok) {
            console.log(`[setup/provision] Cloud registration OK: ${result.store.name}`);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        } catch (e: any) {
          console.warn(`[setup/provision] Cloud registration failed (${e.message}), saving as pending`);
          // Guardar en archivo pendiente — usa path fijo, NO depende de env vars
          try {
            const pendingFile = path.join(MONTERRIAL_DIR, 'pending_registrations.json');
            let pending: any[] = [];
            if (fs.existsSync(pendingFile)) {
              pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
            }
            if (!pending.find((p: any) => p.storeId === registrationPayload.storeId)) {
              pending.push(registrationPayload);
              fs.mkdirSync(MONTERRIAL_DIR, { recursive: true });
              fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
              console.log('[setup/provision] Saved to pending_registrations.json para retry');
            }
          } catch (fsErr: any) {
            console.warn('[setup/provision] Could not save pending registration:', fsErr.message);
          }
        }
      };

      tryRegister(); // fire-and-forget con fallback
    }

    return NextResponse.json({
      success: true,
      store: {
        id: result.store.id,
        name: result.store.name,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      message: 'Instalación completada. Ahora puede iniciar sesión.',
    });
  } catch (error) {
    console.error('[setup/provision] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    // Error de email duplicado
    if (errorMessage.includes('Unique constraint') && errorMessage.includes('email')) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con ese email' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Error al configurar la instalación: ' + errorMessage },
      { status: 500 }
    );
  }
}
