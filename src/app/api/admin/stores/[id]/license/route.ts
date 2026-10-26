import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { registerStoreInCloud } from '@/lib/cloudLicenseRegistration';
import { saveStoreLicenseCredential } from '@/lib/licenseCredentialStore';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (session.role !== 'SUPERADMIN' && !isSuperAdmin(session.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!session.cloudAdminToken) {
    return NextResponse.json(
      { error: 'Vuelve a iniciar sesion como SUPERADMIN para autorizar el registro en la nube.' },
      { status: 401 },
    );
  }

  const { id } = await params;
  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: 'OWNER', active: true },
        select: { email: true, name: true },
        take: 1,
      },
      subscription: { select: { planCode: true } },
    },
  });

  if (!store) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
  }
  if (store.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Reactiva la tienda antes de registrar su licencia.' }, { status: 409 });
  }
  const owner = store.users[0];
  if (!owner || !store.subscription) {
    return NextResponse.json(
      { error: 'La tienda necesita un OWNER activo y un plan antes de registrarse.' },
      { status: 409 },
    );
  }

  try {
    const cloudResult = await registerStoreInCloud({
      storeId: store.id,
      storeName: store.name,
      ownerEmail: owner.email,
      ownerName: owner.name,
      ruc: store.ruc,
      address: store.address,
      phone: store.phone,
      planCode: store.subscription.planCode,
    }, session.cloudAdminToken);
    await saveStoreLicenseCredential(store.id, cloudResult.licenseToken);
    return NextResponse.json({
      ok: true,
      already: cloudResult.already,
      message: cloudResult.already
        ? 'Vinculo de licencia renovado.'
        : 'Tienda registrada en Licencias.',
    });
  } catch (error) {
    console.error('[AdminStoreLicense] Cloud registration failed:', error);
    return NextResponse.json(
      { error: 'No se pudo registrar la licencia. Verifica Internet y CLOUD_URL.' },
      { status: 502 },
    );
  }
}
