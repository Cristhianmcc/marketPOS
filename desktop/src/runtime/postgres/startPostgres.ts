/**
 * D7.1 - Start PostgreSQL Server
 * Manages PostgreSQL server startup
 */

import { execSync, execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPgCtlPath,
  getPgIsReadyPath,
  getPgLogPath,
  getLogsDir,
  PgRuntimeConfig,
} from './pgPaths';
import { waitForPort, isPortInUse } from './findFreePort';

// ============================================================================
// START POSTGRES
// ============================================================================

export interface StartResult {
  success: boolean;
  message: string;
  error?: string;
  alreadyRunning?: boolean;
}

/**
 * Start the PostgreSQL server
 * @param config Runtime configuration
 * @returns Result of startup
 */
export async function startPostgres(config: PgRuntimeConfig): Promise<StartResult> {
  const { port, dataDir } = config.pg;
  const pgCtlPath = getPgCtlPath();
  const logPath = getPgLogPath();
  
  console.log('[startPostgres] Starting PostgreSQL server...');
  console.log(`[startPostgres] Data dir: ${dataDir}`);
  console.log(`[startPostgres] Port: ${port}`);
  
  // Check if pg_ctl exists
  if (!fs.existsSync(pgCtlPath)) {
    return {
      success: false,
      message: 'PostgreSQL binaries not found',
      error: `pg_ctl not found at: ${pgCtlPath}`,
    };
  }
  
  // Check if already running on the port
  if (await isPortInUse(port)) {
    console.log(`[startPostgres] Port ${port} is already in use`);
    
    // Check if it's our Postgres
    const statusResult = await checkPostgresStatus(config);
    if (statusResult.running) {
      return {
        success: true,
        message: 'PostgreSQL already running',
        alreadyRunning: true,
      };
    }
    
    // Something else is using the port
    return {
      success: false,
      message: `Port ${port} is in use by another process`,
      error: 'Choose a different port or stop the conflicting process',
    };
  }
  
  // Ensure logs directory exists
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Pre-start cleanup: kill stale processes and fix log file
  await preStartCleanup(dataDir, logPath);
  
  // Start PostgreSQL
  const result = await runPgCtlStart(pgCtlPath, dataDir, port, logPath);
  
  if (!result.success) {
    return result;
  }
  
  // Wait for server to be ready
  console.log('[startPostgres] Waiting for server to be ready...');
  const ready = await waitForPostgresReady(config, 15000);
  
  if (!ready) {
    return {
      success: false,
      message: 'PostgreSQL failed to start in time',
      error: 'Server did not respond within 15 seconds',
    };
  }
  
  console.log('[startPostgres] PostgreSQL is ready');
  
  return {
    success: true,
    message: 'PostgreSQL started successfully',
  };
}

/**
 * Pre-start cleanup: kill stale postgres processes, remove postmaster.pid,
 * and rotate the log file if it is locked by a dead process.
 */
async function preStartCleanup(dataDir: string, logPath: string): Promise<void> {
  console.log('[startPostgres] Running pre-start cleanup...');

  // 1. Read postmaster.pid and kill the process if it exists
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const content = fs.readFileSync(pidFile, 'utf-8');
      const pid = parseInt(content.split('\n')[0].trim(), 10);

      if (!isNaN(pid) && pid > 0) {
        console.log(`[startPostgres] Killing stale postgres process PID ${pid}...`);
        try {
          // Windows: taskkill
          spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {
            windowsHide: true,
            timeout: 5000,
          });
        } catch {
          // Ignore errors - process may already be dead
        }
        // Also kill by image name as fallback
        try {
          spawnSync('taskkill', ['/IM', 'postgres.exe', '/F', '/T'], {
            windowsHide: true,
            timeout: 5000,
          });
        } catch {
          // Ignore
        }
        // Wait for the process to die
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.log('[startPostgres] Could not read postmaster.pid:', e);
    }

    // Remove the stale pid file
    try {
      fs.unlinkSync(pidFile);
      console.log('[startPostgres] Removed stale postmaster.pid');
    } catch (e) {
      console.log('[startPostgres] Could not remove postmaster.pid:', e);
    }
  }

  // Remove postmaster.opts if exists
  const optsFile = path.join(dataDir, 'postmaster.opts');
  if (fs.existsSync(optsFile)) {
    try { fs.unlinkSync(optsFile); } catch { /* ignore */ }
  }

  // 2. Handle log file: if it exists and is locked, rotate it
  if (fs.existsSync(logPath)) {
    let isLocked = false;
    try {
      // Try to open for writing
      const fd = fs.openSync(logPath, 'a');
      fs.closeSync(fd);
    } catch {
      isLocked = true;
    }

    if (isLocked) {
      // Rename old log file and start fresh
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = logPath.replace('.log', `-${timestamp}.log`);
      try {
        fs.renameSync(logPath, rotatedPath);
        console.log(`[startPostgres] Rotated locked log file to ${rotatedPath}`);
      } catch {
        // If rename fails, just delete it
        try { fs.unlinkSync(logPath); } catch { /* ignore */ }
        console.log('[startPostgres] Deleted locked log file');
      }
    }
  }

  console.log('[startPostgres] Pre-start cleanup done');
}

/**
 * Run pg_ctl start command
 * Uses spawn instead of execSync for better timeout handling
 */
async function runPgCtlStart(
  pgCtlPath: string,
  dataDir: string,
  port: number,
  logPath: string
): Promise<StartResult> {
  // First, verify data directory exists and has required files
  if (!fs.existsSync(dataDir)) {
    return {
      success: false,
      message: 'Data directory does not exist',
      error: `Data directory not found: ${dataDir}. PostgreSQL cluster was not initialized.`,
    };
  }
  
  const pgVersionPath = path.join(dataDir, 'PG_VERSION');
  if (!fs.existsSync(pgVersionPath)) {
    return {
      success: false,
      message: 'PostgreSQL cluster not initialized',
      error: `PG_VERSION not found in ${dataDir}. Run initdb first.`,
    };
  }
  
  const args = [
    'start',
    '-D', dataDir,
    '-l', logPath,
    '-w', // Wait for startup
    '-t', '60', // Timeout seconds (increased)
    '-o', `-p ${port} -h 127.0.0.1`,
  ];

  console.log(`[startPostgres] Running: "${pgCtlPath}" ${args.join(' ')}`);

  try {
    // Try to start PostgreSQL
    const result = execFileSync(pgCtlPath, args, {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 90000, // 90 seconds to allow pg_ctl's 60s timeout
    });
    
    console.log(`[startPostgres] pg_ctl output: ${result}`);

    return {
      success: true,
      message: 'pg_ctl start completed',
    };
  } catch (error: unknown) {
    const err = error as Error & { message?: string; stdout?: string; stderr?: string; code?: string };
    
    console.log(`[startPostgres] pg_ctl threw error, checking if server actually started...`);
    console.log(`[startPostgres] Error code: ${err.code}, stdout: ${err.stdout}`);
    
    // IMPORTANT: Even if pg_ctl throws, the server might have started!
    // Check if it's actually running before reporting failure
    const isRunning = await checkIfPostgresRunning(port, dataDir);
    
    if (isRunning) {
      console.log(`[startPostgres] Server IS running despite the error - SUCCESS`);
      return {
        success: true,
        message: 'PostgreSQL started (verified running)',
      };
    }
    
    // Server really didn't start - collect error info
    let logContent = '';
    try {
      if (fs.existsSync(logPath)) {
        const fullLog = fs.readFileSync(logPath, 'utf-8');
        const lines = fullLog.split('\n');
        logContent = lines.slice(-20).join('\n');
      }
    } catch (logErr) {
      logContent = 'Could not read postgres log';
    }
    
    const fullError = [
      `Command failed: "${pgCtlPath}" ${args.join(' ')}`,
      err.message || 'Unknown error',
      err.stdout ? `stdout: ${err.stdout}` : '',
      err.stderr ? `stderr: ${err.stderr}` : '',
      logContent ? `\nPostgres log (last lines):\n${logContent}` : '',
    ].filter(Boolean).join('\n');
    
    console.error(`[startPostgres] Error: ${fullError}`);
    
    return {
      success: false,
      message: 'pg_ctl start failed',
      error: fullError,
    };
  }
}

/**
 * Check if PostgreSQL is actually running (port check + postmaster.pid)
 */
async function checkIfPostgresRunning(port: number, dataDir: string): Promise<boolean> {
  // Method 1: Check if port is in use
  const portInUse = await isPortInUse(port);
  if (!portInUse) {
    console.log(`[startPostgres] Port ${port} not in use`);
    return false;
  }
  
  // Method 2: Check postmaster.pid exists
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) {
    console.log(`[startPostgres] postmaster.pid not found`);
    return false;
  }
  
  // Method 3: Try pg_isready
  const pgIsReadyPath = getPgIsReadyPath();
  if (fs.existsSync(pgIsReadyPath)) {
    try {
      execSync(`"${pgIsReadyPath}" -h 127.0.0.1 -p ${port}`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      });
      console.log(`[startPostgres] pg_isready confirms server is running`);
      return true;
    } catch {
      // pg_isready failed, but port is in use and pid exists - might still be starting
      console.log(`[startPostgres] pg_isready failed but port in use, waiting...`);
      
      // Give it a few more seconds
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          execSync(`"${pgIsReadyPath}" -h 127.0.0.1 -p ${port}`, {
            windowsHide: true,
            stdio: 'ignore',
            timeout: 5000,
          });
          console.log(`[startPostgres] pg_isready confirms server is running after wait`);
          return true;
        } catch {
          // Keep waiting
        }
      }
    }
  }
  
  // If port is in use and pid file exists, assume it's running
  console.log(`[startPostgres] Port in use and pid file exists, assuming running`);
  return portInUse && fs.existsSync(pidFile);
}

/**
 * Wait for PostgreSQL to be ready using pg_isready
 */
export async function waitForPostgresReady(
  config: PgRuntimeConfig,
  timeoutMs: number = 15000
): Promise<boolean> {
  const { port, user } = config.pg;
  const pgIsReadyPath = getPgIsReadyPath();
  
  if (!fs.existsSync(pgIsReadyPath)) {
    // Fall back to port check
    console.log('[startPostgres] pg_isready not found, using port check');
    return waitForPort(port, timeoutMs);
  }
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      execSync(`"${pgIsReadyPath}" -h 127.0.0.1 -p ${port} -U ${user}`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      });
      return true;
    } catch {
      // Not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return false;
}

/**
 * Check if PostgreSQL is currently running
 */
export async function checkPostgresStatus(
  config: PgRuntimeConfig
): Promise<{ running: boolean; pid?: number }> {
  const pgCtlPath = getPgCtlPath();
  const { dataDir } = config.pg;
  
  if (!fs.existsSync(pgCtlPath)) {
    return { running: false };
  }
  
  // Check via pg_ctl status
  try {
    const output = execSync(`"${pgCtlPath}" status -D "${dataDir}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000,
    });
    
    // Parse PID from output
    const pidMatch = output.match(/PID:\s*(\d+)/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;
    
    return {
      running: output.includes('server is running'),
      pid,
    };
  } catch {
    return { running: false };
  }
}

/**
 * Get the postmaster.pid file if it exists
 */
export function getPostmasterPid(dataDir: string): number | null {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(pidFile, 'utf-8');
    const firstLine = content.split('\n')[0];
    return parseInt(firstLine, 10);
  } catch {
    return null;
  }
}
