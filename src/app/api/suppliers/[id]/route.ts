import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });
    if (user.role !== 'OWNER') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { name, ruc, contactName, phone, email, address, notes, active } = body;

    const existing = await prisma.supplier.findFirst({
      where: { id, storeId: user.storeId },
    });
    if (!existing) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(ruc !== undefined && { ruc: ruc?.trim() || null }),
        ...(contactName !== undefined && { contactName: contactName?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });

    return NextResponse.json({ supplier });
  } catch (error) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!user.storeId) return NextResponse.json({ error: 'Sin tienda asignada' }, { status: 403 });
    if (user.role !== 'OWNER') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

    const enabled = await isFeatureEnabled(user.storeId, FeatureFlagKey.ENABLE_SUPPLIERS);
    if (!enabled) return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });

    const { id } = await params;

    const existing = await prisma.supplier.findFirst({
      where: { id, storeId: user.storeId },
    });
    if (!existing) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });

    // Verificar si tiene órdenes de compra
    const ordersCount = await prisma.purchaseOrder.count({
      where: { supplierId: id },
    });
    if (ordersCount > 0) {
      // Soft delete si tiene órdenes
      await prisma.supplier.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ message: 'Proveedor desactivado (tiene órdenes asociadas)' });
    }

    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ message: 'Proveedor eliminado' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({ error: 'Error al eliminar proveedor' }, { status: 500 });
  }
}
