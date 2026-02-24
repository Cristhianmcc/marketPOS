/**
 * D7.2 - Task Scheduler Registration
 * Registers PostgreSQL to run at user logon via Windows Task Scheduler
 * Does NOT require administrator privileges
 */

import { execSync, spawn } from 'child_process';
import { app } from 'electron';
import * as path from 'path';

// ============================================================================
// CONSTANTS
// ============================================================================

const TASK_NAME = 'Monterrial POS Postgres';
const TASK_DESCRIPTION = 'Inicia PostgreSQL embebido para Monterrial POS';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskSchedulerResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface TaskStatus {
  registered: boolean;
  running: boolean;
  nextRun?: string;
  lastRun?: string;
  lastResult?: number;
}

// ============================================================================
// TASK SCHEDULER OPERATIONS
// ============================================================================

/**
 * Get the path to the MarketPOS executable
 */
function getExecutablePath(): string {
  return app.getPath('exe');
}

/**
 * Register a scheduled task to run PostgreSQL at user logon
 * Uses schtasks.exe with /SC ONLOGON /RL LIMITED
 */
export async function registerTaskScheduler(): Promise<TaskSchedulerResult> {
  const exePath = getExecutablePath();
  
  console.log('[TaskScheduler] Registering task...');
  console.log(`[TaskScheduler] Executable: ${exePath}`);
  
  try {
    // First, remove any existing task with same name
    try {
      execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`, {
        encoding: 'utf-8',
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      // Task doesn't exist, that's fine
    }
    
    // Create the task
    // /SC ONLOGON - Run at user logon
    // /RL LIMITED - Run with limited privileges (no admin required)
    // /TR - Task to run
    // /F - Force create (overwrite if exists)
    const command = [
      'schtasks',
      '/Create',
      '/TN', `"${TASK_NAME}"`,
      '/SC', 'ONLOGON',
      '/RL', 'LIMITED',
      '/TR', `"\\"${exePath}\\" --pg-daemon"`,
      '/F',
    ].join(' ');
    
    console.log(`[TaskScheduler] Command: ${command}`);
    
    execSync(command, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    
    console.log('[TaskScheduler] Task registered successfully');
    
    return {
      success: true,
      message: 'Tarea programada registrada correctamente',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[TaskScheduler] Failed to register task:', errorMsg);
    
    return {
      success: false,
      message: 'Error al registrar tarea programada',
      error: errorMsg,
    };
  }
}

/**
 * Remove the scheduled task
 */
export async function removeTaskScheduler(): Promise<TaskSchedulerResult> {
  console.log('[TaskScheduler] Removing task...');
  
  try {
    execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    
    console.log('[TaskScheduler] Task removed successfully');
    
    return {
      success: true,
      message: 'Tarea programada eliminada correctamente',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check if task doesn't exist (not an error)
    if (errorMsg.includes('no existe') || errorMsg.includes('does not exist')) {
      return {
        success: true,
        message: 'La tarea ya no existía',
      };
    }
    
    console.error('[TaskScheduler] Failed to remove task:', errorMsg);
    
    return {
      success: false,
      message: 'Error al eliminar tarea programada',
      error: errorMsg,
    };
  }
}

/**
 * Check if the scheduled task is registered
 */
export async function getTaskStatus(): Promise<TaskStatus> {
  try {
    const output = execSync(`schtasks /Query /TN "${TASK_NAME}" /FO CSV /V`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    });
    
    // Parse CSV output
    const lines = output.trim().split('\n');
    if (lines.length < 2) {
      return { registered: false, running: false };
    }
    
    // Parse header and values
    const headers = parseCSVLine(lines[0]);
    const values = parseCSVLine(lines[1]);
    
    const getField = (name: string): string => {
      const index = headers.findIndex(h => 
        h.toLowerCase().includes(name.toLowerCase())
      );
      return index >= 0 ? values[index] : '';
    };
    
    const status = getField('Status') || getField('Estado');
    const nextRun = getField('Next Run') || getField('Próxima ejecución');
    const lastRun = getField('Last Run') || getField('Última ejecución');
    const lastResult = getField('Last Result') || getField('Último resultado');
    
    return {
      registered: true,
      running: status.toLowerCase().includes('running') || status.toLowerCase().includes('ejecut'),
      nextRun: nextRun || undefined,
      lastRun: lastRun !== 'N/A' ? lastRun : undefined,
      lastResult: lastResult ? parseInt(lastResult, 10) : undefined,
    };
  } catch (error) {
    // Task doesn't exist or error querying
    return {
      registered: false,
      running: false,
    };
  }
}

/**
 * Run the scheduled task immediately (for testing)
 */
export async function runTaskNow(): Promise<TaskSchedulerResult> {
  try {
    execSync(`schtasks /Run /TN "${TASK_NAME}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    });
    
    return {
      success: true,
      message: 'Tarea ejecutada',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al ejecutar tarea',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * End the running task
 */
export async function endTask(): Promise<TaskSchedulerResult> {
  try {
    execSync(`schtasks /End /TN "${TASK_NAME}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    });
    
    return {
      success: true,
      message: 'Tarea detenida',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al detener tarea',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Check if running as administrator
 */
export function isRunningAsAdmin(): boolean {
  try {
    // Try to access a protected registry key
    execSync('reg query HKU\\S-1-5-19', {
      encoding: 'utf-8',
      windowsHide: true,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
