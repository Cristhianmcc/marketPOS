/**
 * MarketPOS Desktop - Preload Script
 * 
 * Este script se ejecuta ANTES de que se cargue el contenido web.
 * Proporciona una API segura para comunicación entre el proceso
 * principal (main) y el proceso de renderizado (web).
 * 
 * ⚠️ SEGURIDAD: Este es el único punto de contacto entre Node.js y el web.
 * Solo exponer funciones estrictamente necesarias.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ============================================================================
// TIPOS
// ============================================================================

interface DesktopAPI {
  // Información del sistema
  platform: NodeJS.Platform;
  isDesktop: boolean;
  version: string;

  // Ventana
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };

  // Almacenamiento local seguro
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  // Modo offline
  offline: {
    getStatus: () => Promise<OfflineStatus>;
    activate: () => Promise<ActivationResult>;
    deactivate: () => Promise<void>;
    syncToCloud: () => Promise<SyncResult>;
  };

  // Backups
  backup: {
    create: (storeInfo: StoreInfo, trigger: BackupTrigger) => Promise<BackupResult>;
    list: (storeName: string) => Promise<BackupFileInfo[]>;
    restore: (filePath: string) => Promise<RestoreResult>;
    getConfig: () => Promise<BackupConfig>;
    updateConfig: (config: Partial<BackupConfig>) => Promise<void>;
    getBackupDir: (storeName: string) => Promise<string>;
    openBackupFolder: (storeName: string) => Promise<void>;
    pickFolder: () => Promise<string | null>;  // D4: Selector de carpeta
  };

  // Cloud Backup Sync (D8)
  cloudSync: {
    getState: () => Promise<CloudSyncState | null>;
    getStats: () => Promise<CloudSyncStats>;
    syncNow: () => Promise<CloudSyncResult>;
    cleanupDone: () => Promise<number>;
    resetFailed: () => Promise<number>;
    setAuth: (cookie: string) => Promise<boolean>;
  };

  // Online Monitor (D5)
  online: {
    getStatus: () => Promise<OnlineStatusD5>;
    checkNow: () => Promise<boolean>;
    getConfig: () => Promise<OnlineConfig>;
    updateConfig: (config: Partial<OnlineConfig>) => Promise<void>;
  };

  // Task Queue (D5)
  queue: {
    enqueue: (type: TaskType, payload: Record<string, unknown>) => Promise<string | null>;
    getTask: (taskId: string) => Promise<QueuedTask | null>;
    getPending: () => Promise<QueuedTask[]>;
    getStats: () => Promise<TaskQueueStats>;
    processNow: () => Promise<void>;
    clearCompleted: () => Promise<void>;
    retryFailed: () => Promise<void>;
  };

  // Printer (D6)
  printer: {
    getPrinters: () => Promise<PrinterInfo[]>;
    getDefaultPrinter: () => Promise<string | null>;
    getConfig: () => Promise<PrinterConfig>;
    updateConfig: (config: Partial<PrinterConfig>) => Promise<void>;
    printTicket: (saleId: string, options?: PrintOptions) => Promise<PrintResult>;
    testPrint: (printerName?: string) => Promise<PrintResult>;
    reprint: (saleId: string, options?: PrintOptions) => Promise<PrintResult>;
    printHtml: (html: string, options?: PrintOptions) => Promise<PrintResult>;
  };

  // Updater (D7)
  updater: {
    checkForUpdates: () => Promise<UpdateStatus>;
    checkSilent: () => Promise<UpdateStatus>;
    download: () => Promise<UpdateStatus>;
    install: () => void;
    getStatus: () => Promise<UpdateStatus>;
    getVersion: () => Promise<string>;
    getConfig: () => Promise<UpdateConfig>;
    updateConfig: (config: Partial<UpdateConfig>) => Promise<UpdateConfig>;
  };

  // ESC/POS USB & Network (D6-USB, D6.1-NET)
  escpos: {
    listUsb: () => Promise<UsbDevice[]>;
    listBt: () => Promise<BtPortInfo[]>;
    getConfig: () => Promise<EscposConfig>;
    updateConfig: (config: Partial<EscposConfig>) => Promise<EscposConfig>;
    testPrint: (full?: boolean) => Promise<EscposPrintResult>;
    printSale: (saleId: string) => Promise<EscposPrintResult>;
    // D6.1-NET: Network-specific
    netPing: (host?: string, port?: number) => Promise<PingResult>;
  };

  // Raster Print (D6.2)
  raster: {
    getConfig: () => Promise<EscposConfig | null>;
    updateConfig: (config: Partial<EscposConfig>) => Promise<EscposConfig | null>;
    testPrint: () => Promise<EscposPrintResult>;
    printSale: (saleId: string) => Promise<EscposPrintResult>;
    validateConfig: () => Promise<string | null>;
  };

  // PostgreSQL Management (D7.2)
  pg: {
    getStatus: () => Promise<PgStatus>;
    getConfig: () => Promise<PgConfigInfo | null>;
    setRunMode: (mode: PgRunMode) => Promise<PgOperationResult>;
    registerTask: () => Promise<PgOperationResult>;
    removeTask: () => Promise<PgOperationResult>;
    getTaskStatus: () => Promise<TaskSchedulerStatus>;
    installService: () => Promise<PgOperationResult>;
    removeService: () => Promise<PgOperationResult>;
    getServiceStatus: () => Promise<ServiceStatus>;
    start: () => Promise<PgOperationResult>;
    stop: () => Promise<PgOperationResult>;
    isAdmin: () => Promise<boolean>;
  };

  // Eventos
  on: (channel: AllowedChannel, callback: (...args: unknown[]) => void) => void;
  off: (channel: AllowedChannel, callback: (...args: unknown[]) => void) => void;
}

interface OfflineStatus {
  isOffline: boolean;
  activatedAt?: string;
  lastSync?: string;
  storeId?: string;
}

interface ActivationResult {
  success: boolean;
  needsRestart: boolean;
  error?: string;
}

interface SyncResult {
  success: boolean;
  syncedAt: string;
  itemsSynced: number;
  error?: string;
}

// Tipos de Backup
interface StoreInfo {
  id: string;
  name: string;
  ruc?: string;
  address?: string;
  phone?: string;
}

type BackupTrigger = 'manual' | 'shift-close' | 'scheduled';

interface BackupResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
  size?: number;
}

interface BackupFileInfo {
  fileName: string;
  filePath: string;
  size: number;
  createdAt: Date;
}

interface RestoreResult {
  success: boolean;
  metadata?: {
    version: string;
    exportedAt: string;
    store: { name: string };
  };
  error?: string;
}

interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  onShiftClose: boolean;
  maxBackups: number;
  customPath?: string;
}

// Tipos D8: Cloud Backup Sync
type CloudSyncFileStatus = 'PENDING_LOCAL' | 'UPLOADING' | 'DONE' | 'FAILED';

interface CloudSyncFileInfo {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  storeId: string;
  exportedAt: string;
  status: CloudSyncFileStatus;
  cloudBackupId?: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

interface CloudSyncState {
  files: CloudSyncFileInfo[];
  lastSyncAt?: string;
  lastSyncResult?: 'success' | 'partial' | 'failed';
}

interface CloudSyncStats {
  pending: number;
  failed: number;
  done: number;
  syncing: boolean;
}

interface CloudSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// Tipos D5: Online Monitor
interface OnlineStatusD5 {
  isOnline: boolean;
  lastCheck: Date;
  lastOnline: Date | null;
  consecutiveFailures: number;
}

interface OnlineConfig {
  checkIntervalMs: number;
  pingUrl: string;
  pingTimeoutMs: number;
  failuresBeforeOffline: number;
}

// Tipos D5: Task Queue
type TaskType = 'sunat_send' | 'cloudinary_upload' | 'sync_data';
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface QueuedTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttempt?: string;
  error?: string;
  completedAt?: string;
}

interface TaskQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

// Tipos D6: Printer
interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options?: Record<string, string>;
}

interface PrinterConfig {
  defaultPrinter: string | null;
  paperWidth: '58mm' | '80mm';
  silentPrint: boolean;
  copies: number;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

interface PrintOptions {
  printerName?: string;
  silent?: boolean;
  copies?: number;
  preview?: boolean;
}

interface PrintResult {
  success: boolean;
  error?: string;
  printerName?: string;
}

// Tipos D7: Updater
interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  version: string | null;
  error: string | null;
}

interface UpdateConfig {
  autoDownload: boolean;
  autoInstallOnQuit: boolean;
  checkInterval: number;
  feedUrl?: string;
}

// Tipos D6-USB, D6.1-NET, D6.2-Raster: ESC/POS
interface UsbDevice {
  vendorId: number;
  productId: number;
  name: string;
  manufacturer?: string;
  serialNumber?: string;
}

interface EscposConfig {
  mode: 'HTML' | 'ESCPOS_USB' | 'ESCPOS_NET' | 'ESCPOS_RASTER' | 'ESCPOS_BT';
  vendorId: number | null;
  productId: number | null;
  charsPerLine: 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: 'CP437' | 'CP850' | 'CP858' | 'ISO8859_15';
  // D6.1-NET: Network fields
  netHost: string;
  netPort: number;
  netTimeout: number;
  // D6-BT: Bluetooth Serial fields
  btPort: string | null;
  btBaud: number;
  // D6.2-Raster: Raster fields
  rasterTransport: 'USB' | 'NET';
  rasterWidthPx: 512 | 576 | 640;
  rasterDither: boolean;
  rasterCut: boolean;
  rasterOpenDrawer: boolean;
  rasterMarginTopPx: number;
  rasterMarginLeftPx: number;
}

interface EscposPrintResult {
  success: boolean;
  error?: string;
  fallbackToHtml?: boolean;
}

interface BtPortInfo {
  path: string;
  friendlyName: string;
  isBluetooth: boolean;
}

interface PingResult {
  ok: boolean;
  reason?: string;
  latencyMs?: number;
}

// Tipos D7.2: PostgreSQL Management
type PgRunMode = 'APP_LIFETIME' | 'TASK_AT_LOGON' | 'WINDOWS_SERVICE';

interface PgStatus {
  running: boolean;
  configured: boolean;
  runMode: PgRunMode;
  port: number | null;
  pid?: number;
  taskRegistered?: boolean;
  serviceInstalled?: boolean;
  serviceRunning?: boolean;
}

interface PgConfigInfo {
  port: number;
  user: string;
  db: string;
  dataDir: string;
  runMode: PgRunMode;
  initialized: boolean;
  lastStarted?: string;
}

interface PgOperationResult {
  success: boolean;
  message?: string;
  error?: string;
  requiresAdmin?: boolean;
}

interface TaskSchedulerStatus {
  registered: boolean;
  taskName?: string;
  nextRun?: string;
  lastRun?: string;
  status?: string;
  error?: string;
}

interface ServiceStatus {
  installed: boolean;
  running?: boolean;
  serviceName?: string;
  displayName?: string;
  state?: string;
  error?: string;
}

// Canales IPC permitidos (whitelist de seguridad)
type AllowedChannel = 
  | 'offline:status-changed'
  | 'online:status-changed'
  | 'sync:progress'
  | 'sync:completed'
  | 'backup:progress'
  | 'backup:completed'
  | 'backup:error'
  | 'task:enqueued'
  | 'task:processing'
  | 'task:completed'
  | 'task:failed'
  | 'task:retry'
  | 'app:update-available'
  | 'app:update-downloaded'
  | 'updater:status';

const ALLOWED_CHANNELS: AllowedChannel[] = [
  'offline:status-changed',
  'online:status-changed',
  'sync:progress',
  'sync:completed',
  'backup:progress',
  'backup:completed',
  'backup:error',
  'task:enqueued',
  'task:processing',
  'task:completed',
  'task:failed',
  'task:retry',
  'app:update-available',
  'app:update-downloaded',
  'updater:status',
];

// ============================================================================
// API SEGURA EXPUESTA AL RENDERER
// ============================================================================

const desktopAPI: DesktopAPI = {
  // Información básica del sistema
  platform: process.platform,
  isDesktop: true,
  version: process.env.npm_package_version || '0.1.0',

  // Control de ventana
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // Almacenamiento local seguro
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },

  // Modo offline
  offline: {
    getStatus: () => ipcRenderer.invoke('offline:get-status'),
    activate: () => ipcRenderer.invoke('offline:activate'),
    deactivate: () => ipcRenderer.invoke('offline:deactivate'),
    syncToCloud: () => ipcRenderer.invoke('offline:sync-to-cloud'),
  },

  // Backups
  backup: {
    create: (storeInfo: StoreInfo, trigger: BackupTrigger) => 
      ipcRenderer.invoke('backup:create', storeInfo, trigger),
    list: (storeName: string) => 
      ipcRenderer.invoke('backup:list', storeName),
    restore: (filePath: string) => 
      ipcRenderer.invoke('backup:restore', filePath),
    getConfig: () => 
      ipcRenderer.invoke('backup:get-config'),
    updateConfig: (config: Partial<BackupConfig>) => 
      ipcRenderer.invoke('backup:update-config', config),
    getBackupDir: (storeName: string) => 
      ipcRenderer.invoke('backup:get-dir', storeName),
    openBackupFolder: (storeName: string) => 
      ipcRenderer.invoke('backup:open-folder', storeName),
    pickFolder: () => 
      ipcRenderer.invoke('backup:pick-folder'),
  },

  // Cloud Backup Sync (D8)
  cloudSync: {
    getState: () => 
      ipcRenderer.invoke('cloud-sync:get-state'),
    getStats: () => 
      ipcRenderer.invoke('cloud-sync:get-stats'),
    syncNow: () => 
      ipcRenderer.invoke('cloud-sync:sync-now'),
    cleanupDone: () => 
      ipcRenderer.invoke('cloud-sync:cleanup-done'),
    resetFailed: () => 
      ipcRenderer.invoke('cloud-sync:reset-failed'),
    setAuth: (cookie: string) => 
      ipcRenderer.invoke('cloud-sync:set-auth', cookie),
  },

  // Online Monitor (D5)
  online: {
    getStatus: () => 
      ipcRenderer.invoke('online:get-status'),
    checkNow: () => 
      ipcRenderer.invoke('online:check-now'),
    getConfig: () => 
      ipcRenderer.invoke('online:get-config'),
    updateConfig: (config: Partial<OnlineConfig>) => 
      ipcRenderer.invoke('online:update-config', config),
  },

  // Task Queue (D5)
  queue: {
    enqueue: (type: TaskType, payload: Record<string, unknown>) => 
      ipcRenderer.invoke('queue:enqueue', type, payload),
    getTask: (taskId: string) => 
      ipcRenderer.invoke('queue:get-task', taskId),
    getPending: () => 
      ipcRenderer.invoke('queue:get-pending'),
    getStats: () => 
      ipcRenderer.invoke('queue:get-stats'),
    processNow: () => 
      ipcRenderer.invoke('queue:process-now'),
    clearCompleted: () => 
      ipcRenderer.invoke('queue:clear-completed'),
    retryFailed: () => 
      ipcRenderer.invoke('queue:retry-failed'),
  },

  // Printer (D6)
  printer: {
    getPrinters: () => 
      ipcRenderer.invoke('printer:get-list'),
    getDefaultPrinter: () => 
      ipcRenderer.invoke('printer:get-default'),
    getConfig: () => 
      ipcRenderer.invoke('printer:get-config'),
    updateConfig: (config: Partial<PrinterConfig>) => 
      ipcRenderer.invoke('printer:update-config', config),
    printTicket: (saleId: string, options?: PrintOptions) => 
      ipcRenderer.invoke('printer:print-ticket', saleId, options),
    testPrint: (printerName?: string) => 
      ipcRenderer.invoke('printer:test-print', printerName),
    reprint: (saleId: string, options?: PrintOptions) => 
      ipcRenderer.invoke('printer:reprint', saleId, options),
    printHtml: (html: string, options?: PrintOptions) => 
      ipcRenderer.invoke('printer:print-html', html, options),
  },

  // Updater (D7)
  updater: {
    checkForUpdates: () => 
      ipcRenderer.invoke('updater:check'),
    checkSilent: () => 
      ipcRenderer.invoke('updater:check-silent'),
    download: () => 
      ipcRenderer.invoke('updater:download'),
    install: () => 
      ipcRenderer.invoke('updater:install'),
    getStatus: () => 
      ipcRenderer.invoke('updater:get-status'),
    getVersion: () => 
      ipcRenderer.invoke('updater:get-version'),
    getConfig: () => 
      ipcRenderer.invoke('updater:get-config'),
    updateConfig: (config: Partial<UpdateConfig>) => 
      ipcRenderer.invoke('updater:update-config', config),
  },

  // ESC/POS USB & Network (D6-USB, D6.1-NET)
  escpos: {
    listUsb: () => 
      ipcRenderer.invoke('escpos:list-usb'),
    listBt: () =>
      ipcRenderer.invoke('escpos:list-bt'),
    getConfig: () => 
      ipcRenderer.invoke('escpos:get-config'),
    updateConfig: (config: Partial<EscposConfig>) => 
      ipcRenderer.invoke('escpos:update-config', config),
    testPrint: (full: boolean = true) => 
      ipcRenderer.invoke('escpos:test-print', full),
    printSale: (saleId: string) => 
      ipcRenderer.invoke('escpos:print-sale', saleId),
    // D6.1-NET: Network-specific
    netPing: (host?: string, port?: number) => 
      ipcRenderer.invoke('escpos:net-ping', host, port),
  },

  // Raster Print (D6.2)
  raster: {
    getConfig: () => 
      ipcRenderer.invoke('raster:get-config'),
    updateConfig: (config: Partial<EscposConfig>) => 
      ipcRenderer.invoke('raster:update-config', config),
    testPrint: () => 
      ipcRenderer.invoke('raster:test-print'),
    printSale: (saleId: string) => 
      ipcRenderer.invoke('raster:print-sale', saleId),
    validateConfig: () => 
      ipcRenderer.invoke('raster:validate-config'),
  },

  // PostgreSQL Management (D7.2)
  pg: {
    getStatus: () => 
      ipcRenderer.invoke('pg:get-status'),
    getConfig: () => 
      ipcRenderer.invoke('pg:get-config'),
    setRunMode: (mode: 'APP_LIFETIME' | 'TASK_AT_LOGON' | 'WINDOWS_SERVICE') => 
      ipcRenderer.invoke('pg:set-run-mode', mode),
    registerTask: () => 
      ipcRenderer.invoke('pg:register-task'),
    removeTask: () => 
      ipcRenderer.invoke('pg:remove-task'),
    getTaskStatus: () => 
      ipcRenderer.invoke('pg:get-task-status'),
    installService: () => 
      ipcRenderer.invoke('pg:install-service'),
    removeService: () => 
      ipcRenderer.invoke('pg:remove-service'),
    getServiceStatus: () => 
      ipcRenderer.invoke('pg:get-service-status'),
    start: () => 
      ipcRenderer.invoke('pg:start'),
    stop: () => 
      ipcRenderer.invoke('pg:stop'),
    isAdmin: () => 
      ipcRenderer.invoke('pg:is-admin'),
  },

  // Sistema de eventos (solo canales permitidos)
  on: (channel: AllowedChannel, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      console.warn(`[Preload] Blocked subscription to unauthorized channel: ${channel}`);
      return;
    }
    
    const wrappedCallback = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, wrappedCallback);
  },

  off: (channel: AllowedChannel, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return;
    }
    ipcRenderer.removeListener(channel, callback as never);
  },
};

// ============================================================================
// EXPOSICIÓN SEGURA AL CONTEXTO WEB
// ============================================================================

/**
 * Expone la API al objeto window de manera segura.
 * El código web puede acceder a estas funciones via window.desktop
 * pero NO tiene acceso a Node.js ni a ipcRenderer directamente.
 */
contextBridge.exposeInMainWorld('desktop', desktopAPI);

// Log para debugging
console.log('[Preload] Desktop API exposed successfully');
console.log('[Preload] Platform:', process.platform);
