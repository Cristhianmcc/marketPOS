/**
 * API: Cloud Backups - Request Upload
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * POST /api/cloud-backups/request-upload
 * 
 * Genera una presigned URL para subir un backup a S3.
 * Solo SUPERADMIN puede usar este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { 
  generatePresignedUploadUrl, 
  generateBackupObjectKey, 
  isS3Enabled, 
  validateBackupSize 
} from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

interface RequestUploadBody {
  storeId: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  exportedAt: string;
  version: string;
  appVersion: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    // Verificar que S3 está configurado
    if (!isS3Enabled()) {
      return NextResponse.json(
        { code: 'S3_NOT_CONFIGURED', message: 'Almacenamiento en nube no configurado' },
        { status: 503 }
      );
    }

    const body: RequestUploadBody = await request.json();
    const { storeId, filename, sizeBytes, sha256, exportedAt, version, appVersion } = body;

    // Validaciones básicas
    if (!storeId || !filename || !sizeBytes || !sha256 || !exportedAt || !version) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    // Validar formato SHA256
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return NextResponse.json(
        { code: 'INVALID_SHA256', message: 'Formato de SHA256 inválido' },
        { status: 400 }
      );
    }

    // Validar tamaño
    const sizeValidation = validateBackupSize(sizeBytes);
    if (!sizeValidation.valid) {
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: sizeValidation.error },
        { status: 413 }
      );
    }

    // Verificar que el store existe
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });

    if (!store) {
      return NextResponse.json(
        { code: 'STORE_NOT_FOUND', message: 'Tienda no encontrada' },
        { status: 404 }
      );
    }

    // Verificar duplicados (mismo sha256 para el mismo store)
    const existingBackup = await prisma.cloudBackup.findFirst({
      where: {
        storeId,
        sha256,
        status: 'AVAILABLE',
      },
      select: { id: true },
    });

    if (existingBackup) {
      return NextResponse.json(
        { 
          code: 'BACKUP_ALREADY_EXISTS', 
          message: 'Este backup ya existe en la nube',
          backupId: existingBackup.id,
        },
        { status: 409 }
      );
    }

    // Obtener user ID para auditoría
    const user = await prisma.user.findFirst({
      where: { email: session.email },
      select: { id: true },
    });

    // Generar objectKey
    const exportDate = new Date(exportedAt);
    const objectKey = generateBackupObjectKey(storeId, filename, exportDate);

    // Crear registro CloudBackup con status UPLOADING
    const cloudBackup = await prisma.cloudBackup.create({
      data: {
        storeId,
        exportedAt: exportDate,
        version,
        appVersion: appVersion || 'unknown',
        sizeBytes,
        sha256,
        objectKey,
        status: 'UPLOADING',
        uploadedByUserId: user?.id,
      },
    });

    // Generar presigned URL para upload (válido 10 minutos)
    const uploadUrl = await generatePresignedUploadUrl(objectKey, 'application/zip', 600);

    // Auditoría
    await logAudit({
      storeId,
      userId: user?.id,
      action: 'CLOUD_BACKUP_UPLOAD_REQUESTED',
      entityType: 'SYSTEM',
      entityId: cloudBackup.id,
      meta: {
        filename,
        sizeBytes,
        sha256: sha256.substring(0, 16) + '...', // No loguear completo
        objectKey,
      },
    });

    return NextResponse.json({
      success: true,
      backupId: cloudBackup.id,
      uploadUrl,
      objectKey,
    });
  } catch (error) {
    console.error('[CloudBackup] Error requesting upload:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al solicitar subida' },
      { status: 500 }
    );
  }
}
