/**
 * D7.1 - Stop PostgreSQL Server
 * Manages PostgreSQL server shutdown
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPgCtlPath,
  PgRuntimeConfig,
} from './pgPaths';
import { checkPostgresStatus, getPostmasterPid } from './startPostgres';

// ============================================================================
// STOP POSTGRES
// ============================================================================

export interface StopResult {
  success: boolean;
  message: string;
  error?: string;
  wasRunning: boolean;
}

/**
 * Stop the PostgreSQL server
 * @param config Runtime configuration
 * @param mode Stop mode: 'fast' (default), 'smart', or 'immediate'
 * @returns Result of shutdown
 */
export async function stopPostgres(
  config: PgRuntimeConfig,
  mode: 'fast' | 'smart' | 'immediate' = 'fast'
): Promise<StopResult> {
  const { dataDir } = config.pg;
  const pgCtlPath = getPgCtlPath();
  
  console.log('[stopPostgres] Stopping PostgreSQL server...');
  
  // Check if pg_ctl exists
  if (!fs.existsSync(pgCtlPath)) {
    return {
      success: false,
      message: 'PostgreSQL binaries not found',
      error: `pg_ctl not found at: ${pgCtlPath}`,
      wasRunning: false,
    };
  }
  
  // Check if server is running
  const status = await checkPostgresStatus(config);
  if (!status.running) {
    console.log('[stopPostgres] PostgreSQL is not running');
    return {
      success: true,
      message: 'PostgreSQL is not running',
      wasRunning: false,
    };
  }
  
  console.log(`[stopPostgres] PostgreSQL is running (PID: ${status.pid})`);
  
  // Run pg_ctl stop
  const result = await runPgCtlStop(pgCtlPath, dataDir, mode);
  
  return {
    ...result,
    wasRunning: true,
  };
}

/**
 * Run pg_ctl stop command
 */
async function runPgCtlStop(
  pgCtlPath: string,
  dataDir: string,
  mode: 'fast' | 'smart' | 'immediate'
): Promise<StopResult> {
  return new Promise((resolve) => {
    const args = [
      'stop',
      '-D', dataDir,
      '-m', mode,
      '-w', // Wait for shutdown
      '-t', '30', // Timeout seconds
    ];
    
    console.log(`[stopPostgres] Running: ${pgCtlPath} ${args.join(' ')}`);
    
    const proc = spawn(pgCtlPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      resolve({
        success: false,
        message: 'Failed to run pg_ctl',
        error: err.message,
        wasRunning: true,
      });
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[stopPostgres] PostgreSQL stopped successfully');
        resolve({
          success: true,
          message: 'PostgreSQL stopped successfully',
          wasRunning: true,
        });
      } else {
        resolve({
          success: false,
          message: 'pg_ctl stop failed',
          error: stderr || stdout,
          wasRunning: true,
        });
      }
    });
    
    // Timeout after 60 seconds
    setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        message: 'pg_ctl stop timed out',
        error: 'Process timed out after 60 seconds',
        wasRunning: true,
      });
    }, 60000);
  });
}

/**
 * Force kill PostgreSQL if pg_ctl stop fails
 */
export async function forceKillPostgres(config: PgRuntimeConfig): Promise<StopResult> {
  const { dataDir } = config.pg;
  
  console.log('[stopPostgres] Attempting force kill...');
  
  // Get PID from postmaster.pid
  const pid = getPostmasterPid(dataDir);
  
  if (!pid) {
    return {
      success: true,
      message: 'No PostgreSQL process found to kill',
      wasRunning: false,
    };
  }
  
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      execSync(`kill -9 ${pid}`, {
        stdio: 'ignore',
      });
    }
    
    // Clean up postmaster.pid
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    
    console.log(`[stopPostgres] Force killed PostgreSQL (PID: ${pid})`);
    
    return {
      success: true,
      message: `Force killed PostgreSQL (PID: ${pid})`,
      wasRunning: true,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to force kill PostgreSQL',
      error: error instanceof Error ? error.message : String(error),
      wasRunning: true,
    };
  }
}

/**
 * Stop PostgreSQL with retry and force kill fallback
 */
export async function stopPostgresWithRetry(
  config: PgRuntimeConfig,
  maxRetries: number = 3
): Promise<StopResult> {
  // First try graceful stop
  let result = await stopPostgres(config, 'fast');
  
  if (result.success) {
    return result;
  }
  
  // Retry with immediate mode
  console.log('[stopPostgres] Retrying with immediate mode...');
  result = await stopPostgres(config, 'immediate');
  
  if (result.success) {
    return result;
  }
  
  // Force kill as last resort
  console.log('[stopPostgres] Falling back to force kill...');
  return forceKillPostgres(config);
}
