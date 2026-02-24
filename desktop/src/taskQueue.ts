/**
 * MÓDULO D5: Task Queue Offline
 * 
 * Cola de tareas para operaciones que requieren internet:
 * - SUNAT: jobs de envío
 * - Cloudinary: uploads de imágenes
 * 
 * Las tareas se encolan cuando no hay internet
 * y se procesan automáticamente cuando vuelve.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import { getOnlineMonitor } from './onlineMonitor';

// ============================================================================
// TIPOS
// ============================================================================

export type TaskType = 'sunat_send' | 'cloudinary_upload' | 'sync_data';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface QueuedTask {
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

export interface TaskQueueConfig {
  processIntervalMs: number;     // Intervalo de procesamiento (30s)
  maxRetries: number;            // Reintentos máximos por tarea
  retryDelayMs: number;          // Delay entre reintentos
  serverUrl: string;             // URL del servidor local
}

export interface TaskQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: TaskQueueConfig = {
  processIntervalMs: 30000,      // 30 segundos
  maxRetries: 5,
  retryDelayMs: 60000,           // 1 minuto
  serverUrl: 'http://localhost:3000',
};

// ============================================================================
// TASK QUEUE CLASS
// ============================================================================

export class TaskQueue {
  private config: TaskQueueConfig;
  private tasks: Map<string, QueuedTask> = new Map();
  private queuePath: string;
  private processInterval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private mainWindow: BrowserWindow | null = null;
  private authToken: string | null = null;

  constructor(config: Partial<TaskQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queuePath = path.join(app.getPath('userData'), 'task-queue.json');
    this.loadQueue();
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE
  // --------------------------------------------------------------------------

  private loadQueue(): void {
    try {
      if (fs.existsSync(this.queuePath)) {
        const data = fs.readFileSync(this.queuePath, 'utf-8');
        const tasks: QueuedTask[] = JSON.parse(data);
        
        for (const task of tasks) {
          // Reset processing tasks to pending on startup
          if (task.status === 'processing') {
            task.status = 'pending';
          }
          this.tasks.set(task.id, task);
        }
        
        console.log(`[TaskQueue] Loaded ${this.tasks.size} tasks from disk`);
      }
    } catch (error) {
      console.error('[TaskQueue] Error loading queue:', error);
    }
  }

  private saveQueue(): void {
    try {
      const tasks = Array.from(this.tasks.values());
      const dir = path.dirname(this.queuePath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.queuePath, JSON.stringify(tasks, null, 2));
    } catch (error) {
      console.error('[TaskQueue] Error saving queue:', error);
    }
  }

  // --------------------------------------------------------------------------
  // WINDOW & AUTH
  // --------------------------------------------------------------------------

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  // --------------------------------------------------------------------------
  // TASK MANAGEMENT
  // --------------------------------------------------------------------------

  enqueue(type: TaskType, payload: Record<string, unknown>): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: QueuedTask = {
      id,
      type,
      status: 'pending',
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: this.config.maxRetries,
    };

    this.tasks.set(id, task);
    this.saveQueue();
    
    console.log(`[TaskQueue] Enqueued ${type} task: ${id}`);
    this.notifyUI('task:enqueued', task);

    return id;
  }

  getTask(id: string): QueuedTask | undefined {
    return this.tasks.get(id);
  }

  getPendingTasks(): QueuedTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getStats(): TaskQueueStats {
    const tasks = Array.from(this.tasks.values());
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      processing: tasks.filter(t => t.status === 'processing').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      total: tasks.length,
    };
  }

  // --------------------------------------------------------------------------
  // TASK PROCESSING
  // --------------------------------------------------------------------------

  async processTask(task: QueuedTask): Promise<boolean> {
    const monitor = getOnlineMonitor();
    
    // No procesar si estamos offline
    if (monitor && !monitor.isOnline()) {
      console.log(`[TaskQueue] Skipping ${task.id} - offline`);
      return false;
    }

    task.status = 'processing';
    task.attempts++;
    task.lastAttempt = new Date().toISOString();
    this.saveQueue();
    this.notifyUI('task:processing', task);

    try {
      let success = false;

      switch (task.type) {
        case 'sunat_send':
          success = await this.processSunatTask(task);
          break;
        case 'cloudinary_upload':
          success = await this.processCloudinaryTask(task);
          break;
        case 'sync_data':
          success = await this.processSyncTask(task);
          break;
        default:
          console.error(`[TaskQueue] Unknown task type: ${task.type}`);
          success = false;
      }

      if (success) {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        console.log(`[TaskQueue] Task completed: ${task.id}`);
        this.notifyUI('task:completed', task);
      } else {
        throw new Error('Task processing returned false');
      }

      this.saveQueue();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      task.error = errorMessage;

      if (task.attempts >= task.maxAttempts) {
        task.status = 'failed';
        console.error(`[TaskQueue] Task failed permanently: ${task.id} - ${errorMessage}`);
        this.notifyUI('task:failed', task);
      } else {
        task.status = 'pending'; // Retry later
        console.warn(`[TaskQueue] Task will retry (${task.attempts}/${task.maxAttempts}): ${task.id}`);
        this.notifyUI('task:retry', task);
      }

      this.saveQueue();
      return false;
    }
  }

  private async processSunatTask(task: QueuedTask): Promise<boolean> {
    const { jobId } = task.payload as { jobId: string };
    
    // Llamar al endpoint de procesamiento de SUNAT job
    const response = await fetch(`${this.config.serverUrl}/api/sunat/jobs/${jobId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-desktop-app': 'true',
        ...(this.authToken && { Cookie: this.authToken }),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return true;
  }

  private async processCloudinaryTask(task: QueuedTask): Promise<boolean> {
    const { productId, imageData, imageName } = task.payload as { 
      productId: string; 
      imageData: string; 
      imageName: string;
    };

    // Convert base64 to blob
    const response = await fetch(`${this.config.serverUrl}/api/products/${productId}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-desktop-app': 'true',
        ...(this.authToken && { Cookie: this.authToken }),
      },
      body: JSON.stringify({
        imageData,
        imageName,
        source: 'offline-queue',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return true;
  }

  private async processSyncTask(task: QueuedTask): Promise<boolean> {
    // Generic sync task - call sync endpoint
    const response = await fetch(`${this.config.serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-desktop-app': 'true',
        ...(this.authToken && { Cookie: this.authToken }),
      },
      body: JSON.stringify(task.payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // QUEUE PROCESSOR
  // --------------------------------------------------------------------------

  async processPendingTasks(): Promise<void> {
    if (this.isProcessing) return;

    const monitor = getOnlineMonitor();
    if (monitor && !monitor.isOnline()) {
      return;
    }

    this.isProcessing = true;

    try {
      const pending = this.getPendingTasks();
      
      if (pending.length > 0) {
        console.log(`[TaskQueue] Processing ${pending.length} pending tasks`);
        
        for (const task of pending) {
          // Check online before each task
          if (monitor && !monitor.isOnline()) {
            console.log('[TaskQueue] Went offline during processing, stopping');
            break;
          }

          await this.processTask(task);
          
          // Small delay between tasks
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------------------------

  start(): void {
    if (this.processInterval) return;

    console.log(`[TaskQueue] Starting with ${this.config.processIntervalMs}ms interval`);

    // Subscribe to online status changes
    const monitor = getOnlineMonitor();
    if (monitor) {
      monitor.onStatusChange((isOnline) => {
        if (isOnline) {
          console.log('[TaskQueue] Online - processing pending tasks');
          this.processPendingTasks();
        }
      });
    }

    // Periodic processing
    this.processInterval = setInterval(() => {
      this.processPendingTasks();
    }, this.config.processIntervalMs);

    // Initial processing
    this.processPendingTasks();
  }

  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
      console.log('[TaskQueue] Stopped');
    }
  }

  // --------------------------------------------------------------------------
  // UI NOTIFICATIONS
  // --------------------------------------------------------------------------

  private notifyUI(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed') {
        this.tasks.delete(id);
      }
    }
    this.saveQueue();
  }

  retryFailed(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'failed') {
        task.status = 'pending';
        task.attempts = 0;
        task.error = undefined;
      }
    }
    this.saveQueue();
    this.processPendingTasks();
  }

  destroy(): void {
    this.stop();
    this.saveQueue();
    this.mainWindow = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let taskQueueInstance: TaskQueue | null = null;

export function initTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
  if (!taskQueueInstance) {
    taskQueueInstance = new TaskQueue(config);
  }
  return taskQueueInstance;
}

export function getTaskQueue(): TaskQueue | null {
  return taskQueueInstance;
}
