/**
 * MarketPOS Desktop - Main Process
 * 
 * Proceso principal de Electron con configuración de seguridad profesional.
 * Este archivo NO depende de código web, solo gestiona la ventana y el ciclo
 * de vida de la aplicación desktop.
 */

import { app, BrowserWindow, shell, session, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { startLocalServer, LocalServer } from './server';
import { initBackupScheduler, getBackupScheduler, BackupConfig, StoreInfo } from './backupScheduler';
import { initOnlineMonitor, getOnlineMonitor, OnlineMonitorConfig } from './onlineMonitor';
import { initTaskQueue, getTaskQueue, TaskType } from './taskQueue';
import { initPrinterManager, getPrinterManager, PrinterConfig, PrintOptions } from './printing/printTicket';
import { initEscposPrintManager, getEscposPrintManager, EscposConfig, BtPortInfo } from './printing/escpos';
import { RasterPrintManager, closeBrowser } from './printing/raster';
import { setupUpdaterIpcHandlers, initUpdater, cleanupUpdater, UpdateConfig } from './updater/autoUpdater';
import { createPreflightManager, PreflightManager } from './updater/preflight';
import { 
  ensurePostgres, 
  shutdownPostgres, 
  showPostgresErrorDialog,
  loadRuntimeConfig,
  saveRuntimeConfig,
  getDatabaseUrl,
  PgRuntimeConfig,
  PgRunMode,
  // D7.2 - Task Scheduler
  registerTaskScheduler,
  removeTaskScheduler,
  getTaskStatus,
  // D7.2 - Windows Service
  installWindowsService,
  uninstallWindowsService,
  getServiceStatus,
  startService,
  stopService,
  isRunningAsAdmin,
  checkPostgresStatus,
  startPostgres,
  stopPostgresWithRetry,
} from './runtime/postgres';
// D8 - Cloud Backup Sync
import { initCloudBackupSync, getCloudBackupSync } from './sync';

// ============================================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================================

// D7.2 - Check if running in daemon mode
const isPgDaemonMode = process.argv.includes('--pg-daemon');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// En desarrollo: conectar al servidor de desarrollo existente
// En producción: iniciar servidor standalone local
const DEV_SERVER_URL = 'http://localhost:3000';

// Paths importantes
const RESOURCES_PATH = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..');

const USER_DATA_PATH = app.getPath('userData');

// Instancia del servidor local (solo producción)
let localServer: LocalServer | null = null;
let serverUrl: string = DEV_SERVER_URL;

// Raster print manager (D6.2)
let rasterPrintManager: RasterPrintManager | null = null;

async function syncLocalImages(serverUrl: string): Promise<void> {
  try {
    await fetch(`${serverUrl}/api/desktop/sync-images`, {
      method: 'POST',
      headers: {
        'x-desktop-app': 'true',
      },
    });
  } catch (error) {
    console.warn('[App] Local image sync skipped:', error);
  }
}

// ============================================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================================

/**
 * Aplica configuraciones de seguridad a nivel de aplicación.
 * Estas configuraciones protegen contra ataques comunes.
 */
function setupSecurityPolicies(): void {
  // Deshabilitar navegación a URLs externas desde la app
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      
      // Solo permitir navegación a localhost (nuestro servidor)
      if (parsedUrl.hostname !== 'localhost') {
        event.preventDefault();
        console.warn(`[Security] Blocked navigation to: ${navigationUrl}`);
      }
    });

    // Prevenir apertura de nuevas ventanas no autorizadas
    contents.setWindowOpenHandler(({ url }) => {
      // Abrir enlaces externos en el navegador del sistema
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Permitir localhost (nuestro servidor)
        if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) {
          shell.openExternal(url);
          return { action: 'deny' };
        }
      }
      return { action: 'deny' };
    });
  });

  // Configurar Content Security Policy después de que la app esté lista
  app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' http://localhost:* http://127.0.0.1:*",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*",
            "style-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*",
            "img-src 'self' data: https: http://localhost:* http://127.0.0.1:*",
            "font-src 'self' data:",
            "connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.amazonaws.com wss://*",
          ].join('; ')
        }
      });
    });
  });
}

// ============================================================================
// VENTANA PRINCIPAL
// ============================================================================

let mainWindow: BrowserWindow | null = null;

/**
 * Crea la ventana principal de la aplicación con configuración de seguridad.
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(RESOURCES_PATH, 'resources', 'icon.png'),
    show: false, // No mostrar hasta que esté lista
    
    webPreferences: {
      // ⚠️ SEGURIDAD: Configuración crítica
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // Aislar contexto de preload
      nodeIntegration: false,     // No exponer Node.js al renderer
      sandbox: true,              // Proceso sandbox
      webSecurity: true,          // Mantener políticas de seguridad web
      allowRunningInsecureContent: false,
      
      // Deshabilitar características peligrosas
      enableBlinkFeatures: '',
      experimentalFeatures: false,
    },
    
    // Configuración de ventana
    frame: true,
    autoHideMenuBar: true,
    title: 'Monterrial POS',
    backgroundColor: '#ffffff',
  });

  // Mostrar ventana cuando esté lista para evitar flash blanco
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    // Configurar referencias de ventana para D5 modules
    const onlineMonitor = getOnlineMonitor();
    if (onlineMonitor && mainWindow) {
      onlineMonitor.setMainWindow(mainWindow);
    }
    
    const taskQueue = getTaskQueue();
    if (taskQueue && mainWindow) {
      taskQueue.setMainWindow(mainWindow);
    }
    
    // DevTools solo en desarrollo
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Cargar la aplicación
  loadApplication();

  // Cleanup al cerrar
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Carga la aplicación, mostrando pantalla de carga mientras el servidor inicia.
 */
function loadApplication(): void {
  if (!mainWindow) return;

  // Mostrar pantalla de carga inicial
  mainWindow.loadFile(path.join(__dirname, '..', 'resources', 'loading.html'));

  // Intentar conectar al servidor
  const maxRetries = 30;
  let retries = 0;

  const tryConnect = (): void => {
    if (!mainWindow) return;

    mainWindow.loadURL(serverUrl).catch(() => {
      retries++;
      if (retries < maxRetries) {
        console.log(`[App] Waiting for server... (${retries}/${maxRetries})`);
        setTimeout(tryConnect, 1000);
      } else {
        console.error('[App] Could not connect to server');
        mainWindow?.loadFile(path.join(__dirname, '..', 'resources', 'error.html'));
      }
    });
  };

  // En desarrollo: el servidor ya debería estar corriendo
  // En producción: esperamos a que el servidor local inicie
  setTimeout(tryConnect, isDev ? 500 : 1000);
}

// ============================================================================
// CICLO DE VIDA DE LA APLICACIÓN
// ============================================================================

/**
 * Registra handlers IPC para funcionalidad de backups.
 */
function setupBackupIpcHandlers(): void {
  // Crear backup
  ipcMain.handle('backup:create', async (_event, storeInfo: StoreInfo, trigger: 'manual' | 'shift-close' | 'scheduled') => {
    const scheduler = getBackupScheduler();
    if (!scheduler) {
      return { success: false, error: 'BackupScheduler no inicializado' };
    }
    return await scheduler.createBackup(storeInfo, trigger);
  });

  // Listar backups
  ipcMain.handle('backup:list', async (_event, storeName: string) => {
    const scheduler = getBackupScheduler();
    if (!scheduler) return [];
    return scheduler.listBackups(storeName);
  });

  // Restaurar backup
  ipcMain.handle('backup:restore', async (_event, filePath: string) => {
    const scheduler = getBackupScheduler();
    if (!scheduler) {
      return { success: false, error: 'BackupScheduler no inicializado' };
    }
    return await scheduler.restoreBackup(filePath);
  });

  // Obtener configuración
  ipcMain.handle('backup:get-config', async () => {
    const scheduler = getBackupScheduler();
    if (!scheduler) return null;
    return scheduler.getConfig();
  });

  // Actualizar configuración
  ipcMain.handle('backup:update-config', async (_event, config: Partial<BackupConfig>) => {
    const scheduler = getBackupScheduler();
    if (!scheduler) return;
    scheduler.updateConfig(config);
  });

  // Obtener directorio de backups
  ipcMain.handle('backup:get-dir', async (_event, storeName: string) => {
    const scheduler = getBackupScheduler();
    if (!scheduler) return '';
    return scheduler.getBackupDir_public(storeName);
  });

  // Abrir carpeta de backups en el explorador
  ipcMain.handle('backup:open-folder', async (_event, storeName: string) => {
    const scheduler = getBackupScheduler();
    if (!scheduler) return;
    const dir = scheduler.getBackupDir_public(storeName);
    if (fs.existsSync(dir)) {
      shell.openPath(dir);
    }
  });

  // Seleccionar carpeta personalizada para backups (D4)
  ipcMain.handle('backup:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar carpeta de backups',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Seleccionar',
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // ===========================================================================
  // D8: CLOUD BACKUP SYNC IPC HANDLERS
  // ===========================================================================

  // Obtener estado del sync cloud
  ipcMain.handle('cloud-sync:get-state', async () => {
    const sync = getCloudBackupSync();
    if (!sync) return null;
    return sync.getState();
  });

  // Obtener estadísticas del sync
  ipcMain.handle('cloud-sync:get-stats', async () => {
    const sync = getCloudBackupSync();
    if (!sync) return { pending: 0, failed: 0, done: 0, syncing: false };
    return {
      pending: sync.getPendingCount(),
      failed: sync.getFailedCount(),
      done: sync.getDoneCount(),
      syncing: sync.isSyncInProgress(),
    };
  });

  // Ejecutar sync manual
  ipcMain.handle('cloud-sync:sync-now', async () => {
    const sync = getCloudBackupSync();
    if (!sync) return { success: false, error: 'CloudSync no inicializado' };
    
    const scheduler = getBackupScheduler();
    const backupDir = scheduler?.getBackupDir_public('');
    const basePath = backupDir ? path.dirname(backupDir) : undefined;
    
    return await sync.sync(basePath);
  });

  // Limpiar archivos sincronizados
  ipcMain.handle('cloud-sync:cleanup-done', async () => {
    const sync = getCloudBackupSync();
    if (!sync) return 0;
    return sync.cleanupDone();
  });

  // Reintentar fallidos
  ipcMain.handle('cloud-sync:reset-failed', async () => {
    const sync = getCloudBackupSync();
    if (!sync) return 0;
    return sync.resetFailed();
  });

  // Establecer cookie de autenticación
  ipcMain.handle('cloud-sync:set-auth', async (_event, cookie: string) => {
    const sync = getCloudBackupSync();
    if (!sync) return false;
    sync.setAuthCookie(cookie);
    return true;
  });
}

/**
 * Registra handlers IPC para estado de conexión (D5).
 */
function setupOnlineIpcHandlers(): void {
  // Obtener estado online
  ipcMain.handle('online:get-status', async () => {
    const monitor = getOnlineMonitor();
    if (!monitor) return { isOnline: true, lastCheck: new Date().toISOString() };
    return monitor.getStatus();
  });

  // Forzar check de conectividad
  ipcMain.handle('online:check-now', async () => {
    const monitor = getOnlineMonitor();
    if (!monitor) return true;
    return await monitor.checkOnline();
  });

  // Obtener configuración
  ipcMain.handle('online:get-config', async () => {
    const monitor = getOnlineMonitor();
    if (!monitor) return null;
    return monitor.getConfig();
  });

  // Actualizar configuración
  ipcMain.handle('online:update-config', async (_event, config: Partial<OnlineMonitorConfig>) => {
    const monitor = getOnlineMonitor();
    if (!monitor) return;
    monitor.updateConfig(config);
  });
}

/**
 * Registra handlers IPC para task queue offline (D5).
 */
function setupTaskQueueIpcHandlers(): void {
  // Encolar tarea
  ipcMain.handle('queue:enqueue', async (_event, type: TaskType, payload: Record<string, unknown>) => {
    const queue = getTaskQueue();
    if (!queue) return null;
    return queue.enqueue(type, payload);
  });

  // Obtener tarea por ID
  ipcMain.handle('queue:get-task', async (_event, taskId: string) => {
    const queue = getTaskQueue();
    if (!queue) return null;
    return queue.getTask(taskId);
  });

  // Obtener tareas pendientes
  ipcMain.handle('queue:get-pending', async () => {
    const queue = getTaskQueue();
    if (!queue) return [];
    return queue.getPendingTasks();
  });

  // Obtener estadísticas
  ipcMain.handle('queue:get-stats', async () => {
    const queue = getTaskQueue();
    if (!queue) return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    return queue.getStats();
  });

  // Procesar tareas pendientes manualmente
  ipcMain.handle('queue:process-now', async () => {
    const queue = getTaskQueue();
    if (!queue) return;
    await queue.processPendingTasks();
  });

  // Limpiar tareas completadas
  ipcMain.handle('queue:clear-completed', async () => {
    const queue = getTaskQueue();
    if (!queue) return;
    queue.clearCompleted();
  });

  // Reintentar tareas fallidas
  ipcMain.handle('queue:retry-failed', async () => {
    const queue = getTaskQueue();
    if (!queue) return;
    queue.retryFailed();
  });
}

/**
 * Registra handlers IPC para impresión térmica (D6).
 */
function setupPrinterIpcHandlers(): void {
  // Obtener lista de impresoras
  ipcMain.handle('printer:get-list', async () => {
    const manager = getPrinterManager();
    if (!manager) return [];
    return await manager.getPrinters();
  });

  // Obtener impresora por defecto del sistema
  ipcMain.handle('printer:get-default', async () => {
    const manager = getPrinterManager();
    if (!manager) return null;
    return await manager.getDefaultPrinter();
  });

  // Obtener configuración
  ipcMain.handle('printer:get-config', async () => {
    const manager = getPrinterManager();
    if (!manager) return null;
    return manager.getConfig();
  });

  // Actualizar configuración
  ipcMain.handle('printer:update-config', async (_event, config: Partial<PrinterConfig>) => {
    const manager = getPrinterManager();
    if (!manager) return;
    manager.updateConfig(config);
  });

  // Imprimir ticket de venta
  ipcMain.handle('printer:print-ticket', async (_event, saleId: string, options?: PrintOptions) => {
    const manager = getPrinterManager();
    if (!manager) {
      return { success: false, error: 'PrinterManager no inicializado' };
    }
    return await manager.printTicket(saleId, options);
  });

  // Impresión de prueba
  ipcMain.handle('printer:test-print', async (_event, printerName?: string) => {
    const manager = getPrinterManager();
    if (!manager) {
      return { success: false, error: 'PrinterManager no inicializado' };
    }
    return await manager.printTest(printerName);
  });

  // Reimprimir desde historial
  ipcMain.handle('printer:reprint', async (_event, saleId: string, options?: PrintOptions) => {
    const manager = getPrinterManager();
    if (!manager) {
      return { success: false, error: 'PrinterManager no inicializado' };
    }
    return await manager.reprintFromHistory(saleId, options);
  });

  // Imprimir HTML directo
  ipcMain.handle('printer:print-html', async (_event, html: string, options?: PrintOptions) => {
    const manager = getPrinterManager();
    if (!manager) {
      return { success: false, error: 'PrinterManager no inicializado' };
    }
    return await manager.printHtml(html, options);
  });
}

/**
 * Registra handlers IPC para impresión ESC/POS USB y Network (D6-USB, D6.1-NET).
 */
function setupEscposIpcHandlers(): void {
  // Listar impresoras USB
  ipcMain.handle('escpos:list-usb', async () => {
    const manager = getEscposPrintManager();
    if (!manager) return [];
    return manager.listPrinters();
  });

  // Listar puertos Bluetooth (COM ports pareados)
  ipcMain.handle('escpos:list-bt', async () => {
    const manager = getEscposPrintManager();
    if (!manager) return [] as BtPortInfo[];
    return await manager.listBtPorts();
  });

  // Obtener config ESC/POS
  ipcMain.handle('escpos:get-config', async () => {
    const manager = getEscposPrintManager();
    if (!manager) return null;
    return manager.getConfig();
  });

  // Actualizar config ESC/POS
  ipcMain.handle('escpos:update-config', async (_event, config: Partial<EscposConfig>) => {
    const manager = getEscposPrintManager();
    if (!manager) return null;
    return manager.updateConfig(config);
  });

  // Test print ESC/POS (USB o Network según config)
  ipcMain.handle('escpos:test-print', async (_event, full: boolean = true) => {
    const manager = getEscposPrintManager();
    if (!manager) {
      return { success: false, error: 'EscposPrintManager no inicializado', fallbackToHtml: true };
    }
    return await manager.testPrint(full);
  });

  // Imprimir venta ESC/POS (USB o Network según config)
  ipcMain.handle('escpos:print-sale', async (_event, saleId: string) => {
    const manager = getEscposPrintManager();
    if (!manager) {
      return { success: false, error: 'EscposPrintManager no inicializado', fallbackToHtml: true };
    }
    return await manager.printSale(saleId);
  });

  // ===== D6.1-NET: Network-specific handlers =====
  
  // Ping impresora de red
  ipcMain.handle('escpos:net-ping', async (_event, host?: string, port?: number) => {
    const manager = getEscposPrintManager();
    if (!manager) {
      return { ok: false, reason: 'EscposPrintManager no inicializado' };
    }
    return await manager.pingNetworkPrinter(host, port);
  });
}

/**
 * Registra handlers IPC para impresión Raster (D6.2).
 * HTML → PNG → ESC/POS bitmap.
 */
function setupRasterIpcHandlers(): void {
  // Obtener configuración raster
  ipcMain.handle('raster:get-config', async () => {
    if (!rasterPrintManager) {
      return null;
    }
    return rasterPrintManager.getConfig();
  });

  // Actualizar configuración raster
  ipcMain.handle('raster:update-config', async (_event, config: Partial<EscposConfig>) => {
    if (!rasterPrintManager) {
      return null;
    }
    rasterPrintManager.updateConfig(config);
    return rasterPrintManager.getConfig();
  });

  // Test print raster (imprime recibo de prueba)
  ipcMain.handle('raster:test-print', async () => {
    if (!rasterPrintManager) {
      return { success: false, error: 'RasterPrintManager no inicializado', fallbackToHtml: true };
    }
    return await rasterPrintManager.testPrint();
  });

  // Imprimir venta en modo raster
  ipcMain.handle('raster:print-sale', async (_event, saleId: string) => {
    if (!rasterPrintManager) {
      return { success: false, error: 'RasterPrintManager no inicializado', fallbackToHtml: true };
    }
    return await rasterPrintManager.printSale(saleId);
  });

  // Validar configuración
  ipcMain.handle('raster:validate-config', async () => {
    if (!rasterPrintManager) {
      return 'RasterPrintManager no inicializado';
    }
    return rasterPrintManager.validateConfig();
  });
}

/**
 * Inicializa el RasterPrintManager.
 */
function initRasterPrintManager(baseUrl: string): void {
  const escposManager = getEscposPrintManager();
  const config = escposManager?.getConfig();
  
  // Use escpos config as base, add raster defaults if needed
  const rasterConfig: EscposConfig = config || {
    mode: 'ESCPOS_RASTER',
    vendorId: null,
    productId: null,
    netHost: null,
    netPort: 9100,
    netTimeout: 5000,
    charsPerLine: 42,
    autoCut: true,
    openCashDrawer: false,
    encoding: 'CP858',
    btPort: null,
    btBaud: 9600,
    rasterTransport: 'USB',
    rasterWidthPx: 576,
    rasterDither: true,
    rasterCut: true,
    rasterOpenDrawer: false,
    rasterMarginTopPx: 0,
    rasterMarginLeftPx: 0,
  };
  
  rasterPrintManager = new RasterPrintManager(rasterConfig, baseUrl);
  console.log('[App] RasterPrintManager initialized');
}

// ============================================================================
// D7.2 - POSTGRESQL IPC HANDLERS
// ============================================================================

function setupPostgresIpcHandlers(): void {
  // Obtener estado de PostgreSQL
  ipcMain.handle('pg:get-status', async () => {
    const config = loadRuntimeConfig();
    if (!config) {
      return { 
        running: false, 
        configured: false, 
        runMode: 'APP_LIFETIME' as PgRunMode,
        port: null,
      };
    }
    
    const pgStatus = await checkPostgresStatus(config);
    const taskStatus = await getTaskStatus();
    const serviceStatus = await getServiceStatus();
    
    return {
      running: pgStatus.running,
      configured: config.initialized,
      runMode: config.runMode,
      port: config.pg.port,
      pid: pgStatus.pid,
      taskRegistered: taskStatus.registered,
      serviceInstalled: serviceStatus.installed,
      serviceRunning: serviceStatus.running,
    };
  });
  
  // Obtener configuración runtime
  ipcMain.handle('pg:get-config', async () => {
    const config = loadRuntimeConfig();
    if (!config) return null;
    
    // Return without password for security
    return {
      port: config.pg.port,
      user: config.pg.user,
      db: config.pg.db,
      dataDir: config.pg.dataDir,
      runMode: config.runMode,
      initialized: config.initialized,
      lastStarted: config.lastStarted,
    };
  });
  
  // Cambiar modo de ejecución
  ipcMain.handle('pg:set-run-mode', async (_event, mode: PgRunMode) => {
    const config = loadRuntimeConfig();
    if (!config) {
      return { success: false, error: 'No hay configuración' };
    }
    
    const oldMode = config.runMode;
    
    // Clean up old mode
    if (oldMode === 'TASK_AT_LOGON' && mode !== 'TASK_AT_LOGON') {
      await removeTaskScheduler();
    }
    if (oldMode === 'WINDOWS_SERVICE' && mode !== 'WINDOWS_SERVICE') {
      const result = await uninstallWindowsService();
      if (!result.success && result.requiresAdmin) {
        return { success: false, error: 'Se requieren permisos de administrador', requiresAdmin: true };
      }
    }
    
    // Setup new mode
    if (mode === 'TASK_AT_LOGON') {
      const result = await registerTaskScheduler();
      if (!result.success) {
        return { success: false, error: result.error };
      }
    }
    if (mode === 'WINDOWS_SERVICE') {
      if (!isRunningAsAdmin()) {
        return { success: false, error: 'Se requieren permisos de administrador', requiresAdmin: true };
      }
      const result = await installWindowsService();
      if (!result.success) {
        return { success: false, error: result.error };
      }
    }
    
    // Update config
    config.runMode = mode;
    saveRuntimeConfig(config);
    
    return { success: true, message: `Modo cambiado a ${mode}` };
  });
  
  // Registrar tarea programada
  ipcMain.handle('pg:register-task', async () => {
    return await registerTaskScheduler();
  });
  
  // Eliminar tarea programada
  ipcMain.handle('pg:remove-task', async () => {
    return await removeTaskScheduler();
  });
  
  // Obtener estado de tarea
  ipcMain.handle('pg:get-task-status', async () => {
    return await getTaskStatus();
  });
  
  // Instalar servicio Windows
  ipcMain.handle('pg:install-service', async () => {
    if (!isRunningAsAdmin()) {
      return { success: false, error: 'Se requieren permisos de administrador', requiresAdmin: true };
    }
    return await installWindowsService();
  });
  
  // Desinstalar servicio Windows
  ipcMain.handle('pg:remove-service', async () => {
    if (!isRunningAsAdmin()) {
      return { success: false, error: 'Se requieren permisos de administrador', requiresAdmin: true };
    }
    return await uninstallWindowsService();
  });
  
  // Obtener estado del servicio
  ipcMain.handle('pg:get-service-status', async () => {
    return await getServiceStatus();
  });
  
  // Iniciar PostgreSQL manualmente
  ipcMain.handle('pg:start', async () => {
    const config = loadRuntimeConfig();
    if (!config) {
      return { success: false, error: 'No hay configuración' };
    }
    return await startPostgres(config);
  });
  
  // Detener PostgreSQL manualmente
  ipcMain.handle('pg:stop', async () => {
    const config = loadRuntimeConfig();
    if (!config) {
      return { success: false, error: 'No hay configuración' };
    }
    return await stopPostgresWithRetry(config);
  });
  
  // Verificar si es admin
  ipcMain.handle('pg:is-admin', async () => {
    return isRunningAsAdmin();
  });
}

// Aplicar políticas de seguridad antes de que la app esté lista
setupSecurityPolicies();

// Registrar handlers IPC
setupBackupIpcHandlers();
setupOnlineIpcHandlers();
setupTaskQueueIpcHandlers();
setupPrinterIpcHandlers();
setupEscposIpcHandlers(); // D6-USB
setupRasterIpcHandlers(); // D6.2-Raster
setupUpdaterIpcHandlers(); // D7
setupPostgresIpcHandlers(); // D7.2

// ============================================================================
// D7.2 - DAEMON MODE (--pg-daemon)
// ============================================================================

if (isPgDaemonMode) {
  console.log('[App] Running in PostgreSQL daemon mode (--pg-daemon)');
  
  app.whenReady().then(async () => {
    console.log('[App][Daemon] Starting embedded PostgreSQL...');
    
    const pgResult = await ensurePostgres();
    
    if (!pgResult.success) {
      console.error('[App][Daemon] Failed to start PostgreSQL:', pgResult.error);
      app.quit();
      return;
    }
    
    console.log(`[App][Daemon] PostgreSQL running on port ${pgResult.config?.pg.port}`);
    console.log('[App][Daemon] Daemon will keep running in background...');
    
    // Keep the process alive
    setInterval(() => {
      // Heartbeat - do nothing, just keep alive
    }, 60000);
  });
  
  // Handle shutdown signals
  app.on('before-quit', async () => {
    console.log('[App][Daemon] Shutting down PostgreSQL...');
    await shutdownPostgres();
  });
  
  process.on('SIGTERM', async () => {
    console.log('[App][Daemon] Received SIGTERM, shutting down...');
    await shutdownPostgres();
    app.quit();
  });
  
  process.on('SIGINT', async () => {
    console.log('[App][Daemon] Received SIGINT, shutting down...');
    await shutdownPostgres();
    app.quit();
  });
  
} else {
  // Normal app mode
  
app.whenReady().then(async () => {
  console.log('[App] Starting MarketPOS Desktop...');
  console.log(`[App] Mode: ${isDev ? 'Development' : 'Production'}`);
  console.log(`[App] User Data: ${USER_DATA_PATH}`);
  
  // En producción: primero asegurar PostgreSQL embebido (D7.1)
  if (!isDev) {
    // D7.2: Check if postgres is already running (daemon/service mode)
    const existingConfig = loadRuntimeConfig();
    if (existingConfig && existingConfig.runMode !== 'APP_LIFETIME') {
      const pgStatus = await checkPostgresStatus(existingConfig);
      if (pgStatus.running) {
        console.log('[App] PostgreSQL already running (daemon/service mode)');
        process.env.DATABASE_URL = getDatabaseUrl(existingConfig);
      } else {
        // Start it anyway
        console.log('[App] Starting PostgreSQL (daemon not running)...');
        const pgResult = await ensurePostgres();
        if (pgResult.success) {
          process.env.DATABASE_URL = pgResult.databaseUrl;
        }
      }
    } else {
      // APP_LIFETIME mode - start PostgreSQL
      console.log('[App] Starting embedded PostgreSQL (D7.1)...');
    
    let pgResult = await ensurePostgres();
    
    // Retry loop if PostgreSQL fails
    while (!pgResult.success) {
      const action = await showPostgresErrorDialog(null, pgResult);
      
      if (action === 'quit') {
        console.log('[App] User chose to quit');
        app.quit();
        return;
      }
      
      if (action === 'restore') {
        // TODO: Open backup restore UI
        console.log('[App] User chose to restore backup');
        // For now, just retry
      }
      
      // Retry
      console.log('[App] Retrying PostgreSQL setup...');
      pgResult = await ensurePostgres();
    }
    
    // Set DATABASE_URL for the local server
    process.env.DATABASE_URL = pgResult.databaseUrl;
    console.log(`[App] PostgreSQL ready on port ${pgResult.config?.pg.port}`);
    console.log(`[App] DATABASE_URL set for local server`);
    }
  }
  
  // En producción: ejecutar preflight checks (ya no incluye PostgreSQL externo)
  if (!isDev) {
    const preflight = createPreflightManager();
    const canStart = await preflight.showPreflightDialog(null);
    if (!canStart) {
      console.log('[App] Preflight checks failed, exiting...');
      app.quit();
      return;
    }
    console.log('[App] Preflight checks passed');
  }
  
  // En producción: iniciar servidor local
  if (!isDev) {
    try {
      console.log('[App] Starting local server...');
      localServer = await startLocalServer(RESOURCES_PATH);
      serverUrl = localServer.url;
      console.log(`[App] Local server ready at: ${serverUrl}`);
      
      // Inicializar BackupScheduler
      const scheduler = initBackupScheduler(serverUrl);
      scheduler.startScheduler();
      console.log('[App] BackupScheduler initialized');
      
      // D8: Inicializar CloudBackupSync
      const cloudSync = initCloudBackupSync(serverUrl);
      const backupDir = scheduler.getBackupDir_public('');
      if (backupDir) {
        const baseBackupPath = path.dirname(backupDir);
        cloudSync.startAutoSync(baseBackupPath);
        console.log('[App] CloudBackupSync initialized');
      }
      
      // Inicializar OnlineMonitor (D5)
      const onlineMonitor = initOnlineMonitor();
      onlineMonitor.start();
      console.log('[App] OnlineMonitor initialized');
      onlineMonitor.onStatusChange((isOnline) => {
        if (isOnline) {
          syncLocalImages(serverUrl);
        }
      });
      
      // Inicializar TaskQueue (D5)
      const taskQueue = initTaskQueue({ serverUrl });
      taskQueue.start();
      console.log('[App] TaskQueue initialized');
      
      // Inicializar PrinterManager (D6)
      initPrinterManager(serverUrl);
      console.log('[App] PrinterManager initialized');
      
      // Inicializar EscposPrintManager (D6-USB)
      initEscposPrintManager(serverUrl);
      console.log('[App] EscposPrintManager initialized');
      
      // Inicializar RasterPrintManager (D6.2)
      initRasterPrintManager(serverUrl);
    } catch (error) {
      console.error('[App] Failed to start local server:', error);
      // Mostrar error en la ventana
    }
  } else {
    console.log(`[App] Using development server: ${serverUrl}`);
    
    // En desarrollo también inicializamos los módulos
    const scheduler = initBackupScheduler(serverUrl);
    scheduler.startScheduler();
    console.log('[App] BackupScheduler initialized (dev mode)');
    
    // D8: Inicializar CloudBackupSync (dev mode)
    const cloudSync = initCloudBackupSync(serverUrl);
    const backupDir = scheduler.getBackupDir_public('');
    if (backupDir) {
      const baseBackupPath = path.dirname(backupDir);
      cloudSync.startAutoSync(baseBackupPath);
      console.log('[App] CloudBackupSync initialized (dev mode)');
    }
    
    // OnlineMonitor (D5)
    const onlineMonitor = initOnlineMonitor();
    onlineMonitor.start();
    console.log('[App] OnlineMonitor initialized (dev mode)');
    onlineMonitor.onStatusChange((isOnline) => {
      if (isOnline) {
        syncLocalImages(serverUrl);
      }
    });
    
    // TaskQueue (D5)
    const taskQueue = initTaskQueue({ serverUrl });
    taskQueue.start();
    console.log('[App] TaskQueue initialized (dev mode)');
    
    // PrinterManager (D6)
    initPrinterManager(serverUrl);
    console.log('[App] PrinterManager initialized (dev mode)');
    
    // EscposPrintManager (D6-USB)
    initEscposPrintManager(serverUrl);
    console.log('[App] EscposPrintManager initialized (dev mode)');
    
    // RasterPrintManager (D6.2)
    initRasterPrintManager(serverUrl);
  }
  
  createMainWindow();
  
  // Inicializar auto-updater después de crear ventana (D7)
  if (mainWindow && !isDev) {
    initUpdater(mainWindow);
    console.log('[App] AutoUpdater initialized');
  }

  // macOS: Re-crear ventana al hacer click en el dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

} // End of else block (not daemon mode)

// Cerrar la app cuando todas las ventanas estén cerradas (excepto macOS)
app.on('window-all-closed', async () => {
  // Detener auto-updater (D7)
  cleanupUpdater();
  
  // Detener printer manager (D6)
  const printerManager = getPrinterManager();
  if (printerManager) {
    printerManager.destroy();
  }
  
  // Cerrar browser de Playwright (D6.2)
  if (rasterPrintManager) {
    await rasterPrintManager.cleanup();
    rasterPrintManager = null;
  }
  
  // Detener escpos manager (D6-USB)
  const escposManager = getEscposPrintManager();
  if (escposManager) {
    escposManager.destroy();
  }
  
  // Detener online monitor (D5)
  const onlineMonitor = getOnlineMonitor();
  if (onlineMonitor) {
    onlineMonitor.destroy();
  }
  
  // Detener task queue (D5)
  const taskQueue = getTaskQueue();
  if (taskQueue) {
    taskQueue.destroy();
  }
  
  // Detener backup scheduler
  const scheduler = getBackupScheduler();
  if (scheduler) {
    scheduler.destroy();
  }
  
  // Matar servidor local si existe
  if (localServer) {
    console.log('[App] Stopping local server...');
    await localServer.kill();
    localServer = null;
  }
  
  // D7.2: Solo detener PostgreSQL si está en modo APP_LIFETIME
  if (!isDev) {
    const pgConfig = loadRuntimeConfig();
    if (!pgConfig || pgConfig.runMode === 'APP_LIFETIME') {
      console.log('[App] Stopping embedded PostgreSQL (APP_LIFETIME mode)...');
      await shutdownPostgres();
    } else {
      console.log(`[App] PostgreSQL kept running (${pgConfig.runMode} mode)`);
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Al salir completamente
app.on('will-quit', async (event) => {
  // Ensure PostgreSQL is stopped (D7.1)
  if (!isDev) {
    await shutdownPostgres();
  }
  
  if (localServer) {
    event.preventDefault();
    console.log('[App] Stopping local server before quit...');
    await localServer.kill();
    localServer = null;
    app.quit();
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[App] Unhandled rejection at:', promise, 'reason:', reason);
});

// ============================================================================
// EXPORTS PARA TESTING
// ============================================================================

export { createMainWindow, mainWindow };
