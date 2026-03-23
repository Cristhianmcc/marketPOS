import { NextRequest, NextResponse } from 'next/server';
import * as path from 'node:path';
import { CatalogController } from '@/modules/catalog/backend/controllers/catalog.controller';
import { CatalogMediaService } from '@/modules/catalog/backend/services/catalog-media.service';

export const runtime = 'nodejs';

function createCatalogController(req: NextRequest): CatalogController {
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'catalog');
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
  const publicCatalogBaseUrl = process.env.PUBLIC_CATALOG_BASE_URL || publicBaseUrl;
  const mediaService = new CatalogMediaService(uploadDir, publicBaseUrl);
  return new CatalogController(mediaService, publicCatalogBaseUrl);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  let slug = 'unknown';
  try {
    const params = await context.params;
    slug = params.slug;
    const controller = createCatalogController(req);
    const result = await controller.getPublicCatalogBySlug(slug);
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error obteniendo catalogo publico.';
    console.error(`[Catalog API Error] Slug: ${slug}, Error:`, errorMessage);
    const status =
      errorMessage.toLowerCase().includes('no encontrado') ||
      errorMessage.toLowerCase().includes('not found')
        ? 404
        : 500;
    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
      },
      { status },
    );
  }
}
