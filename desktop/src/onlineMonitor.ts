/**
 * MÓDULO D5: Online Monitor
 * 
 * Detecta estado de conexión a internet para modo offline.
 * - Ping a endpoint configurable
 * - Notificaciones de cambio de estado
 * - Integración con task queue
 */

import { BrowserWindow } from 'electron';

// ============================================================================
// TIPOS
// ============================================================================

export interface OnlineStatus {
  isOnline: boolean;
  lastCheck: Date;
  lastOnline: Date | null;
  consecutiveFailures: number;
}

export interface OnlineMonitorConfig {
  checkIntervalMs: number;       // Intervalo de verificación (default: 30s)
  pingUrl: string;               // URL a verificar
  pingTimeoutMs: number;         // Timeout del ping (default: 5s)
  failuresBeforeOffline: number; // Fallos consecutivos para declarar offline
}

type OnlineChangeCallback = (isOnline: boolean) => void;

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: OnlineMonitorConfig = {
  checkIntervalMs: 30000,        // 30 segundos
  pingUrl: 'https://www.google.com/favicon.ico',
  pingTimeoutMs: 5000,           // 5 segundos
  failuresBeforeOffline: 2,      // 2 fallos = offline
};

// ============================================================================
// ONLINE MONITOR CLASS
// ============================================================================

export class OnlineMonitor {
  private config: OnlineMonitorConfig;
  private status: OnlineStatus;
  private checkInterval: NodeJS.Timeout | null = null;
  private callbacks: Set<OnlineChangeCallback> = new Set();
  private mainWindow: BrowserWindow | null = null;

  constructor(config: Partial<OnlineMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = {
      isOnline: true, // Asumimos online inicialmente
      lastCheck: new Date(),
      lastOnline: new Date(),
      consecutiveFailures: 0,
    };
  }

  // --------------------------------------------------------------------------
  // WINDOW REFERENCE
  // --------------------------------------------------------------------------

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // --------------------------------------------------------------------------
  // CALLBACKS
  // --------------------------------------------------------------------------

  onStatusChange(callback: OnlineChangeCallback): void {
    this.callbacks.add(callback);
  }

  offStatusChange(callback: OnlineChangeCallback): void {
    this.callbacks.delete(callback);
  }

  private notifyStatusChange(isOnline: boolean): void {
    // Notificar callbacks
    for (const callback of this.callbacks) {
      try {
        callback(isOnline);
      } catch (error) {
        console.error('[OnlineMonitor] Callback error:', error);
      }
    }

    // Notificar al renderer via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('online:status-changed', {
        isOnline,
        lastCheck: this.status.lastCheck.toISOString(),
        lastOnline: this.status.lastOnline?.toISOString(),
      });
    }
  }

  // --------------------------------------------------------------------------
  // PING CHECK
  // --------------------------------------------------------------------------

  async checkOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.pingTimeoutMs);

      const response = await fetch(this.config.pingUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store',
        },
      });

      clearTimeout(timeout);

      this.status.lastCheck = new Date();

      if (response.ok) {
        this.status.consecutiveFailures = 0;
        this.status.lastOnline = new Date();

        // Si estábamos offline y ahora online, notificar
        if (!this.status.isOnline) {
          this.status.isOnline = true;
          console.log('[OnlineMonitor] Connection restored');
          this.notifyStatusChange(true);
        }

        return true;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.status.lastCheck = new Date();
      this.status.consecutiveFailures++;

      console.log(`[OnlineMonitor] Check failed (${this.status.consecutiveFailures}/${this.config.failuresBeforeOffline})`);

      // Solo declarar offline después de N fallos consecutivos
      if (this.status.isOnline && this.status.consecutiveFailures >= this.config.failuresBeforeOffline) {
        this.status.isOnline = false;
        console.log('[OnlineMonitor] Connection lost');
        this.notifyStatusChange(false);
      }

      return false;
    }
  }

  // --------------------------------------------------------------------------
  // MONITOR LIFECYCLE
  // --------------------------------------------------------------------------

  start(): void {
    if (this.checkInterval) return;

    console.log(`[OnlineMonitor] Starting with ${this.config.checkIntervalMs}ms interval`);

    // Check inicial
    this.checkOnline();

    // Checks periódicos
    this.checkInterval = setInterval(() => {
      this.checkOnline();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[OnlineMonitor] Stopped');
    }
  }

  // --------------------------------------------------------------------------
  // GETTERS
  // --------------------------------------------------------------------------

  getStatus(): OnlineStatus {
    return { ...this.status };
  }

  isOnline(): boolean {
    return this.status.isOnline;
  }

  // --------------------------------------------------------------------------
  // CONFIG UPDATE
  // --------------------------------------------------------------------------

  updateConfig(updates: Partial<OnlineMonitorConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Reiniciar si está corriendo
    if (this.checkInterval) {
      this.stop();
      this.start();
    }
  }

  getConfig(): OnlineMonitorConfig {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  destroy(): void {
    this.stop();
    this.callbacks.clear();
    this.mainWindow = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let onlineMonitorInstance: OnlineMonitor | null = null;

export function initOnlineMonitor(config?: Partial<OnlineMonitorConfig>): OnlineMonitor {
  if (!onlineMonitorInstance) {
    onlineMonitorInstance = new OnlineMonitor(config);
  }
  return onlineMonitorInstance;
}

export function getOnlineMonitor(): OnlineMonitor | null {
  return onlineMonitorInstance;
}
