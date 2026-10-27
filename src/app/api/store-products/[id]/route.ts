import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { syncProductToCatalog } from '@/lib/catalogSync';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Solo el propietario puede editar productos' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await req.json();
    const { 
      name, brand, content, barcode, category, price, costPrice, minStock, imageUrl, baseUnitId,
      publishInCatalog, igvAffectation, icbper,
      // ✅ MÓDULO PH1: Campos farmacéuticos
      commercialName, genericName, concentration, pharmaceuticalForm,
      presentation, laboratory, sanitaryRegistry, requiresPrescription,
      medicineCategory, barcodeSecondary,
    } = body;

    // Verificar que el storeProduct pertenece a esta tienda
    const storeProduct = await prisma.storeProduct.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!storeProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    if (storeProduct.storeId !== user.storeId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Validaciones básicas
    if (price !== undefined && (isNaN(Number(price)) || Number(price) <= 0)) {
      return NextResponse.json({ error: 'El precio debe ser mayor a 0' }, { status: 400 });
    }
    if (igvAffectation !== undefined && !['GRAVADO', 'EXONERADO', 'INAFECTO'].includes(igvAffectation)) {
      return NextResponse.json({ error: 'Tipo de IGV inválido' }, { status: 400 });
    }
    if (icbper !== undefined && typeof icbper !== 'boolean') {
      return NextResponse.json({ error: 'Valor de bolsa plástica inválido' }, { status: 400 });
    }

    // Actualizar campos del producto maestro (solo si no es global)
    if (!storeProduct.product.isGlobal) {
      const productUpdates: Record<string, string | boolean | null> = {};
      if (name !== undefined)       productUpdates.name       = String(name).trim();
      if (brand !== undefined)      productUpdates.brand      = brand ? String(brand).trim() : null;
      if (content !== undefined)    productUpdates.content    = content ? String(content).trim() : null;
      if (barcode !== undefined) {
        const newBarcode = barcode ? String(barcode).trim() : null;
        // Verificar que el nuevo barcode no esté usado por otro producto
        if (newBarcode && newBarcode !== storeProduct.product.barcode) {
          const conflict = await prisma.productMaster.findUnique({ where: { barcode: newBarcode } });
          if (conflict) {
            return NextResponse.json(
              { error: 'Ya existe otro producto con ese código de barras' },
              { status: 400 }
            );
          }
        }
        productUpdates.barcode = newBarcode;
      }
      if (category !== undefined)   productUpdates.category   = String(category).trim();
      if (imageUrl !== undefined)   productUpdates.imageUrl   = imageUrl || null;
      if (baseUnitId !== undefined) productUpdates.baseUnitId = baseUnitId || null;
      // ✅ MÓDULO PH1: Campos farmacéuticos
      if (commercialName !== undefined)     productUpdates.commercialName     = commercialName || null;
      if (genericName !== undefined)        productUpdates.genericName        = genericName || null;
      if (concentration !== undefined)      productUpdates.concentration      = concentration || null;
      if (pharmaceuticalForm !== undefined) productUpdates.pharmaceuticalForm = pharmaceuticalForm || null;
      if (presentation !== undefined)       productUpdates.presentation       = presentation || null;
      if (laboratory !== undefined)         productUpdates.laboratory         = laboratory || null;
      if (sanitaryRegistry !== undefined)   productUpdates.sanitaryRegistry   = sanitaryRegistry || null;
      if (requiresPrescription !== undefined) productUpdates.requiresPrescription = Boolean(requiresPrescription);
      if (medicineCategory !== undefined)   productUpdates.medicineCategory   = medicineCategory || null;
      if (barcodeSecondary !== undefined)   productUpdates.barcodeSecondary   = barcodeSecondary || null;

      if (Object.keys(productUpdates).length > 0) {
        await prisma.productMaster.update({
          where: { id: storeProduct.productId },
          data: productUpdates,
        });
      }
    }

    // Actualizar campos del storeProduct
    const spUpdates: any = {};
    if (price !== undefined)     spUpdates.price     = Number(price);
    if (costPrice !== undefined) spUpdates.costPrice = costPrice !== null && costPrice !== '' ? Number(costPrice) : null;
    if (minStock !== undefined)  spUpdates.minStock  = minStock !== '' && minStock !== null ? Number(minStock) : null;
    // Tributos: rigen para ventas nuevas; las anteriores conservan su snapshot.
    if (igvAffectation !== undefined) spUpdates.igvAffectation = igvAffectation;
    if (icbper !== undefined)         spUpdates.icbper         = icbper;

    if (publishInCatalog !== undefined) {
      const isPublished = Boolean(publishInCatalog);
      spUpdates.publishInCatalog = isPublished;
      spUpdates.catalogVisible = isPublished;

      if (isPublished) {
        spUpdates.catalogTitle = (name !== undefined ? String(name).trim() : storeProduct.product.name) || '';
        spUpdates.catalogCategory = (category !== undefined ? String(category).trim() : storeProduct.product.category) || 'Otros';
        spUpdates.catalogImagePath = imageUrl !== undefined ? imageUrl : storeProduct.product.imageUrl;
        spUpdates.catalogUpdatedAt = new Date();
      }
    }

    const updated = await prisma.storeProduct.update({
      where: { id },
      data: spUpdates,
      include: { product: true },
    });

    // Sincronizar cambios al catálogo cloud en segundo plano (solo productos locales)
    if (!storeProduct.product.isGlobal) {
      syncProductToCatalog({
        name: updated.product.name,
        brand: updated.product.brand,
        content: updated.product.content,
        category: updated.product.category,
        barcode: updated.product.barcode,
        imageUrl: updated.product.imageUrl,
        unitType: updated.product.unitType,
        sourceStoreId: user.storeId,
      });
    }

    return NextResponse.json({ storeProduct: updated });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Error al actualizar producto' },
      { status: 500 }
    );
  }
}
