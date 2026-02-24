/**
 * MÓDULO D4: Desktop Backup Scheduler
 * 
 * Maneja backups automáticos locales:
 * - Trigger al cerrar turno
 * - Backups programados (intervalo configurable)
 * - Guardado en Documents/MonterrialPOS/Backups/{storeName}/
 * - Formato ZIP compatible con export web
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import archiver from 'archiver';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

// ============================================================================
// TIPOS
// ============================================================================

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;           // 0 = solo manual/on-shift-close
  onShiftClose: boolean;           // Backup automático al cerrar turno
  maxBackups: number;              // Máximo de backups a retener (0 = ilimitado)
  customPath?: string;             // Path personalizado (default: Documents/MonterrialPOS/Backups)
}

export interface BackupMetadata {
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
  counts: Record<string, number>;
  trigger: 'manual' | 'shift-close' | 'scheduled';
}

export interface BackupResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
  size?: number;
}

export interface StoreInfo {
  id: string;
  name: string;
  ruc?: string;
  address?: string;
  phone?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  intervalHours: 24,        // Backup diario por defecto
  onShiftClose: true,
  maxBackups: 30,           // Retener últimos 30 backups
};

// ============================================================================
// BACKUP SCHEDULER CLASS
// ============================================================================

export class BackupScheduler {
  private config: BackupConfig;
  private configPath: string;
  private intervalTimer: NodeJS.Timeout | null = null;
  private serverUrl: string;
  private authToken: string | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.configPath = path.join(app.getPath('userData'), 'backup-config.json');
    this.config = this.loadConfig();
  }

  // --------------------------------------------------------------------------
  // CONFIG MANAGEMENT
  // --------------------------------------------------------------------------

  private loadConfig(): BackupConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_BACKUP_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[BackupScheduler] Error loading config:', error);
    }
    return { ...DEFAULT_BACKUP_CONFIG };
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[BackupScheduler] Error saving config:', error);
    }
  }

  getConfig(): BackupConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    this.restartScheduler();
  }

  // --------------------------------------------------------------------------
  // AUTH TOKEN (para llamar a la API local)
  // --------------------------------------------------------------------------

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  // --------------------------------------------------------------------------
  // BACKUP PATH
  // --------------------------------------------------------------------------

  private getBackupDir(storeName: string): string {
    const sanitizedStoreName = storeName.replace(/[<>:"/\\|?*]/g, '_');
    
    if (this.config.customPath) {
      return path.join(this.config.customPath, sanitizedStoreName);
    }

    // Default: Documents/MonterrialPOS/Backups/{storeName}
    const documentsPath = app.getPath('documents');
    return path.join(documentsPath, 'MonterrialPOS', 'Backups', sanitizedStoreName);
  }

  private ensureBackupDir(storeName: string): string {
    const dir = this.getBackupDir(storeName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // --------------------------------------------------------------------------
  // BACKUP EXECUTION
  // --------------------------------------------------------------------------

  async createBackup(
    storeInfo: StoreInfo,
    trigger: 'manual' | 'shift-close' | 'scheduled'
  ): Promise<BackupResult> {
    if (!this.config.enabled && trigger !== 'manual') {
      return { success: false, error: 'Backups deshabilitados' };
    }

    try {
      console.log(`[BackupScheduler] Creating ${trigger} backup for store: ${storeInfo.name}`);

      // Obtener datos del servidor local
      const backupData = await this.fetchBackupData(storeInfo.id);
      if (!backupData) {
        return { success: false, error: 'No se pudo obtener datos del servidor' };
      }

      // Crear directorio de backups
      const backupDir = this.ensureBackupDir(storeInfo.name);

      // Nombre del archivo: YYYY-MM-DD_HH-mm-ss.zip
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .split('.')[0];
      const fileName = `backup_${timestamp}.zip`;
      const filePath = path.join(backupDir, fileName);

      // Crear checksum
      const dataJsonContent = JSON.stringify(backupData, null, 2);
      const checksum = crypto.createHash('sha256').update(dataJsonContent, 'utf8').digest('hex');

      // Metadata
      const metadata: BackupMetadata = {
        version: '1.0',
        exportedAt: now.toISOString(),
        appVersion: app.getVersion(),
        store: {
          name: storeInfo.name,
          ruc: storeInfo.ruc,
          address: storeInfo.address,
          phone: storeInfo.phone,
        },
        checksum: `sha256:${checksum}`,
        counts: this.calculateCounts(backupData),
        trigger,
      };

      // Crear ZIP
      await this.createZipFile(filePath, metadata, backupData);

      // Verificar archivo creado
      const stats = fs.statSync(filePath);

      console.log(`[BackupScheduler] Backup created: ${filePath} (${stats.size} bytes)`);

      // Limpiar backups antiguos
      await this.cleanupOldBackups(storeInfo.name);

      return {
        success: true,
        filePath,
        fileName,
        size: stats.size,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BackupScheduler] Backup failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async fetchBackupData(storeId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`${this.serverUrl}/api/backups/export?storeId=${storeId}`, {
        method: 'GET',
        headers: {
          ...(this.authToken && { Cookie: this.authToken }),
        },
      });

      if (!response.ok) {
        console.error('[BackupScheduler] API error:', response.status, response.statusText);
        return null;
      }

      // El endpoint devuelve un ZIP, necesitamos obtener el data.json
      // Para desktop, vamos a hacer un endpoint alternativo que retorne JSON
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        return await response.json() as Record<string, unknown>;
      }

      // Si es ZIP, extraer data.json
      const buffer = await response.arrayBuffer();
      return await this.extractDataFromZip(Buffer.from(buffer));
    } catch (error) {
      console.error('[BackupScheduler] Fetch error:', error);
      return null;
    }
  }

  private async extractDataFromZip(buffer: Buffer): Promise<Record<string, unknown> | null> {
    // Usar AdmZip para extraer data.json
    try {
      const zip = new AdmZip(buffer);
      const dataEntry = zip.getEntry('data.json');
      
      if (!dataEntry) {
        console.error('[BackupScheduler] data.json not found in ZIP');
        return null;
      }

      const content = dataEntry.getData().toString('utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('[BackupScheduler] Error extracting ZIP:', error);
      return null;
    }
  }

  private calculateCounts(data: Record<string, unknown>): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        counts[key] = value.length;
      }
    }

    return counts;
  }

  private createZipFile(
    filePath: string,
    metadata: BackupMetadata,
    data: Record<string, unknown>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Agregar archivos al ZIP
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
      archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });

      archive.finalize();
    });
  }

  // --------------------------------------------------------------------------
  // BACKUP CLEANUP
  // --------------------------------------------------------------------------

  private async cleanupOldBackups(storeName: string): Promise<void> {
    if (this.config.maxBackups <= 0) return;

    try {
      const backupDir = this.getBackupDir(storeName);
      if (!fs.existsSync(backupDir)) return;

      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => ({
          name: f,
          path: path.join(backupDir, f),
          mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime); // Más recientes primero

      // Eliminar backups excedentes
      if (files.length > this.config.maxBackups) {
        const toDelete = files.slice(this.config.maxBackups);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
          console.log(`[BackupScheduler] Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('[BackupScheduler] Cleanup error:', error);
    }
  }

  // --------------------------------------------------------------------------
  // SCHEDULED BACKUPS
  // --------------------------------------------------------------------------

  startScheduler(): void {
    this.stopScheduler();

    if (!this.config.enabled || this.config.intervalHours <= 0) {
      console.log('[BackupScheduler] Scheduled backups disabled');
      return;
    }

    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    
    console.log(`[BackupScheduler] Starting scheduler - interval: ${this.config.intervalHours}h`);
    
    this.intervalTimer = setInterval(async () => {
      // Obtener store info del servidor
      const storeInfo = await this.getCurrentStoreInfo();
      if (storeInfo) {
        await this.createBackup(storeInfo, 'scheduled');
      }
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('[BackupScheduler] Scheduler stopped');
    }
  }

  restartScheduler(): void {
    this.stopScheduler();
    this.startScheduler();
  }

  private async getCurrentStoreInfo(): Promise<StoreInfo | null> {
    try {
      const response = await fetch(`${this.serverUrl}/api/store/current`, {
        headers: {
          ...(this.authToken && { Cookie: this.authToken }),
        },
      });

      if (!response.ok) return null;
      
      const data = await response.json() as { store: StoreInfo };
      return data.store;
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // LIST BACKUPS
  // --------------------------------------------------------------------------

  listBackups(storeName: string): Array<{
    fileName: string;
    filePath: string;
    size: number;
    createdAt: Date;
  }> {
    try {
      const backupDir = this.getBackupDir(storeName);
      if (!fs.existsSync(backupDir)) return [];

      return fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => {
          const filePath = path.join(backupDir, f);
          const stats = fs.statSync(filePath);
          return {
            fileName: f,
            filePath,
            size: stats.size,
            createdAt: stats.mtime,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('[BackupScheduler] List error:', error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // RESTORE
  // --------------------------------------------------------------------------

  async restoreBackup(filePath: string): Promise<{
    success: boolean;
    metadata?: BackupMetadata;
    error?: string;
  }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Archivo no encontrado' };
      }

      const zip = new AdmZip(filePath);

      // Extraer metadata
      const metadataEntry = zip.getEntry('metadata.json');
      const dataEntry = zip.getEntry('data.json');

      if (!metadataEntry || !dataEntry) {
        return { success: false, error: 'Archivo backup inválido (falta metadata.json o data.json)' };
      }

      const metadata: BackupMetadata = JSON.parse(metadataEntry.getData().toString('utf8'));
      const data = JSON.parse(dataEntry.getData().toString('utf8'));

      // Verificar checksum
      const dataContent = JSON.stringify(data, null, 2);
      const checksum = crypto.createHash('sha256').update(dataContent, 'utf8').digest('hex');

      if (metadata.checksum !== `sha256:${checksum}`) {
        return { success: false, error: 'Checksum inválido - archivo corrupto' };
      }

      // Enviar al servidor para restaurar
      const response = await fetch(`${this.serverUrl}/api/backups/restore/local`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { Cookie: this.authToken }),
        },
        body: JSON.stringify({ metadata, data }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { message?: string };
        return { success: false, error: errorData.message || 'Error en restauración' };
      }

      return { success: true, metadata };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  getBackupDir_public(storeName: string): string {
    return this.getBackupDir(storeName);
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  destroy(): void {
    this.stopScheduler();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let backupSchedulerInstance: BackupScheduler | null = null;

export function initBackupScheduler(serverUrl: string): BackupScheduler {
  if (!backupSchedulerInstance) {
    backupSchedulerInstance = new BackupScheduler(serverUrl);
  }
  return backupSchedulerInstance;
}

export function getBackupScheduler(): BackupScheduler | null {
  return backupSchedulerInstance;
}
