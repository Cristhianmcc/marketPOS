import { NextRequest, NextResponse } from 'next/server';
import * as path from 'node:path';
import { CatalogController } from '@/modules/catalog/backend/controllers/catalog.controller';
import { CatalogMediaService } from '@/modules/catalog/backend/services/catalog-media.service';
import { isCatalogApiAuthorized } from '@/modules/catalog/backend/routes/catalog-auth';
import { CatalogUnpublishPayloadSchema } from '@/modules/catalog/backend/routes/catalog.schemas';

export const runtime = 'nodejs';

function createCatalogController(req: NextRequest): CatalogController {
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'catalog');
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
  const publicCatalogBaseUrl = process.env.PUBLIC_CATALOG_BASE_URL || publicBaseUrl;
  const mediaService = new CatalogMediaService(uploadDir, publicBaseUrl);
  return new CatalogController(mediaService, publicCatalogBaseUrl);
}

export async function POST(req: NextRequest) {
  try {
    if (!isCatalogApiAuthorized(req)) {
      return NextResponse.json(
        { success: false, message: 'API key invalida.' },
        { status: 401 },
      );
    }

    const body = await req.json();
    const validation = CatalogUnpublishPayloadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Payload invalido.', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const controller = createCatalogController(req);
    const result = await controller.unpublish(validation.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error despublicando catalogo.',
      },
      { status: 400 },
    );
  }
}
