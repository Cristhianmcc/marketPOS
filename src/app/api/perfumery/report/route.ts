/**
 * GET /api/perfumery/report?from=YYYY-MM-DD&to=YYYY-MM-DD (OWNER)
 * Consumo y margen de la sede: ml por fragancia, frascos por presentación,
 * envases, extras, packs y lo que hay que reponer (con días de cobertura).
 * Ventas anuladas (total y subtotal en 0) y demo no cuentan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { getPerfumerySession } from '@/lib/perfumery/access';
import { notCancelledSale } from '@/lib/perfumery/customerHistory';
import { readPerfumeDetail } from '@/lib/perfumery/saleLine';

const DAY = 24 * 60 * 60 * 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;
const isDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

type Row = { key: string; name: string; bottles: number; ml: number; revenue: number; cost: number; costKnown: boolean };
type RowDelta = { bottles?: number; ml?: number; revenue?: number; cost?: number | null };

export async function GET(request: NextRequest) {
  const { session, error } = await getPerfumerySession({ ownerOnly: true });
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if ((from && !isDate(from)) || (to && !isDate(to))) {
    return NextResponse.json({ error: 'Fechas inválidas (AAAA-MM-DD)' }, { status: 400 });
  }
  // Perú: UTC-5 sin horario de verano.
  const toDate = to ? new Date(`${to}T23:59:59.999-05:00`) : new Date();
  const fromDate = from ? new Date(`${from}T00:00:00.000-05:00`) : new Date(toDate.getTime() - 30 * DAY);
  if (fromDate > toDate) return NextResponse.json({ error: 'La fecha inicial es posterior a la final' }, { status: 400 });
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / DAY));

  const [items, fragrances, stockProducts] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        sale: { storeId: session.storeId, isDemo: false, createdAt: { gte: fromDate, lte: toDate }, ...notCancelledSale },
        NOT: { perfumeDetail: { equals: Prisma.AnyNull } },
      },
      select: { saleId: true, storeProductId: true, productName: true, quantity: true, totalLine: true, perfumeDetail: true },
    }),
    prisma.fragrance.findMany({
      where: { storeId: session.storeId },
      select: {
        code: true, reference: true, referenceBrand: true, active: true,
        storeProduct: { select: { id: true, stock: true, minStock: true } },
      },
    }),
    // Envases, feromonas y regalos de la sede (para reponer).
    prisma.storeProduct.findMany({
      where: {
        storeId: session.storeId,
        active: true,
        OR: [{ perfumeContainerOf: { some: {} } }, { perfumeExtraOf: { some: {} } }, { perfumePackGiftOf: { some: {} } }],
      },
      select: { id: true, stock: true, minStock: true, product: { select: { name: true } } },
    }),
  ]);

  const bump = (map: Map<string, Row>, key: string, name: string, delta: RowDelta) => {
    const row = map.get(key) ?? { key, name, bottles: 0, ml: 0, revenue: 0, cost: 0, costKnown: true };
    row.bottles += delta.bottles ?? 0;
    row.ml += delta.ml ?? 0;
    row.revenue += delta.revenue ?? 0;
    if (delta.cost === null) row.costKnown = false;
    else row.cost += delta.cost ?? 0;
    map.set(key, row);
  };

  const byFragrance = new Map<string, Row>();
  const byPresentation = new Map<string, Row>();
  const containers = new Map<string, Row>();
  const extras = new Map<string, Row>();
  const packs = new Map<string, Row>();
  const sales = new Set<string>();
  let refills = 0;
  let refillOverrides = 0;
  let promoBottles = 0;

  for (const item of items) {
    const detail = readPerfumeDetail(item.perfumeDetail);
    if (!detail) continue;
    sales.add(item.saleId);
    const ml = Number(item.quantity);
    const revenue = Number(item.totalLine);
    const cost = detail.costTotal;
    bump(byFragrance, item.storeProductId ?? detail.fragranceCode, detail.fragranceCode, { bottles: detail.bottles, ml, revenue, cost });
    bump(byPresentation, detail.presentationId, detail.presentationName, { bottles: detail.bottles, ml, revenue, cost });
    if (detail.containerStoreProductId) {
      bump(containers, detail.containerStoreProductId, detail.containerName ?? detail.presentationName, { bottles: detail.containerQty });
    }
    for (const extra of detail.extras) {
      bump(extras, extra.id, extra.name, { bottles: detail.bottles, revenue: extra.price * detail.bottles, ml: (extra.extraEssenceMl ?? 0) * detail.bottles });
    }
    if (detail.pack && detail.pack.index === 0) {
      bump(packs, detail.pack.id, detail.pack.name, { bottles: detail.bottles });
    }
    if (detail.pack) bump(packs, detail.pack.id, detail.pack.name, { revenue });
    if (detail.isRefill) refills += detail.bottles;
    if (detail.refillOverride) refillOverrides += detail.bottles;
    if (detail.promoName) promoBottles += detail.bottles;
  }

  const finish = (map: Map<string, Row>) =>
    [...map.values()]
      .map((row) => ({
        key: row.key,
        name: row.name,
        bottles: row.bottles,
        ml: round2(row.ml),
        revenue: round2(row.revenue),
        cost: row.costKnown ? round2(row.cost) : null,
        margin: row.costKnown ? round2(row.revenue - row.cost) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.bottles - a.bottles);

  const fragranceRows = finish(byFragrance).map((row) => {
    const fragrance = fragrances.find((f) => f.storeProduct.id === row.key);
    return {
      ...row,
      reference: fragrance ? [fragrance.reference, fragrance.referenceBrand].filter(Boolean).join(' · ') : null,
      stockMl: fragrance?.storeProduct.stock?.toNumber() ?? null,
    };
  });

  // Reposición: esencias bajo el mínimo o con menos de 15 días al ritmo actual.
  const mlPerDay = new Map(fragranceRows.map((row) => [row.key, row.ml / days]));
  const restockEssences = fragrances
    .filter((f) => f.active && f.storeProduct.stock !== null)
    .map((f) => {
      const stock = f.storeProduct.stock!.toNumber();
      const min = f.storeProduct.minStock?.toNumber() ?? null;
      const rate = mlPerDay.get(f.storeProduct.id) ?? 0;
      const daysLeft = rate > 0 ? Math.floor(stock / rate) : null;
      return { code: f.code, stockMl: stock, minStockMl: min, mlPerDay: round2(rate), daysLeft };
    })
    .filter((row) => (row.minStockMl !== null && row.stockMl <= row.minStockMl) || (row.daysLeft !== null && row.daysLeft < 15))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.stockMl - b.stockMl);

  const restockItems = stockProducts
    .filter((sp) => sp.stock !== null && sp.minStock !== null && sp.stock.lte(sp.minStock))
    .map((sp) => ({ name: sp.product.name, stock: sp.stock!.toNumber(), minStock: sp.minStock!.toNumber() }))
    .sort((a, b) => a.stock - b.stock);

  const totals = fragranceRows.reduce(
    (acc, row) => ({
      bottles: acc.bottles + row.bottles,
      ml: acc.ml + row.ml,
      revenue: acc.revenue + row.revenue,
      cost: row.cost === null || acc.cost === null ? null : acc.cost + row.cost,
    }),
    { bottles: 0, ml: 0, revenue: 0, cost: 0 as number | null }
  );

  return NextResponse.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    days,
    totals: {
      sales: sales.size,
      bottles: totals.bottles,
      ml: round2(totals.ml),
      revenue: round2(totals.revenue),
      cost: totals.cost === null ? null : round2(totals.cost),
      margin: totals.cost === null ? null : round2(totals.revenue - totals.cost),
      refills,
      refillOverrides,
      promoBottles,
    },
    fragrances: fragranceRows,
    presentations: finish(byPresentation),
    containers: finish(containers).map(({ key, name, bottles }) => ({ key, name, quantity: bottles })),
    extras: finish(extras).map(({ key, name, bottles, revenue }) => ({ key, name, quantity: bottles, revenue })),
    packs: finish(packs).map(({ key, name, bottles, revenue }) => ({ key, name, quantity: bottles, revenue })),
    restock: { essences: restockEssences, items: restockItems },
  });
}
