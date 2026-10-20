/**
 * D7 - Auto Updater
 * The update destination is embedded in the packaged release manifest.
 * Renderer input can only change user preferences, never the download origin.
 */

import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface UpdateStatus {
  configured: boolean;
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
  checkInterval: number;
}

const DEFAULT_CONFIG: UpdateConfig = {
  autoDownload: true,
  autoInstallOnQuit: true,
  checkInterval: 60,
};

function normalizeConfig(input: unknown, current: UpdateConfig = DEFAULT_CONFIG): UpdateConfig {
  if (!input || typeof input !== 'object') return { ...current };
  const candidate = input as Record<string, unknown>;
  const parsedInterval = Number(candidate.checkInterval);
  const checkInterval = Number.isFinite(parsedInterval)
    ? Math.min(1440, Math.max(15, Math.round(parsedInterval)))
    : current.checkInterval;

  return {
    autoDownload:
      typeof candidate.autoDownload === 'boolean'
        ? candidate.autoDownload
        : current.autoDownload,
    autoInstallOnQuit:
      typeof candidate.autoInstallOnQuit === 'boolean'
        ? candidate.autoInstallOnQuit
        : current.autoInstallOnQuit,
    checkInterval,
  };
}

function trustedHttpsUrl(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function loadPackagedUpdateOrigin(): string | null {
  try {
    if (!app.isPackaged) {
      return trustedHttpsUrl(process.env.MONTERIAL_UPDATE_FEED_URL);
    }

    const manifestPath = path.join(process.resourcesPath, 'release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      updateFeed?: unknown;
    };
    return trustedHttpsUrl(manifest.updateFeed);
  } catch (error) {
    console.warn('[Updater] Updates disabled: release manifest has no trusted HTTPS origin');
    return null;
  }
}

class UpdateManager {
  private static instance: UpdateManager;
  private mainWindow: BrowserWindow | null = null;
  private readonly trustedUpdateOrigin: string | null;
  private status: UpdateStatus;
  private config: UpdateConfig = { ...DEFAULT_CONFIG };
  private checkTimer: NodeJS.Timeout | null = null;
  private initialCheckTimer: NodeJS.Timeout | null = null;
  private readonly configPath: string;

  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'update-config.json');
    this.trustedUpdateOrigin = loadPackagedUpdateOrigin();
    this.status = {
      configured: Boolean(this.trustedUpdateOrigin),
      checking: false,
      available: false,
      downloaded: false,
      downloading: false,
      progress: 0,
      version: null,
      error: null,
    };
    this.loadConfig();
    this.setupAutoUpdater();
  }

  static getInstance(): UpdateManager {
    if (!UpdateManager.instance) {
      UpdateManager.instance = new UpdateManager();
    }
    return UpdateManager.instance;
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.config = normalizeConfig(data, this.config);
      }
    } catch (error) {
      console.error('[Updater] Error loading preferences:', error);
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[Updater] Error saving preferences:', error);
    }
  }

  getConfig(): UpdateConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<UpdateConfig>): void {
    this.config = normalizeConfig(config, this.config);
    this.saveConfig();
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnQuit;
    this.startPeriodicCheck();
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnQuit;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    if (this.trustedUpdateOrigin) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: this.trustedUpdateOrigin,
      });
    }

    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.status.error = null;
      this.notifyRenderer();
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.version = info.version;
      this.notifyRenderer();

      if (!this.config.autoDownload && this.mainWindow) {
        void this.showUpdateAvailableDialog(info);
      }
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.status.checking = false;
      this.status.available = false;
      this.status.version = info.version;
      this.notifyRenderer();
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.status.downloading = true;
      this.status.progress = progress.percent;
      this.notifyRenderer();
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.status.downloading = false;
      this.status.downloaded = true;
      this.status.progress = 100;
      this.status.version = info.version;
      this.notifyRenderer();

      if (this.mainWindow) {
        void this.showInstallDialog(info);
      }
    });

    autoUpdater.on('error', (error: Error) => {
      this.status.checking = false;
      this.status.downloading = false;
      this.status.error = error.message;
      this.notifyRenderer();
    });
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private notifyRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status', { ...this.status });
    }
  }

  private async showUpdateAvailableDialog(info: UpdateInfo): Promise<void> {
    if (!this.mainWindow) return;

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Actualización disponible',
      message: `La versión ${info.version} está disponible`,
      detail: `Versión actual: ${app.getVersion()}\n\n¿Desea descargarla ahora?`,
      buttons: ['Descargar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      await this.downloadUpdate();
    }
  }

  private async showInstallDialog(info: UpdateInfo): Promise<void> {
    if (!this.mainWindow) return;

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `La versión ${info.version} fue descargada`,
      detail: 'Se instalará al reiniciar la aplicación.\n\n¿Desea reiniciar ahora?',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.installUpdate();
    }
  }

  async checkForUpdates(silent = false): Promise<UpdateStatus> {
    if (!this.trustedUpdateOrigin) {
      this.status.error = 'Actualizaciones automáticas no configuradas para esta compilación.';
      this.status.checking = false;
      this.notifyRenderer();
      if (!silent && this.mainWindow) {
        dialog.showErrorBox('Actualizaciones deshabilitadas', this.status.error);
      }
      return { ...this.status };
    }

    try {
      if (!this.status.checking) {
        await autoUpdater.checkForUpdates();
      }
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Error desconocido';
      this.status.checking = false;
      this.notifyRenderer();
      if (!silent && this.mainWindow) {
        dialog.showErrorBox('Error de actualización', this.status.error);
      }
    }

    return { ...this.status };
  }

  async downloadUpdate(): Promise<void> {
    if (!this.trustedUpdateOrigin || !this.status.available) return;

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'No se pudo descargar';
      this.notifyRenderer();
    }
  }

  installUpdate(): void {
    if (this.status.downloaded) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  getVersion(): string {
    return app.getVersion();
  }

  startPeriodicCheck(): void {
    this.stopPeriodicCheck();
    if (!this.trustedUpdateOrigin) return;

    this.initialCheckTimer = setTimeout(() => {
      void this.checkForUpdates(true);
    }, 30000);

    this.checkTimer = setInterval(() => {
      void this.checkForUpdates(true);
    }, this.config.checkInterval * 60 * 1000);
  }

  stopPeriodicCheck(): void {
    if (this.initialCheckTimer) {
      clearTimeout(this.initialCheckTimer);
      this.initialCheckTimer = null;
    }
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  cleanup(): void {
    this.stopPeriodicCheck();
    this.mainWindow = null;
  }
}

export function setupUpdaterIpcHandlers(): void {
  const updater = UpdateManager.getInstance();

  ipcMain.handle('updater:check', () => updater.checkForUpdates(false));
  ipcMain.handle('updater:check-silent', () => updater.checkForUpdates(true));
  ipcMain.handle('updater:download', async () => {
    await updater.downloadUpdate();
    return updater.getStatus();
  });
  ipcMain.handle('updater:install', () => updater.installUpdate());
  ipcMain.handle('updater:get-status', () => updater.getStatus());
  ipcMain.handle('updater:get-version', () => updater.getVersion());
  ipcMain.handle('updater:get-config', () => updater.getConfig());
  ipcMain.handle('updater:update-config', (_event, config: Partial<UpdateConfig>) => {
    updater.updateConfig(config);
    return updater.getConfig();
  });
}

export function initUpdater(mainWindow: BrowserWindow): UpdateManager {
  const updater = UpdateManager.getInstance();
  updater.setMainWindow(mainWindow);
  updater.startPeriodicCheck();
  return updater;
}

export function cleanupUpdater(): void {
  UpdateManager.getInstance().cleanup();
}

export { UpdateManager, normalizeConfig, trustedHttpsUrl };
