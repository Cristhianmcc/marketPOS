import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processSunatJob } from '@/lib/sunat/process/processSunatJob';

export const dynamic = 'force-dynamic';

function hasValidDesktopToken(req: NextRequest): boolean {
  const expected = process.env.DESKTOP_INTERNAL_TOKEN;
  const received = req.headers.get('x-desktop-internal-token');
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(req: NextRequest) {
  if (!hasValidDesktopToken(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const jobs = await prisma.sunatJob.findMany({
    where: {
      type: 'SEND_CPE',
      status: 'QUEUED',
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
      document: {
        status: 'SIGNED',
        sunatSettings: { env: 'BETA', enabled: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { id: true },
  });

  const results = [];
  for (const job of jobs) {
    results.push(await processSunatJob(job.id));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
