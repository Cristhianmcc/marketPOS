/**
 * POST /api/perfumery/import/zip (OWNER, solo escritorio)
 * Cuerpo: el ZIP (application/zip) con `catalogo.json` (formato del importador
 * o del exportador) e `imagenes/` con las fotos referenciadas como
 * "imagenes/<archivo>". Opciones en la URL: useDefaultPresentations,
 * initialStockMl, initialContainerStock, updateExisting (1/0).
 *
 * Las fotos se guardan en la PC (como la importación ZIP de inventario) y la
 * fragancia queda con su URL local, así se ven sin internet. Solo se guardan
 * las fotos de fragancias que se crean o, con updateExisting, se actualizan.
 */
import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { normalizeCode } from '@/lib/perfumery/catalog';
import { runPerfumeryImport } from '@/lib/perfumery/importRequest';
import { isAllowedImageName, LocalImageStore } from '@/lib/perfumery/localImages';

export const runtime = 'nodejs';

const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;
  if (process.env.DESKTOP_MODE !== 'true') {
    return NextResponse.json({ error: 'El ZIP con fotos se importa desde la app de escritorio' }, { status: 400 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: 'El ZIP supera 200 MB' }, { status: 400 });
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(Buffer.from(await request.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: 'El archivo no es un ZIP válido' }, { status: 400 });
  }
  const catalogEntry = zip.getEntries().find((entry) => !entry.isDirectory && /(^|\/)catalogo\.json$/i.test(entry.entryName));
  if (!catalogEntry) return NextResponse.json({ error: 'El ZIP no tiene catalogo.json' }, { status: 400 });

  let catalog: Record<string, unknown>;
  try {
    catalog = JSON.parse(catalogEntry.getData().toString('utf8').replace(/^﻿/, ''));
  } catch {
    return NextResponse.json({ error: 'catalogo.json no es un JSON válido' }, { status: 400 });
  }
  const fragrances = Array.isArray(catalog.fragrances) ? (catalog.fragrances as Record<string, unknown>[]) : [];

  const params = request.nextUrl.searchParams;
  const flag = (name: string) => params.get(name) === '1' || params.get(name) === 'true';
  const updateExisting = flag('updateExisting');

  // Fotos: solo para fragancias nuevas, o existentes si se actualizan.
  const existing = new Set(
    (await prisma.fragrance.findMany({ where: { storeId: session.storeId }, select: { code: true } })).map((f) => f.code)
  );
  const images = new Map(
    zip.getEntries()
      .filter((entry) => !entry.isDirectory && /(^|\/)imagenes\//i.test(entry.entryName) && isAllowedImageName(entry.name))
      .map((entry) => [entry.name.toLowerCase(), entry])
  );
  const store = new LocalImageStore();
  let imagesSaved = 0;
  for (const fragrance of fragrances) {
    const image = typeof fragrance.imageUrl === 'string' ? fragrance.imageUrl : '';
    if (!/^imagenes\//i.test(image)) continue;
    const entry = images.get(image.replace(/^imagenes\//i, '').toLowerCase());
    fragrance.imageUrl = null;
    if (!entry || entry.header.size > MAX_IMAGE_BYTES) continue;
    if (existing.has(normalizeCode(fragrance.code)) && !updateExisting) continue;
    fragrance.imageUrl = store.save(entry.getData(), entry.name);
    imagesSaved++;
  }
  if (imagesSaved) store.flush();

  return runPerfumeryImport(
    session,
    {
      fragrances,
      presentations: catalog.presentations,
      extras: catalog.extras,
      packs: catalog.packs,
      useDefaultPresentations: flag('useDefaultPresentations'),
      initialStockMl: params.get('initialStockMl'),
      initialContainerStock: params.get('initialContainerStock'),
      updateExisting,
    },
    { imagesSaved }
  );
}
