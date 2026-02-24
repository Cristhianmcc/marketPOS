/**
 * D7 - Auto Updater Module
 * Handles automatic updates via GitHub Releases or custom server
 */

import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ============== Types ==============

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  version: string | null;
  error: string | null;
}

export interface UpdateConfig {
  autoDownload: boolean;
  autoInstallOnQuit: boolean;
  checkInterval: number; // minutes
  feedUrl?: string;      // custom update server
}

// ============== Update Manager ==============

class UpdateManager {
  private static instance: UpdateManager;
  private mainWindow: BrowserWindow | null = null;
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloaded: false,
    downloading: false,
    progress: 0,
    version: null,
    error: null,
  };
  private config: UpdateConfig = {
    autoDownload: true,
    autoInstallOnQuit: true,
    checkInterval: 60, // check every hour
  };
  private checkTimer: NodeJS.Timeout | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'update-config.json');
    this.loadConfig();
    this.setupAutoUpdater();
  }

  static getInstance(): UpdateManager {
    if (!UpdateManager.instance) {
      UpdateManager.instance = new UpdateManager();
    }
    return UpdateManager.instance;
  }

  // ============== Config ==============

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[Updater] Error loading config:', error);
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[Updater] Error saving config:', error);
    }
  }

  getConfig(): UpdateConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
    
    // Apply settings
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnQuit;
    
    if (this.config.feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: this.config.feedUrl });
    }
    
    // Restart check timer if interval changed
    this.startPeriodicCheck();
  }

  // ============== Setup ==============

  private setupAutoUpdater(): void {
    // Configure
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnQuit;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // Custom feed URL if configured
    if (this.config.feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: this.config.feedUrl });
    }

    // Events
    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for update...');
      this.status.checking = true;
      this.status.error = null;
      this.notifyRenderer();
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log('[Updater] Update available:', info.version);
      this.status.checking = false;
      this.status.available = true;
      this.status.version = info.version;
      this.notifyRenderer();
      
      // Show notification if not auto-downloading
      if (!this.config.autoDownload && this.mainWindow) {
        this.showUpdateAvailableDialog(info);
      }
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      console.log('[Updater] No update available. Current:', info.version);
      this.status.checking = false;
      this.status.available = false;
      this.notifyRenderer();
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      console.log(`[Updater] Download: ${progress.percent.toFixed(1)}%`);
      this.status.downloading = true;
      this.status.progress = progress.percent;
      this.notifyRenderer();
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log('[Updater] Update downloaded:', info.version);
      this.status.downloading = false;
      this.status.downloaded = true;
      this.status.progress = 100;
      this.notifyRenderer();
      
      // Show install dialog
      if (this.mainWindow) {
        this.showInstallDialog(info);
      }
    });

    autoUpdater.on('error', (error: Error) => {
      console.error('[Updater] Error:', error.message);
      this.status.checking = false;
      this.status.downloading = false;
      this.status.error = error.message;
      this.notifyRenderer();
    });
  }

  // ============== Main Window ==============

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private notifyRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status', this.status);
    }
  }

  // ============== Dialogs ==============

  private async showUpdateAvailableDialog(info: UpdateInfo): Promise<void> {
    if (!this.mainWindow) return;

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Actualización Disponible',
      message: `Versión ${info.version} está disponible`,
      detail: `Versión actual: ${app.getVersion()}\n\n¿Desea descargar la actualización ahora?`,
      buttons: ['Descargar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.downloadUpdate();
    }
  }

  private async showInstallDialog(info: UpdateInfo): Promise<void> {
    if (!this.mainWindow) return;

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Actualización Lista',
      message: `Versión ${info.version} descargada`,
      detail: 'La actualización se instalará al reiniciar la aplicación.\n\n¿Desea reiniciar ahora?',
      buttons: ['Reiniciar Ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.installUpdate();
    }
  }

  // ============== Actions ==============

  async checkForUpdates(silent: boolean = false): Promise<UpdateStatus> {
    try {
      if (this.status.checking) {
        return this.status;
      }

      await autoUpdater.checkForUpdates();
      return this.status;
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Unknown error';
      this.status.checking = false;
      
      if (!silent && this.mainWindow) {
        dialog.showErrorBox('Error de Actualización', this.status.error);
      }
      
      return this.status;
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('[Updater] Download error:', error);
      this.status.error = error instanceof Error ? error.message : 'Download failed';
      this.notifyRenderer();
    }
  }

  installUpdate(): void {
    // This will quit and install
    autoUpdater.quitAndInstall(false, true);
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  getVersion(): string {
    return app.getVersion();
  }

  // ============== Periodic Check ==============

  startPeriodicCheck(): void {
    // Clear existing timer
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    // Check immediately on start (after a delay)
    setTimeout(() => {
      this.checkForUpdates(true);
    }, 30000); // Wait 30 seconds after app start

    // Then check periodically
    const intervalMs = this.config.checkInterval * 60 * 1000;
    this.checkTimer = setInterval(() => {
      this.checkForUpdates(true);
    }, intervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // ============== Cleanup ==============

  cleanup(): void {
    this.stopPeriodicCheck();
    this.mainWindow = null;
  }
}

// ============== IPC Handlers ==============

export function setupUpdaterIpcHandlers(): void {
  const updater = UpdateManager.getInstance();

  ipcMain.handle('updater:check', async () => {
    return updater.checkForUpdates(false);
  });

  ipcMain.handle('updater:check-silent', async () => {
    return updater.checkForUpdates(true);
  });

  ipcMain.handle('updater:download', async () => {
    await updater.downloadUpdate();
    return updater.getStatus();
  });

  ipcMain.handle('updater:install', () => {
    updater.installUpdate();
  });

  ipcMain.handle('updater:get-status', () => {
    return updater.getStatus();
  });

  ipcMain.handle('updater:get-version', () => {
    return updater.getVersion();
  });

  ipcMain.handle('updater:get-config', () => {
    return updater.getConfig();
  });

  ipcMain.handle('updater:update-config', (_event, config: Partial<UpdateConfig>) => {
    updater.updateConfig(config);
    return updater.getConfig();
  });
}

// ============== Initialization ==============

export function initUpdater(mainWindow: BrowserWindow): UpdateManager {
  const updater = UpdateManager.getInstance();
  updater.setMainWindow(mainWindow);
  updater.startPeriodicCheck();
  return updater;
}

export function cleanupUpdater(): void {
  UpdateManager.getInstance().cleanup();
}

export { UpdateManager };
