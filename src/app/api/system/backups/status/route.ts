// GET /api/system/backups/status
// ✅ MÓDULO 16.2: Estado de Backups

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede ver estado de backups
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos para ver el estado de backups' },
        { status: 403 }
      );
    }

    // Directorio de backups
    const backupsDir = path.join(process.cwd(), 'backups');

    let totalBackups = 0;
    let lastBackupAt: string | null = null;
    let lastBackupFile: string | null = null;

    try {
      // Verificar si el directorio existe primero
      await fs.access(backupsDir);
      
      // Intentar leer el directorio de backups
      const files = await fs.readdir(backupsDir);
      const backupFiles = files.filter(f => f.endsWith('.zip'));
      totalBackups = backupFiles.length;

      // Obtener el backup más reciente
      if (backupFiles.length > 0) {
        const backupStats = await Promise.all(
          backupFiles.map(async file => {
            const filePath = path.join(backupsDir, file);
            const stats = await fs.stat(filePath);
            return { file, mtime: stats.mtime };
          })
        );

        // Ordenar por fecha (más reciente primero)
        backupStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        
        lastBackupAt = backupStats[0].mtime.toISOString();
        lastBackupFile = backupStats[0].file;
      }
    } catch (error: any) {
      // Si el directorio no existe, crear silenciosamente
      if (error.code === 'ENOENT') {
        try {
          await fs.mkdir(backupsDir, { recursive: true });
          console.log('[Backups Status] Created backups directory:', backupsDir);
        } catch (mkdirError) {
          console.error('[Backups Status] Error creating backups directory:', mkdirError);
        }
      } else {
        console.warn('[Backups Status] Error reading backups directory:', error);
      }
      // Continuar con valores por defecto (0 backups)
    }

    return NextResponse.json({
      totalBackups,
      lastBackup: {
        timestamp: lastBackupAt,
        size: null, // No calculamos el tamaño por ahora
      },
      canRestore: session.role === 'OWNER', // Solo OWNER puede restaurar
    });
  } catch (error) {
    console.error('[Backups Status] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al obtener estado de backups' },
      { status: 500 }
    );
  }
}
