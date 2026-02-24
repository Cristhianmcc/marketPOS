/**
 * D7.1 - PostgreSQL Paths Configuration
 * Manages paths for embedded PostgreSQL
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { app, shell } from 'electron';

// ============================================================================
// PATHS CONFIGURATION
// ============================================================================

/**
 * Get the Monterrial POS user data directory
 * Location: Documents/MonterrialPOS/
 */
export function getMarketPOSDir(): string {
  const documentsDir = path.join(os.homedir(), 'Documents');
  return path.join(documentsDir, 'MonterrialPOS');
}

/**
 * Get the PostgreSQL data directory
 * Location: Documents/MonterrialPOS/pg/data
 */
export function getPgDataDir(): string {
  return path.join(getMarketPOSDir(), 'pg', 'data');
}

/**
 * Get the PostgreSQL logs directory
 * Location: Documents/MonterrialPOS/logs
 */
export function getLogsDir(): string {
  return path.join(getMarketPOSDir(), 'logs');
}

/**
 * Get the PostgreSQL log file path
 */
export function getPgLogPath(): string {
  return path.join(getLogsDir(), 'postgres.log');
}

/**
 * Get the config directory
 * Location: Documents/MonterrialPOS/config
 */
export function getConfigDir(): string {
  return path.join(getMarketPOSDir(), 'config');
}

/**
 * Get the runtime config file path
 */
export function getRuntimeConfigPath(): string {
  return path.join(getConfigDir(), 'runtime.json');
}

/**
 * Get the PostgreSQL binaries directory
 * In production: resources/postgres/bin
 * In development: desktop/vendor/postgres/bin
 */
export function getPgBinDir(): string {
  const isProd = app.isPackaged;
  
  if (isProd) {
    return path.join(process.resourcesPath, 'postgres', 'bin');
  }
  
  // Development: look for vendor folder
  return path.join(__dirname, '..', '..', '..', 'vendor', 'postgres', 'bin');
}

/**
 * Get path to a specific PostgreSQL executable
 */
export function getPgExecutable(name: string): string {
  const binDir = getPgBinDir();
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(binDir, `${name}${ext}`);
}

/**
 * Get pg_ctl path
 */
export function getPgCtlPath(): string {
  return getPgExecutable('pg_ctl');
}

/**
 * Get initdb path
 */
export function getInitDbPath(): string {
  return getPgExecutable('initdb');
}

/**
 * Get createdb path
 */
export function getCreateDbPath(): string {
  return getPgExecutable('createdb');
}

/**
 * Get pg_isready path
 */
export function getPgIsReadyPath(): string {
  return getPgExecutable('pg_isready');
}

/**
 * Get psql path
 */
export function getPsqlPath(): string {
  return getPgExecutable('psql');
}

// ============================================================================
// DIRECTORY MANAGEMENT
// ============================================================================

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(): void {
  const dirs = [
    getMarketPOSDir(),
    getPgDataDir(),
    getLogsDir(),
    getConfigDir(),
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[pgPaths] Created directory: ${dir}`);
    }
  }
}

/**
 * Check if PostgreSQL binaries are available
 */
export function checkPgBinaries(): { available: boolean; missing: string[] } {
  const required = ['pg_ctl', 'initdb', 'createdb', 'pg_isready', 'psql'];
  const missing: string[] = [];
  
  for (const exe of required) {
    const exePath = getPgExecutable(exe);
    if (!fs.existsSync(exePath)) {
      missing.push(exe);
    }
  }
  
  return {
    available: missing.length === 0,
    missing,
  };
}

/**
 * Check if data directory has been initialized
 */
export function isDataDirInitialized(): boolean {
  const pgVersionPath = path.join(getPgDataDir(), 'PG_VERSION');
  return fs.existsSync(pgVersionPath);
}

// ============================================================================
// RUNTIME CONFIG
// ============================================================================

/**
 * D7.2 - PostgreSQL run modes
 * APP_LIFETIME: PG runs while app is open (default)
 * TASK_AT_LOGON: PG runs via Task Scheduler at user login (no admin)
 * WINDOWS_SERVICE: PG runs as Windows service (requires admin)
 */
export type PgRunMode = 'APP_LIFETIME' | 'TASK_AT_LOGON' | 'WINDOWS_SERVICE';

export interface PgRuntimeConfig {
  pg: {
    port: number;
    user: string;
    password: string;
    db: string;
    dataDir: string;
    binDir: string;
  };
  runMode: PgRunMode;
  initialized: boolean;
  lastStarted?: string;
}

/**
 * Load runtime config from disk
 */
export function loadRuntimeConfig(): PgRuntimeConfig | null {
  const configPath = getRuntimeConfigPath();
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as PgRuntimeConfig;
  } catch (error) {
    console.error('[pgPaths] Failed to load runtime config:', error);
    return null;
  }
}

/**
 * Save runtime config to disk
 */
export function saveRuntimeConfig(config: PgRuntimeConfig): void {
  const configPath = getRuntimeConfigPath();
  
  ensureDirectories();
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('[pgPaths] Saved runtime config');
}

/**
 * Get DATABASE_URL from runtime config
 */
export function getDatabaseUrl(config: PgRuntimeConfig): string {
  const { user, password, port, db } = config.pg;
  return `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${db}?schema=public`;
}

// ============================================================================
// RUNTIME VERIFICATION
// ============================================================================

/**
 * Check if PostgreSQL can actually run (verifies VC++ Runtime is available)
 * This catches the common error when Visual C++ Redistributable is not installed
 */
export interface RuntimeCheckResult {
  canRun: boolean;
  version?: string;
  error?: string;
  missingVCRuntime?: boolean;
}

export function checkPostgresRuntime(): RuntimeCheckResult {
  const postgresPath = getPgExecutable('postgres');
  
  if (!fs.existsSync(postgresPath)) {
    return {
      canRun: false,
      error: `postgres.exe not found at: ${postgresPath}`,
    };
  }
  
  try {
    const result = execFileSync(postgresPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    });
    
    const version = result.trim();
    console.log(`[pgPaths] PostgreSQL runtime check OK: ${version}`);
    
    return {
      canRun: true,
      version,
    };
  } catch (error: unknown) {
    const err = error as Error & { message?: string; code?: string; status?: number };
    const errorMsg = err.message || String(error);
    
    // Detect common VC++ Runtime errors
    const vcRuntimeErrors = [
      'STATUS_DLL_NOT_FOUND',
      'VCRUNTIME140',
      'MSVCP140',
      'api-ms-win-crt',
      '0xc0000135', // STATUS_DLL_NOT_FOUND code
      'The code execution cannot proceed',
      'was not found',
    ];
    
    const isMissingVCRuntime = vcRuntimeErrors.some(pattern => 
      errorMsg.toLowerCase().includes(pattern.toLowerCase())
    );
    
    console.error(`[pgPaths] PostgreSQL runtime check failed: ${errorMsg}`);
    
    if (isMissingVCRuntime) {
      return {
        canRun: false,
        error: 'Visual C++ Redistributable 2015-2022 no está instalado.\n\n' +
               'PostgreSQL requiere este componente para funcionar.\n\n' +
               'Descargue e instale desde:\n' +
               'https://aka.ms/vs/17/release/vc_redist.x64.exe',
        missingVCRuntime: true,
      };
    }
    
    return {
      canRun: false,
      error: `Error ejecutando postgres.exe: ${errorMsg}`,
    };
  }
}

/**
 * Open VC++ Redistributable download page
 */
export function openVCRedistDownload(): void {
  shell.openExternal('https://aka.ms/vs/17/release/vc_redist.x64.exe');
}

/**
 * Get path to bundled VC++ Redistributable
 */
export function getVCRedistPath(): string | null {
  const isProd = app.isPackaged;
  
  if (isProd) {
    const vcPath = path.join(process.resourcesPath, 'vc_redist.x64.exe');
    if (fs.existsSync(vcPath)) {
      return vcPath;
    }
  }
  
  // Dev mode - check resources folder
  const devPath = path.join(__dirname, '..', '..', '..', 'resources', 'vc_redist.x64.exe');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  
  return null;
}

/**
 * Install VC++ Redistributable silently
 * Returns true if installed successfully or already installed
 */
export async function installVCRedist(): Promise<{ success: boolean; message: string }> {
  // First check if already installed
  const vcDllPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'vcruntime140.dll');
  if (fs.existsSync(vcDllPath)) {
    console.log('[pgPaths] VC++ Runtime already installed');
    return { success: true, message: 'VC++ Runtime ya está instalado' };
  }
  
  const vcRedistPath = getVCRedistPath();
  if (!vcRedistPath) {
    console.error('[pgPaths] VC++ Redistributable not bundled');
    return { 
      success: false, 
      message: 'VC++ Redistributable no está incluido en la instalación' 
    };
  }
  
  console.log(`[pgPaths] Installing VC++ Runtime from: ${vcRedistPath}`);
  
  try {
    // Run silent install
    execFileSync(vcRedistPath, ['/install', '/quiet', '/norestart'], {
      windowsHide: true,
      timeout: 120000, // 2 minutes timeout
    });
    
    console.log('[pgPaths] VC++ Runtime installed successfully');
    return { success: true, message: 'VC++ Runtime instalado correctamente' };
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    
    // Exit code 1638 means already installed
    if (err.status === 1638) {
      console.log('[pgPaths] VC++ Runtime was already installed');
      return { success: true, message: 'VC++ Runtime ya estaba instalado' };
    }
    
    // Exit code 3010 means reboot required but install successful
    if (err.status === 3010) {
      console.log('[pgPaths] VC++ Runtime installed, reboot may be required');
      return { success: true, message: 'VC++ Runtime instalado (puede requerir reinicio)' };
    }
    
    console.error('[pgPaths] Failed to install VC++ Runtime:', err.message);
    return { 
      success: false, 
      message: `Error instalando VC++ Runtime: ${err.message}` 
    };
  }
}
