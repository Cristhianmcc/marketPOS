/**
 * MÓDULO 18.4 — SUNAT WORKER
 * 
 * Worker que procesa jobs de SUNAT de forma asíncrona.
 * Se ejecuta como proceso separado (Background Worker en Render).
 * 
 * IMPORTANTE:
 * - NO bloquea el checkout ni la aplicación principal
 * - Procesa jobs en cola con reintentos y backoff
 * - Maneja múltiples jobs en paralelo (con límite)
 * - Logs mínimos sin secretos
 */

import { PrismaClient } from '@prisma/client';
import { processSunatJob } from '../lib/sunat/process/processSunatJob';

const prisma = new PrismaClient();

// Configuración
const POLL_INTERVAL = 10000; // 10 segundos
const MAX_CONCURRENT_JOBS = 3; // Procesar 3 jobs en paralelo
const WORKER_NAME = `sunat-worker-${process.pid}`;

let isRunning = true;
let activeJobs = 0;

/**
 * Loop principal del worker.
 */
async function workerLoop() {
  console.log(`[${WORKER_NAME}] 🚀 SUNAT Worker iniciado`);
  console.log(`[${WORKER_NAME}] ⏱️  Polling cada ${POLL_INTERVAL / 1000}s`);
  console.log(`[${WORKER_NAME}] 🔄 Max ${MAX_CONCURRENT_JOBS} jobs concurrentes\n`);

  while (isRunning) {
    try {
      await processAvailableJobs();
    } catch (error: any) {
      console.error(`[${WORKER_NAME}] ❌ Error en loop:`, error.message);
    }

    // Esperar antes del siguiente ciclo
    await sleep(POLL_INTERVAL);
  }

  console.log(`[${WORKER_NAME}] 🛑 Worker detenido`);
}

/**
 * Procesa todos los jobs disponibles (hasta el límite de concurrencia).
 */
async function processAvailableJobs() {
  // No buscar más jobs si ya estamos en el límite
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return;
  }

  // Buscar jobs QUEUED listos para procesar
  const availableSlots = MAX_CONCURRENT_JOBS - activeJobs;
  const jobs = await findReadyJobs(availableSlots);

  if (jobs.length === 0) {
    // No hay jobs pendientes
    return;
  }

  console.log(`[${WORKER_NAME}] 📋 ${jobs.length} job(s) encontrado(s)`);

  // Procesar cada job (en paralelo pero con límite)
  const promises = jobs.map(job => processJobSafely(job.id));
  
  await Promise.allSettled(promises);
}

/**
 * Busca jobs QUEUED que estén listos para ejecutar.
 * 
 * @param limit - Número máximo de jobs a devolver
 * @returns Lista de jobs listos para procesar
 */
async function findReadyJobs(limit: number) {
  const now = new Date();

  return await prisma.sunatJob.findMany({
    where: {
      status: 'QUEUED',
      nextRunAt: {
        lte: now, // nextRunAt <= ahora
      },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } }, // Lock expirado (>5 min)
      ],
    },
    orderBy: {
      nextRunAt: 'asc', // Más antiguos primero
    },
    take: limit,
  });
}

/**
 * Procesa un job de forma segura (con manejo de errores).
 * 
 * @param jobId - ID del job a procesar
 */
async function processJobSafely(jobId: string) {
  activeJobs++;
  
  const startTime = Date.now();
  console.log(`[${WORKER_NAME}] ▶️  Procesando job ${jobId.slice(0, 8)}...`);

  try {
    const result = await processSunatJob(jobId);
    
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`[${WORKER_NAME}] ✅ Job ${jobId.slice(0, 8)} completado en ${duration}ms`);
      console.log(`   → ${result.message}`);
    } else {
      console.log(`[${WORKER_NAME}] ⚠️  Job ${jobId.slice(0, 8)} falló: ${result.message}`);
      
      if (result.shouldRetry) {
        console.log(`   → Se reintentará automáticamente`);
      }
    }

  } catch (error: any) {
    console.error(`[${WORKER_NAME}] ❌ Error procesando job ${jobId.slice(0, 8)}:`, error.message);
  } finally {
    activeJobs--;
  }
}

/**
 * Promesa que espera N milisegundos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Manejo de señales para shutdown graceful.
 */
function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\n[${WORKER_NAME}] 📡 Señal ${signal} recibida`);
    console.log(`[${WORKER_NAME}] 🛑 Deteniendo worker...`);
    
    isRunning = false;

    // Esperar a que terminen los jobs activos
    const maxWait = 30000; // 30 segundos máximo
    const checkInterval = 1000; // Revisar cada segundo
    let waited = 0;

    while (activeJobs > 0 && waited < maxWait) {
      console.log(`[${WORKER_NAME}] ⏳ Esperando ${activeJobs} job(s) activo(s)...`);
      await sleep(checkInterval);
      waited += checkInterval;
    }

    if (activeJobs > 0) {
      console.log(`[${WORKER_NAME}] ⚠️  Timeout: ${activeJobs} job(s) aún activo(s)`);
    } else {
      console.log(`[${WORKER_NAME}] ✅ Todos los jobs completados`);
    }

    await prisma.$disconnect();
    console.log(`[${WORKER_NAME}] 👋 Worker cerrado\n`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Health check periódico (logs cada 1 minuto).
 */
async function startHealthCheck() {
  setInterval(async () => {
    try {
      const stats = await getJobStats();
      console.log(`[${WORKER_NAME}] 💚 Health check:`);
      console.log(`   → Jobs activos: ${activeJobs}/${MAX_CONCURRENT_JOBS}`);
      console.log(`   → QUEUED: ${stats.queued}, DONE: ${stats.done}, FAILED: ${stats.failed}`);
    } catch (error) {
      console.error(`[${WORKER_NAME}] ❌ Error en health check:`, error);
    }
  }, 60000); // Cada 1 minuto
}

/**
 * Obtiene estadísticas de los jobs.
 */
async function getJobStats() {
  const [queued, done, failed] = await Promise.all([
    prisma.sunatJob.count({ where: { status: 'QUEUED' } }),
    prisma.sunatJob.count({ where: { status: 'DONE' } }),
    prisma.sunatJob.count({ where: { status: 'FAILED' } }),
  ]);

  return { queued, done, failed };
}

/**
 * Punto de entrada del worker.
 */
async function main() {
  try {
    // Verificar conexión a la base de datos
    await prisma.$connect();
    console.log(`[${WORKER_NAME}] ✅ Conectado a la base de datos\n`);

    // Configurar shutdown graceful
    setupGracefulShutdown();

    // Iniciar health check
    startHealthCheck();

    // Iniciar loop principal
    await workerLoop();

  } catch (error: any) {
    console.error(`[${WORKER_NAME}] ❌ Error fatal:`, error.message);
    process.exit(1);
  }
}

// Iniciar worker
main();
