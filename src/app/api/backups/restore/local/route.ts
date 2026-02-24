// POST /api/backups/restore/local
// Endpoint para restaurar backup desde desktop app
// Este es un endpoint simplificado que delega al endpoint new-store existente

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import crypto from 'crypto';
import { logAudit, getRequestMetadata } from '@/lib/auditLog';

interface BackupMetadata {
  version: string;
  exportedAt: string;
  appVersion: string;
  store: {
    name: string;
    ruc?: string;
    address?: string;
    phone?: string;
  };
  checksum: string;
  trigger?: 'manual' | 'shift-close' | 'scheduled';
}

interface RestoreRequest {
  metadata: BackupMetadata;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session.userId) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede restaurar
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo OWNER puede restaurar backups' },
        { status: 403 }
      );
    }

    // Verificar que es entorno desktop
    const isDesktop = request.headers.get('x-desktop-app') === 'true' || 
                      process.env.DESKTOP_MODE === 'true';
    
    if (!isDesktop) {
      return NextResponse.json(
        { code: 'NOT_DESKTOP', message: 'Este endpoint solo está disponible en modo desktop' },
        { status: 400 }
      );
    }

    const body: RestoreRequest = await request.json();
    const { metadata, data } = body;

    // Verificar checksum
    const dataContent = JSON.stringify(data, null, 2);
    const calculatedChecksum = crypto.createHash('sha256').update(dataContent, 'utf8').digest('hex');
    
    if (metadata.checksum !== `sha256:${calculatedChecksum}`) {
      return NextResponse.json(
        { code: 'CHECKSUM_MISMATCH', message: 'Checksum inválido - datos corruptos' },
        { status: 400 }
      );
    }

    // Por ahora, la restauración local está en modo de validación solamente
    // La restauración completa requiere usar el endpoint new-store o implementar
    // un mapping completo de datos que sea compatible con todas las versiones del esquema
    
    // Log de auditoría
    const { ip, userAgent } = getRequestMetadata(request);
    await logAudit({
      storeId: session.storeId,
      userId: session.userId,
      action: 'BACKUP_RESTORE_VALIDATED',
      entityType: 'STORE',
      entityId: session.storeId,
      severity: 'INFO',
      meta: {
        backupDate: metadata.exportedAt,
        backupVersion: metadata.version,
        trigger: metadata.trigger,
        storeName: metadata.store.name,
        validationOnly: true,
      },
      ip,
      userAgent,
    });

    // Retornar éxito de validación
    // TODO: Implementar restauración completa de datos
    return NextResponse.json({
      success: true,
      message: 'Backup validado exitosamente. Restauración pendiente de implementación.',
      validatedAt: new Date().toISOString(),
      backupInfo: {
        exportedAt: metadata.exportedAt,
        storeName: metadata.store.name,
        version: metadata.version,
      },
      note: 'Para restaurar datos completos, use la función de importación desde Configuración > Backups',
    });
  } catch (error) {
    console.error('Error validating backup:', error);
    return NextResponse.json(
      { 
        code: 'VALIDATION_ERROR', 
        message: 'Error al validar backup',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
