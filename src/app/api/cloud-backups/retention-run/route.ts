/**
 * API: Cloud Backups - Retention Run (CRON)
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * POST /api/cloud-backups/retention-run
 * 
 * Elimina backups antiguos según la política de retención.
 * Protegido con X-CRON-SECRET header.
 * 
 * Llamar desde cron externo (uptimerobot, cron-job.org) o Render Cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { deleteObject, getS3Config } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

// Verificar secret del cron
function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[Retention] CRON_SECRET no configurado, endpoint deshabilitado');
    return false;
  }
  
  const headerSecret = request.headers.get('X-CRON-SECRET');
  return headerSecret === secret;
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación del cron
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'Secret inválido' },
        { status: 401 }
      );
    }

    const s3Config = getS3Config();
    const defaultRetentionDays = s3Config.retentionDays;

    // Calcular fecha límite
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - defaultRetentionDays);

    console.log(`[Retention] Ejecutando retención. Cutoff: ${cutoffDate.toISOString()}`);

    // Buscar backups AVAILABLE más antiguos que el cutoff
    const backupsToDelete = await prisma.cloudBackup.findMany({
      where: {
        status: 'AVAILABLE',
        createdAt: {
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        storeId: true,
        objectKey: true,
        sizeBytes: true,
        createdAt: true,
      },
      take: 100, // Procesar en batches para evitar timeout
    });

    console.log(`[Retention] Encontrados ${backupsToDelete.length} backups para eliminar`);

    const results = {
      total: backupsToDelete.length,
      deleted: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const backup of backupsToDelete) {
      try {
        // Eliminar de S3
        const deleteResult = await deleteObject(backup.objectKey);
        
        if (!deleteResult.success) {
          console.warn(`[Retention] Error S3 para ${backup.id}: ${deleteResult.error}`);
        }

        // Marcar como DELETED en DB
        await prisma.cloudBackup.update({
          where: { id: backup.id },
          data: { 
            status: 'DELETED',
            deletedAt: new Date(),
          },
        });

        // Auditoría
        await logAudit({
          storeId: backup.storeId,
          userId: null, // Sistema
          action: 'CLOUD_BACKUP_RETENTION_DELETED',
          entityType: 'SYSTEM',
          entityId: backup.id,
          meta: {
            objectKey: backup.objectKey,
            sizeBytes: backup.sizeBytes,
            backupAge: Math.floor((Date.now() - backup.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
            retentionDays: defaultRetentionDays,
          },
        });

        results.deleted++;
      } catch (error: any) {
        console.error(`[Retention] Error procesando ${backup.id}:`, error);
        results.failed++;
        results.errors.push(`${backup.id}: ${error.message}`);
      }
    }

    console.log(`[Retention] Completado: ${results.deleted} eliminados, ${results.failed} fallidos`);

    return NextResponse.json({
      success: true,
      message: 'Retención ejecutada',
      retentionDays: defaultRetentionDays,
      cutoffDate: cutoffDate.toISOString(),
      results,
    });
  } catch (error) {
    console.error('[Retention] Error ejecutando retención:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error en retención' },
      { status: 500 }
    );
  }
}
