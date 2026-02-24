/**
 * S3 Client for Cloud Backups
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * Compatible con:
 * - AWS S3
 * - Cloudflare R2
 * - Backblaze B2
 * - MinIO
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================================
// CONFIGURATION
// ============================================================================

const S3_ENABLED = !!(
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET
);

const s3Config = {
  endpoint: process.env.S3_ENDPOINT || undefined, // undefined = AWS S3 default
  region: process.env.S3_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET || 'marketpos-backups',
  maxUploadMb: parseInt(process.env.BACKUP_UPLOAD_MAX_MB || '50', 10),
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS_DEFAULT || '30', 10),
};

// Create S3 client singleton
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!S3_ENABLED) {
      throw new Error('S3 no está configurado. Verifica las variables de entorno.');
    }
    
    s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      // Cloudflare R2 y otros requieren forcePathStyle
      forcePathStyle: !!s3Config.endpoint,
    });
  }
  
  return s3Client;
}

// ============================================================================
// PRESIGNED URL GENERATORS
// ============================================================================

/**
 * Generar URL firmada para subir un archivo
 * @param objectKey - Ruta del objeto en el bucket (ej: backups/store123/2024/01/15/backup.zip)
 * @param contentType - Tipo MIME del archivo
 * @param expiresInSeconds - Segundos antes de que expire la URL (default: 600 = 10 min)
 */
export async function generatePresignedUploadUrl(
  objectKey: string,
  contentType: string = 'application/zip',
  expiresInSeconds: number = 600
): Promise<string> {
  const client = getS3Client();
  
  const command = new PutObjectCommand({
    Bucket: s3Config.bucket,
    Key: objectKey,
    ContentType: contentType,
  });
  
  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generar URL firmada para descargar un archivo
 * @param objectKey - Ruta del objeto en el bucket
 * @param expiresInSeconds - Segundos antes de que expire la URL (default: 600 = 10 min)
 */
export async function generatePresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds: number = 600
): Promise<string> {
  const client = getS3Client();
  
  const command = new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: objectKey,
  });
  
  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ============================================================================
// OBJECT OPERATIONS
// ============================================================================

/**
 * Verificar si un objeto existe en S3
 */
export async function objectExists(objectKey: string): Promise<boolean> {
  try {
    const client = getS3Client();
    
    await client.send(new HeadObjectCommand({
      Bucket: s3Config.bucket,
      Key: objectKey,
    }));
    
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Eliminar un objeto de S3
 */
export async function deleteObject(objectKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getS3Client();
    
    await client.send(new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: objectKey,
    }));
    
    return { success: true };
  } catch (error: any) {
    console.error('[S3] Error deleting object:', objectKey, error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generar objectKey para un backup
 * Formato: backups/{storeId}/{YYYY}/{MM}/{DD}/{filename}
 */
export function generateBackupObjectKey(storeId: string, filename: string, date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `backups/${storeId}/${year}/${month}/${day}/${filename}`;
}

/**
 * Verificar si S3 está habilitado
 */
export function isS3Enabled(): boolean {
  return S3_ENABLED;
}

/**
 * Obtener configuración de S3 (sin secretos)
 */
export function getS3Config() {
  return {
    enabled: S3_ENABLED,
    bucket: s3Config.bucket,
    region: s3Config.region,
    hasEndpoint: !!s3Config.endpoint,
    maxUploadMb: s3Config.maxUploadMb,
    retentionDays: s3Config.retentionDays,
  };
}

/**
 * Validar tamaño de archivo
 */
export function validateBackupSize(sizeBytes: number): { valid: boolean; error?: string } {
  const maxBytes = s3Config.maxUploadMb * 1024 * 1024;
  
  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      error: `El archivo excede el tamaño máximo permitido (${s3Config.maxUploadMb} MB)`,
    };
  }
  
  return { valid: true };
}
