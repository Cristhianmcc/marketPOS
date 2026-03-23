import { CatalogPageClient } from '@/components/catalog/CatalogPageClient';
import { getPublicCatalogBySlug } from '@/lib/catalog-api';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

interface CatalogPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CatalogPage(props: CatalogPageProps) {
  const params = await props.params;
  const headerList = await headers();
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  try {
    const data = await getPublicCatalogBySlug(params.slug, origin);
    return <CatalogPageClient store={data.store} products={data.products} />;
  } catch (error) {
    const err = error as Error & { status?: number };
    const message = err?.message?.toLowerCase?.() ?? '';
    if (err?.status === 404 || message.includes('no encontrado')) {
      notFound();
    }
    throw error;
  }
}
