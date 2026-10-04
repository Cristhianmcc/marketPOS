import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processSunatJob } from '@/lib/sunat/process/processSunatJob';
import { SUNAT_ENDPOINTS, type SunatEnvironment } from '@/lib/sunat/config/endpoints';

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

async function canReachSunat(env: SunatEnvironment): Promise<boolean> {
  try {
    // Cualquier respuesta HTTP demuestra conectividad con el host. No se envía
    // contenido fiscal ni credenciales en esta comprobación.
    await fetch(SUNAT_ENDPOINTS[env].billService, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!hasValidDesktopToken(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const jobs = await prisma.sunatJob.findMany({
    where: {
      status: 'QUEUED',
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
      AND: [{
        OR: [
          { type: 'SEND_CPE', document: { status: 'SIGNED', sunatSettings: { enabled: true } } },
          { type: 'SEND_SUMMARY', document: { status: 'SIGNED', sunatSettings: { enabled: true } } },
          { type: 'QUERY_TICKET', document: { status: 'SENT', sunatSettings: { enabled: true } } },
          { type: 'LOCAL_CANCEL', document: { status: 'ACCEPTED' } },
        ],
      }],
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: {
      id: true,
      type: true,
      document: { select: { sunatSettings: { select: { env: true } } } },
    },
  });

  const results = [];
  const reachability = new Map<SunatEnvironment, boolean>();
  for (const job of jobs) {
    if (job.type !== 'LOCAL_CANCEL') {
      const env = job.document.sunatSettings.env as SunatEnvironment;
      if (!reachability.has(env)) reachability.set(env, await canReachSunat(env));
      if (!reachability.get(env)) {
        results.push({
          success: false,
          jobId: job.id,
          skipped: true,
          message: `SUNAT ${env} no está accesible; el trabajo permanece en cola`,
        });
        continue;
      }
    }
    results.push(await processSunatJob(job.id));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
