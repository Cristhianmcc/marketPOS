/**
 * MÓDULO D8: Cloud Backup Sync
 * 
 * Sincroniza backups locales con la nube cuando hay internet.
 * 
 * Flujo:
 * 1. Detectar backups locales pendientes
 * 2. Verificar conexión a internet
 * 3. Para cada backup:
 *    a. Leer metadata.json del ZIP
 *    b. Solicitar presigned URL (request-upload)
 *    c. Subir archivo a S3
 *    d. Confirmar subida (confirm-upload)
 * 4. Guardar estado en cloud-sync.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

// ============================================================================
// TIPOS
// ============================================================================

type SyncStatus = 'PENDING_LOCAL' | 'UPLOADING' | 'DONE' | 'FAILED';

interface CloudSyncFileState {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  storeId: string;
  exportedAt: string;
  version: string;
  appVersion: string;
  status: SyncStatus;
  cloudBackupId?: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

interface CloudSyncState {
  files: CloudSyncFileState[];
  lastSyncAt?: string;
  lastSyncResult?: 'success' | 'partial' | 'failed';
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// CLOUD BACKUP SYNC CLASS
// ============================================================================

export class CloudBackupSync {
  private statePath: string;
  private state: CloudSyncState;
  private cloudApiUrl: string;
  private authCookie: string | null = null;
  private isSyncing: boolean = false;
  private syncIntervalMs: number = 15 * 60 * 1000; // 15 minutos
  private intervalTimer: NodeJS.Timeout | null = null;
  private maxRetries: number = 10;
  private retryDelays: number[] = [60000, 300000, 900000, 3600000]; // 1m, 5m, 15m, 60m

  constructor(cloudApiUrl: string) {
    this.cloudApiUrl = cloudApiUrl;
    this.statePath = path.join(app.getPath('userData'), 'cloud-sync.json');
    this.state = this.loadState();
  }

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  private loadState(): CloudSyncState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[CloudSync] Error loading state:', error);
    }
    return { files: [] };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('[CloudSync] Error saving state:', error);
    }
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------------------------------

  setAuthCookie(cookie: string): void {
    this.authCookie = cookie;
  }

  // --------------------------------------------------------------------------
  // INTERNET CHECK
  // --------------------------------------------------------------------------

  private async checkInternet(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.cloudApiUrl}/api/health`, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // BACKUP DISCOVERY
  // --------------------------------------------------------------------------

  /**
   * Escanea directorios de backups y registra archivos pendientes
   */
  async scanLocalBackups(backupBasePath: string): Promise<number> {
    let newFiles = 0;

    try {
      if (!fs.existsSync(backupBasePath)) {
        return 0;
      }

      // Listar subdirectorios (cada tienda tiene su carpeta)
      const storeDirs = fs.readdirSync(backupBasePath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const storeDir of storeDirs) {
        const storeBackupPath = path.join(backupBasePath, storeDir);
        const zipFiles = fs.readdirSync(storeBackupPath)
          .filter(f => f.endsWith('.zip'));

        for (const zipFile of zipFiles) {
          const filePath = path.join(storeBackupPath, zipFile);
          
          // Verificar si ya está registrado
          const existing = this.state.files.find(f => f.filePath === filePath);
          if (existing) continue;

          // Leer metadata del ZIP
          const metadata = await this.readZipMetadata(filePath);
          if (!metadata) {
            console.warn(`[CloudSync] No se pudo leer metadata de ${zipFile}`);
            continue;
          }

          // Calcular SHA256 del archivo
          const sha256 = await this.calculateFileSha256(filePath);
          const stats = fs.statSync(filePath);

          // Agregar al estado
          this.state.files.push({
            filePath,
            fileName: zipFile,
            sizeBytes: stats.size,
            sha256,
            storeId: metadata.storeId,
            exportedAt: metadata.exportedAt,
            version: metadata.version,
            appVersion: metadata.appVersion,
            status: 'PENDING_LOCAL',
            attempts: 0,
          });

          newFiles++;
        }
      }

      this.saveState();
    } catch (error) {
      console.error('[CloudSync] Error scanning backups:', error);
    }

    return newFiles;
  }

  private async readZipMetadata(zipPath: string): Promise<{
    storeId: string;
    exportedAt: string;
    version: string;
    appVersion: string;
  } | null> {
    try {
      const zip = new AdmZip(zipPath);
      const metadataEntry = zip.getEntry('metadata.json');
      
      if (!metadataEntry) {
        console.warn(`[CloudSync] No metadata.json en ${zipPath}`);
        return null;
      }

      const metadataStr = zip.readAsText(metadataEntry);
      const metadata = JSON.parse(metadataStr);

      // El storeId puede estar en diferentes lugares según la versión
      const storeId = metadata.storeId || metadata.store?.id;
      
      if (!storeId) {
        console.warn(`[CloudSync] No storeId en metadata de ${zipPath}`);
        return null;
      }

      return {
        storeId,
        exportedAt: metadata.exportedAt,
        version: metadata.version || '1.0',
        appVersion: metadata.appVersion || 'unknown',
      };
    } catch (error) {
      console.error(`[CloudSync] Error leyendo ZIP ${zipPath}:`, error);
      return null;
    }
  }

  private async calculateFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // --------------------------------------------------------------------------
  // SYNC LOGIC
  // --------------------------------------------------------------------------

  /**
   * Sincronizar backups pendientes con la nube
   */
  async sync(backupBasePath?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, synced: 0, failed: 0, skipped: 0, errors: ['Sincronización en progreso'] };
    }

    this.isSyncing = true;
    const result: SyncResult = { success: true, synced: 0, failed: 0, skipped: 0, errors: [] };

    try {
      // Verificar internet
      const online = await this.checkInternet();
      if (!online) {
        return { success: false, synced: 0, failed: 0, skipped: 0, errors: ['Sin conexión a internet'] };
      }

      // Escanear nuevos backups si se proporciona path
      if (backupBasePath) {
        await this.scanLocalBackups(backupBasePath);
      }

      // Filtrar archivos pendientes
      const pending = this.state.files.filter(f => 
        f.status === 'PENDING_LOCAL' || 
        (f.status === 'FAILED' && f.attempts < this.maxRetries && this.shouldRetry(f))
      );

      console.log(`[CloudSync] ${pending.length} archivos pendientes de sincronizar`);

      for (const file of pending) {
        try {
          await this.syncFile(file);
          result.synced++;
        } catch (error: any) {
          file.status = 'FAILED';
          file.error = error.message;
          file.attempts++;
          file.lastAttempt = new Date().toISOString();
          result.failed++;
          result.errors.push(`${file.fileName}: ${error.message}`);
        }
        this.saveState();
      }

      this.state.lastSyncAt = new Date().toISOString();
      this.state.lastSyncResult = result.failed === 0 ? 'success' : (result.synced > 0 ? 'partial' : 'failed');
      this.saveState();

    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  private shouldRetry(file: CloudSyncFileState): boolean {
    if (!file.lastAttempt) return true;
    
    const lastAttempt = new Date(file.lastAttempt).getTime();
    const delayIndex = Math.min(file.attempts - 1, this.retryDelays.length - 1);
    const delay = this.retryDelays[delayIndex];
    
    return Date.now() - lastAttempt >= delay;
  }

  private async syncFile(file: CloudSyncFileState): Promise<void> {
    if (!this.authCookie) {
      throw new Error('No autenticado');
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(file.filePath)) {
      file.status = 'FAILED';
      file.error = 'Archivo no encontrado';
      throw new Error('Archivo no encontrado');
    }

    file.status = 'UPLOADING';
    file.lastAttempt = new Date().toISOString();
    this.saveState();

    // 1. Solicitar presigned URL
    const requestUploadRes = await fetch(`${this.cloudApiUrl}/api/cloud-backups/request-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.authCookie,
      },
      body: JSON.stringify({
        storeId: file.storeId,
        filename: file.fileName,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        exportedAt: file.exportedAt,
        version: file.version,
        appVersion: file.appVersion,
      }),
    });

    const requestData = await requestUploadRes.json() as {
      code?: string;
      message?: string;
      backupId?: string;
      uploadUrl?: string;
    };

    // Manejar duplicado (ya existe)
    if (requestUploadRes.status === 409 && requestData.code === 'BACKUP_ALREADY_EXISTS') {
      console.log(`[CloudSync] ${file.fileName} ya existe en la nube`);
      file.status = 'DONE';
      file.cloudBackupId = requestData.backupId;
      return;
    }

    if (!requestUploadRes.ok) {
      throw new Error(requestData.message || `Error ${requestUploadRes.status}`);
    }

    const { uploadUrl, backupId } = requestData;
    if (!uploadUrl || !backupId) {
      throw new Error('Respuesta inválida del servidor');
    }
    file.cloudBackupId = backupId;

    // 2. Subir archivo a S3
    const fileBuffer = fs.readFileSync(file.filePath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(file.sizeBytes),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`Error subiendo a S3: ${uploadRes.status}`);
    }

    // 3. Confirmar subida
    const confirmRes = await fetch(`${this.cloudApiUrl}/api/cloud-backups/confirm-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.authCookie,
      },
      body: JSON.stringify({ backupId }),
    });

    if (!confirmRes.ok) {
      const confirmData = await confirmRes.json() as { message?: string };
      throw new Error(confirmData.message || 'Error confirmando subida');
    }

    file.status = 'DONE';
    console.log(`[CloudSync] ${file.fileName} sincronizado exitosamente`);
  }

  // --------------------------------------------------------------------------
  // AUTO SYNC
  // --------------------------------------------------------------------------

  /**
   * Iniciar sincronización automática
   */
  startAutoSync(backupBasePath: string): void {
    this.stopAutoSync();
    
    // Sync inicial
    this.sync(backupBasePath).catch(console.error);

    // Sync periódico
    this.intervalTimer = setInterval(() => {
      this.sync(backupBasePath).catch(console.error);
    }, this.syncIntervalMs);

    console.log(`[CloudSync] Auto-sync iniciado (cada ${this.syncIntervalMs / 60000} minutos)`);
  }

  /**
   * Detener sincronización automática
   */
  stopAutoSync(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Trigger manual después de crear un backup
   */
  async triggerAfterBackup(backupFilePath: string, storeInfo: {
    id: string;
    name: string;
  }): Promise<void> {
    // Agregar inmediatamente al estado
    try {
      const metadata = await this.readZipMetadata(backupFilePath);
      if (!metadata) return;

      const sha256 = await this.calculateFileSha256(backupFilePath);
      const stats = fs.statSync(backupFilePath);
      const fileName = path.basename(backupFilePath);

      // Verificar si ya existe
      const existing = this.state.files.find(f => f.filePath === backupFilePath);
      if (!existing) {
        this.state.files.push({
          filePath: backupFilePath,
          fileName,
          sizeBytes: stats.size,
          sha256,
          storeId: storeInfo.id,
          exportedAt: metadata.exportedAt,
          version: metadata.version,
          appVersion: metadata.appVersion,
          status: 'PENDING_LOCAL',
          attempts: 0,
        });
        this.saveState();
      }

      // Intentar sync inmediato
      await this.sync();
    } catch (error) {
      console.error('[CloudSync] Error en triggerAfterBackup:', error);
    }
  }

  // --------------------------------------------------------------------------
  // GETTERS
  // --------------------------------------------------------------------------

  getState(): CloudSyncState {
    return { ...this.state };
  }

  getPendingCount(): number {
    return this.state.files.filter(f => f.status === 'PENDING_LOCAL' || f.status === 'UPLOADING').length;
  }

  getFailedCount(): number {
    return this.state.files.filter(f => f.status === 'FAILED').length;
  }

  getDoneCount(): number {
    return this.state.files.filter(f => f.status === 'DONE').length;
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  /**
   * Limpiar archivos DONE del estado (ya sincronizados)
   */
  cleanupDone(): number {
    const before = this.state.files.length;
    this.state.files = this.state.files.filter(f => f.status !== 'DONE');
    this.saveState();
    return before - this.state.files.length;
  }

  /**
   * Reintentar archivos fallidos
   */
  resetFailed(): number {
    let count = 0;
    for (const file of this.state.files) {
      if (file.status === 'FAILED') {
        file.status = 'PENDING_LOCAL';
        file.attempts = 0;
        file.error = undefined;
        count++;
      }
    }
    this.saveState();
    return count;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let cloudSyncInstance: CloudBackupSync | null = null;

export function initCloudBackupSync(cloudApiUrl: string): CloudBackupSync {
  if (!cloudSyncInstance) {
    cloudSyncInstance = new CloudBackupSync(cloudApiUrl);
  }
  return cloudSyncInstance;
}

export function getCloudBackupSync(): CloudBackupSync | null {
  return cloudSyncInstance;
}
