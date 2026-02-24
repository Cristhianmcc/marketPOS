/**
 * D7.1 - Ensure PostgreSQL
 * Main orchestrator for embedded PostgreSQL management
 */

import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPgDataDir,
  getPgBinDir,
  getLogsDir,
  getConfigDir,
  getRuntimeConfigPath,
  getPgLogPath,
  ensureDirectories,
  checkPgBinaries,
  checkPostgresRuntime,
  openVCRedistDownload,
  installVCRedist,
  getVCRedistPath,
  isDataDirInitialized,
  loadRuntimeConfig,
  saveRuntimeConfig,
  getDatabaseUrl,
  PgRuntimeConfig,
} from './pgPaths';
import { generatePassword } from './generatePassword';
import { findFreePort, isPortInUse } from './findFreePort';
import { initializeCluster, createDatabase } from './initDb';
import { startPostgres, checkPostgresStatus, waitForPostgresReady } from './startPostgres';
import { stopPostgres, stopPostgresWithRetry } from './stopPostgres';

// ============================================================================
// TYPES
// ============================================================================

export interface EnsureResult {
  success: boolean;
  databaseUrl: string;
  message: string;
  error?: string;
  config: PgRuntimeConfig | null;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Ensure PostgreSQL is ready for use
 * This is the main function to call during app startup
 * 
 * 1. Check/create runtime config
 * 2. Ensure directories exist
 * 3. Initialize cluster if needed
 * 4. Start PostgreSQL
 * 5. Create database if needed
 * 6. Return DATABASE_URL
 */
export async function ensurePostgres(): Promise<EnsureResult> {
  console.log('[ensurePostgres] Starting PostgreSQL setup...');
  
  try {
    // Step 1: Check if PostgreSQL binaries are available
    const binCheck = checkPgBinaries();
    if (!binCheck.available) {
      console.error('[ensurePostgres] Missing binaries:', binCheck.missing);
      return {
        success: false,
        databaseUrl: '',
        message: 'PostgreSQL portable no encontrado',
        error: `Binarios faltantes: ${binCheck.missing.join(', ')}`,
        config: null,
      };
    }
    
    console.log('[ensurePostgres] PostgreSQL binaries found');
    
    // Step 1.5: Verify PostgreSQL can actually run (VC++ Runtime check)
    let runtimeCheck = checkPostgresRuntime();
    if (!runtimeCheck.canRun) {
      console.error('[ensurePostgres] PostgreSQL runtime check failed:', runtimeCheck.error);
      
      // If missing VC++ Runtime, try to install it automatically
      if (runtimeCheck.missingVCRuntime) {
        const vcPath = getVCRedistPath();
        if (vcPath) {
          console.log('[ensurePostgres] VC++ Runtime missing, attempting automatic installation...');
          
          // Show progress to user
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.webContents.send('postgres-status', {
              status: 'installing-vcredist',
              message: 'Instalando componentes de Windows necesarios...',
            });
          }
          
          const installResult = await installVCRedist();
          
          if (installResult.success) {
            console.log('[ensurePostgres] VC++ Runtime installed, retrying runtime check...');
            // Retry runtime check
            runtimeCheck = checkPostgresRuntime();
            
            if (!runtimeCheck.canRun) {
              // Still failing after install - may need reboot
              return {
                success: false,
                databaseUrl: '',
                message: 'Se instaló el componente de Windows pero puede requerir reiniciar',
                error: 'Por favor reinicie el equipo e intente nuevamente',
                config: null,
              };
            }
          } else {
            console.error('[ensurePostgres] Failed to install VC++ Runtime:', installResult.message);
            return {
              success: false,
              databaseUrl: '',
              message: 'Componente de Windows faltante',
              error: `${runtimeCheck.error}. ${installResult.message}`,
              config: null,
            };
          }
        } else {
          // VC++ not bundled, direct user to download
          return {
            success: false,
            databaseUrl: '',
            message: 'Componente de Windows faltante',
            error: runtimeCheck.error,
            config: null,
          };
        }
      } else {
        return {
          success: false,
          databaseUrl: '',
          message: 'Error de configuración de PostgreSQL',
          error: runtimeCheck.error,
          config: null,
        };
      }
    }
    
    console.log('[ensurePostgres] PostgreSQL runtime verified:', runtimeCheck.version);
    
    // Step 2: Ensure directories exist
    ensureDirectories();
    
    // Step 3: Load or create runtime config
    let config = loadRuntimeConfig();
    
    if (!config) {
      console.log('[ensurePostgres] Creating new runtime config...');
      config = await createNewConfig();
      saveRuntimeConfig(config);
    }
    
    // Step 4: Verify port is available or find alternative
    if (await isPortInUse(config.pg.port)) {
      const status = await checkPostgresStatus(config);
      
      if (!status.running) {
        // Port is used by something else, find new port
        console.log(`[ensurePostgres] Port ${config.pg.port} is in use, finding alternative...`);
        const newPort = await findFreePort(config.pg.port + 1);
        config.pg.port = newPort;
        saveRuntimeConfig(config);
        console.log(`[ensurePostgres] Using port ${newPort}`);
      }
    }
    
    // Step 5: Initialize cluster if needed
    if (!isDataDirInitialized()) {
      console.log('[ensurePostgres] Initializing new PostgreSQL cluster...');
      const initResult = await initializeCluster(config);
      
      if (!initResult.success) {
        return {
          success: false,
          databaseUrl: '',
          message: 'Error al inicializar PostgreSQL',
          error: initResult.error,
          config,
        };
      }
    }
    
    // Step 6: Start PostgreSQL
    const startResult = await startPostgres(config);
    
    if (!startResult.success) {
      // Try recovery
      const recovered = await attemptRecovery(config, startResult.error);
      
      if (!recovered) {
        return {
          success: false,
          databaseUrl: '',
          message: 'Error al iniciar PostgreSQL',
          error: startResult.error,
          config,
        };
      }
    }
    
    // Step 7: Create database if it doesn't exist
    const dbResult = await createDatabase(config);
    
    if (!dbResult.success) {
      return {
        success: false,
        databaseUrl: '',
        message: 'Error al crear base de datos',
        error: dbResult.error,
        config,
      };
    }
    
    // Step 8: Update config with last started time
    config.lastStarted = new Date().toISOString();
    config.initialized = true;
    saveRuntimeConfig(config);
    
    // Build DATABASE_URL
    const databaseUrl = getDatabaseUrl(config);
    
    console.log('[ensurePostgres] PostgreSQL ready!');
    console.log(`[ensurePostgres] Port: ${config.pg.port}`);
    
    return {
      success: true,
      databaseUrl,
      message: 'PostgreSQL listo',
      config,
    };
  } catch (error) {
    console.error('[ensurePostgres] Unexpected error:', error);
    return {
      success: false,
      databaseUrl: '',
      message: 'Error inesperado',
      error: error instanceof Error ? error.message : String(error),
      config: null,
    };
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Create a new runtime configuration
 */
async function createNewConfig(): Promise<PgRuntimeConfig> {
  const port = await findFreePort(54329);
  const password = generatePassword();
  
  return {
    pg: {
      port,
      user: 'marketpos',
      password,
      db: 'marketpos_desktop',
      dataDir: getPgDataDir(),
      binDir: getPgBinDir(),
    },
    runMode: 'APP_LIFETIME', // D7.2: default mode
    initialized: false,
  };
}

// ============================================================================
// RECOVERY
// ============================================================================

/**
 * Attempt to recover from startup failure
 */
async function attemptRecovery(
  config: PgRuntimeConfig,
  error?: string
): Promise<boolean> {
  console.log('[ensurePostgres] Attempting recovery...');

  // First, check if PostgreSQL is actually running despite the error
  const status = await checkPostgresStatus(config);
  if (status.running) {
    console.log('[ensurePostgres] PostgreSQL is actually running! No recovery needed.');
    return true;
  }

  // Kill ALL lingering postgres processes for this installation
  console.log('[ensurePostgres] Killing any lingering postgres processes...');
  try {
    const { spawnSync } = await import('child_process');
    spawnSync('taskkill', ['/IM', 'postgres.exe', '/F', '/T'], {
      windowsHide: true, timeout: 5000,
    });
  } catch { /* ignore */ }

  // Wait for processes to die and file handles to be released
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Remove postmaster.pid
  const postmasterPid = path.join(config.pg.dataDir, 'postmaster.pid');
  if (fs.existsSync(postmasterPid)) {
    try { fs.unlinkSync(postmasterPid); console.log('[ensurePostgres] Removed postmaster.pid'); } catch (e) { console.log('[ensurePostgres] Could not remove postmaster.pid:', e); }
  }

  // Remove postmaster.opts
  const postmasterOpts = path.join(config.pg.dataDir, 'postmaster.opts');
  if (fs.existsSync(postmasterOpts)) {
    try { fs.unlinkSync(postmasterOpts); } catch { /* ignore */ }
  }

  // Handle log file permission issue
  const logPath = getPgLogPath();
  if (fs.existsSync(logPath)) {
    let locked = false;
    try { const fd = fs.openSync(logPath, 'a'); fs.closeSync(fd); } catch { locked = true; }
    if (locked) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      try { fs.renameSync(logPath, logPath.replace('.log', `-${ts}.log`)); } catch { try { fs.unlinkSync(logPath); } catch { /* ignore */ } }
      console.log('[ensurePostgres] Rotated locked log file');
    }
  }

  // Check if port conflict
  if (error?.includes('port') || error?.includes('address already in use')) {
    console.log('[ensurePostgres] Port conflict detected, finding new port...');
    const newPort = await findFreePort(config.pg.port + 1);
    config.pg.port = newPort;
    saveRuntimeConfig(config);

    const confPath = path.join(config.pg.dataDir, 'postgresql.conf');
    if (fs.existsSync(confPath)) {
      let content = fs.readFileSync(confPath, 'utf-8');
      content = content.replace(/port\s*=\s*\d+/, `port = ${newPort}`);
      fs.writeFileSync(confPath, content, 'utf-8');
    }
  }

  // Wait a bit more before retry
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Retry startup (preStartCleanup inside startPostgres will also run)
  console.log('[ensurePostgres] Retrying startup after cleanup...');
  const startResult = await startPostgres(config);
  if (startResult.success) return true;

  // Last check
  const finalStatus = await checkPostgresStatus(config);
  return finalStatus.running;
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Stop PostgreSQL gracefully
 * Call this when the app is quitting
 */
export async function shutdownPostgres(): Promise<void> {
  console.log('[ensurePostgres] Shutting down PostgreSQL...');
  
  const config = loadRuntimeConfig();
  if (!config) {
    console.log('[ensurePostgres] No config found, nothing to shut down');
    return;
  }
  
  const result = await stopPostgresWithRetry(config);
  
  if (result.success) {
    console.log('[ensurePostgres] PostgreSQL stopped');
  } else {
    console.error('[ensurePostgres] Failed to stop PostgreSQL:', result.error);
  }
}

// ============================================================================
// ERROR DIALOG
// ============================================================================

/**
 * Show error dialog for PostgreSQL failures
 */
export async function showPostgresErrorDialog(
  window: BrowserWindow | null,
  result: EnsureResult
): Promise<'retry' | 'restore' | 'quit' | 'download'> {
  // Check if this is a VC++ Runtime error
  const isVCError = result.error?.includes('Visual C++ Redistributable') || 
                    result.error?.includes('VCRUNTIME') ||
                    result.error?.includes('MSVCP140') ||
                    result.message?.includes('Componente de Windows');
  
  const buttons = isVCError 
    ? ['Descargar VC++ Runtime', 'Reintentar', 'Salir']
    : ['Reintentar', 'Restaurar Backup', 'Salir'];
  
  const response = await dialog.showMessageBox(window as BrowserWindow, {
    type: 'error',
    title: 'Error de Base de Datos',
    message: result.message,
    detail: result.error || 'PostgreSQL no pudo iniciarse correctamente.',
    buttons,
    defaultId: 0,
    cancelId: isVCError ? 2 : 2,
  });
  
  if (isVCError) {
    switch (response.response) {
      case 0:
        openVCRedistDownload();
        return 'download';
      case 1:
        return 'retry';
      default:
        return 'quit';
    }
  }
  
  switch (response.response) {
    case 0:
      return 'retry';
    case 1:
      return 'restore';
    default:
      return 'quit';
  }
}

/**
 * Show data corruption dialog
 */
export async function showDataCorruptionDialog(
  window: BrowserWindow | null
): Promise<'restore' | 'recreate' | 'quit'> {
  const response = await dialog.showMessageBox(window as BrowserWindow, {
    type: 'warning',
    title: 'Base de Datos Dañada',
    message: 'La base de datos parece estar corrupta.',
    detail: 'Puede restaurar desde un backup anterior o crear una base de datos nueva (perderá los datos actuales).',
    buttons: ['Restaurar Backup', 'Crear Nueva (Peligroso)', 'Salir'],
    defaultId: 0,
    cancelId: 2,
  });
  
  switch (response.response) {
    case 0:
      return 'restore';
    case 1:
      // Extra confirmation for recreate
      const confirm = await dialog.showMessageBox(window as BrowserWindow, {
        type: 'warning',
        title: 'Confirmar',
        message: '¿Está seguro?',
        detail: 'Esta acción eliminará TODOS los datos. No se puede deshacer.',
        buttons: ['Cancelar', 'Sí, eliminar todo'],
        defaultId: 0,
      });
      
      if (confirm.response === 1) {
        return 'recreate';
      }
      return 'quit';
    default:
      return 'quit';
  }
}

/**
 * Recreate the database from scratch
 * WARNING: This deletes all data!
 */
export async function recreateDatabase(): Promise<EnsureResult> {
  console.log('[ensurePostgres] Recreating database...');
  
  const config = loadRuntimeConfig();
  if (!config) {
    return {
      success: false,
      databaseUrl: '',
      message: 'No config found',
      config: null,
    };
  }
  
  // Stop PostgreSQL first
  await stopPostgresWithRetry(config);
  
  // Delete data directory
  const dataDir = config.pg.dataDir;
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('[ensurePostgres] Deleted data directory');
  }
  
  // Reset config
  config.initialized = false;
  saveRuntimeConfig(config);
  
  // Re-run ensure
  return ensurePostgres();
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  loadRuntimeConfig,
  saveRuntimeConfig,
  getDatabaseUrl,
} from './pgPaths';
export { stopPostgres, stopPostgresWithRetry } from './stopPostgres';
export { startPostgres, checkPostgresStatus } from './startPostgres';
