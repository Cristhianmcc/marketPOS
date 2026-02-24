/**
 * D7.1 - Initialize PostgreSQL Database
 * Creates a new PostgreSQL data cluster
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getPgDataDir,
  getInitDbPath,
  getCreateDbPath,
  getPgCtlPath,
  getPgIsReadyPath,
  getLogsDir,
  PgRuntimeConfig,
} from './pgPaths';
import { generatePassword, writePasswordFile, deletePasswordFile } from './generatePassword';

// ============================================================================
// CLUSTER INITIALIZATION
// ============================================================================

export interface InitDbResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Initialize a new PostgreSQL data cluster
 * @param config Runtime configuration
 * @returns Result of initialization
 */
export async function initializeCluster(config: PgRuntimeConfig): Promise<InitDbResult> {
  const dataDir = config.pg.dataDir;
  const initdbPath = getInitDbPath();
  
  console.log('[initDb] Initializing PostgreSQL cluster...');
  console.log(`[initDb] Data directory: ${dataDir}`);
  console.log(`[initDb] initdb path: ${initdbPath}`);
  
  // Check if initdb exists
  if (!fs.existsSync(initdbPath)) {
    return {
      success: false,
      message: 'PostgreSQL binaries not found',
      error: `initdb not found at: ${initdbPath}`,
    };
  }
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Check if already initialized
  const pgVersionPath = path.join(dataDir, 'PG_VERSION');
  if (fs.existsSync(pgVersionPath)) {
    console.log('[initDb] Cluster already initialized');
    return {
      success: true,
      message: 'Cluster already initialized',
    };
  }
  
  // Create temporary password file
  const tempDir = os.tmpdir();
  const pwfilePath = path.join(tempDir, `pg_pw_${Date.now()}.txt`);
  
  try {
    writePasswordFile(pwfilePath, config.pg.password);
    
    // Run initdb
    const result = await runInitDb(initdbPath, dataDir, config.pg.user, pwfilePath);
    
    if (!result.success) {
      return result;
    }
    
    // Configure postgresql.conf
    await configurePostgresConf(dataDir, config.pg.port);
    
    // Configure pg_hba.conf
    await configurePgHba(dataDir);
    
    console.log('[initDb] Cluster initialized successfully');
    
    return {
      success: true,
      message: 'PostgreSQL cluster initialized',
    };
  } finally {
    // Clean up password file
    deletePasswordFile(pwfilePath);
  }
}

/**
 * Run the initdb command
 */
async function runInitDb(
  initdbPath: string,
  dataDir: string,
  username: string,
  pwfilePath: string
): Promise<InitDbResult> {
  return new Promise((resolve) => {
    // Important: On Windows, use simpler locale to avoid encoding issues
    const args = [
      '-D', dataDir,
      '-U', username,
      '--pwfile', pwfilePath,
      '-E', 'UTF8',
      '--locale=C',  // Use C locale to avoid Windows encoding issues
      '-A', 'md5',
      '--no-sync',  // Faster initialization
    ];
    
    console.log(`[initDb] Running: "${initdbPath}" ${args.join(' ')}`);
    console.log(`[initDb] Data directory: ${dataDir}`);
    console.log(`[initDb] Password file: ${pwfilePath}`);
    
    const proc = spawn(initdbPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Set environment to avoid locale issues on Windows
      env: {
        ...process.env,
        LANG: 'C',
        LC_ALL: 'C',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(`[initDb] stdout: ${text.trim()}`);
    });
    
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      console.log(`[initDb] stderr: ${text.trim()}`);
    });
    
    proc.on('error', (err) => {
      console.error(`[initDb] Process error: ${err.message}`);
      resolve({
        success: false,
        message: 'Failed to run initdb',
        error: `Process error: ${err.message}`,
      });
    });
    
    proc.on('close', (code) => {
      console.log(`[initDb] Process exited with code: ${code}`);
      
      if (code === 0) {
        // Verify that PG_VERSION was created
        const pgVersionPath = path.join(dataDir, 'PG_VERSION');
        if (fs.existsSync(pgVersionPath)) {
          console.log('[initDb] PG_VERSION file created successfully');
          resolve({
            success: true,
            message: 'initdb completed',
          });
        } else {
          console.error('[initDb] PG_VERSION not found after initdb!');
          resolve({
            success: false,
            message: 'initdb completed but cluster is invalid',
            error: 'PG_VERSION file was not created',
          });
        }
      } else {
        const errorMsg = stderr || stdout || `Exit code: ${code}`;
        console.error(`[initDb] Failed: ${errorMsg}`);
        resolve({
          success: false,
          message: 'initdb failed',
          error: errorMsg,
        });
      }
    });
    
    // Timeout after 120 seconds (initdb can be slow on some systems)
    setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        message: 'initdb timed out',
        error: 'Process timed out after 120 seconds',
      });
    }, 120000);
  });
}

/**
 * Configure postgresql.conf with optimal settings
 */
async function configurePostgresConf(dataDir: string, port: number): Promise<void> {
  const confPath = path.join(dataDir, 'postgresql.conf');
  
  if (!fs.existsSync(confPath)) {
    throw new Error('postgresql.conf not found after initdb');
  }
  
  let content = fs.readFileSync(confPath, 'utf-8');
  
  // Settings optimized for small business POS
  const settings = [
    `listen_addresses = '127.0.0.1'`,
    `port = ${port}`,
    `max_connections = 50`,
    `shared_buffers = 128MB`,
    `effective_cache_size = 256MB`,
    `work_mem = 4MB`,
    `maintenance_work_mem = 64MB`,
    `synchronous_commit = on`,
    `wal_level = replica`,
    `checkpoint_completion_target = 0.9`,
    `logging_collector = on`,
    `log_directory = 'pg_log'`,
    `log_filename = 'postgresql-%Y-%m-%d.log'`,
    `log_truncate_on_rotation = on`,
    `log_rotation_age = 1d`,
    `log_rotation_size = 10MB`,
    `log_min_messages = warning`,
  ];
  
  // Append settings
  content += '\n\n# MarketPOS Desktop Configuration\n';
  content += settings.join('\n');
  content += '\n';
  
  fs.writeFileSync(confPath, content, 'utf-8');
  console.log('[initDb] Configured postgresql.conf');
}

/**
 * Configure pg_hba.conf for local-only access with md5 auth
 */
async function configurePgHba(dataDir: string): Promise<void> {
  const hbaPath = path.join(dataDir, 'pg_hba.conf');
  
  // Restrictive config: only local connections with password
  const content = `
# PostgreSQL Client Authentication Configuration
# MarketPOS Desktop - Local only

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections only with password authentication
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5

# Replication connections (disabled)
# host    replication     all             127.0.0.1/32            md5
`;
  
  fs.writeFileSync(hbaPath, content, 'utf-8');
  console.log('[initDb] Configured pg_hba.conf');
}

// ============================================================================
// DATABASE CREATION
// ============================================================================

/**
 * Create the application database if it doesn't exist
 * @param config Runtime configuration
 * @returns True if database exists or was created
 */
export async function createDatabase(config: PgRuntimeConfig): Promise<InitDbResult> {
  const { user, password, port, db } = config.pg;
  const createdbPath = getCreateDbPath();
  
  console.log(`[initDb] Creating database: ${db}`);
  
  if (!fs.existsSync(createdbPath)) {
    return {
      success: false,
      message: 'createdb not found',
      error: `createdb not found at: ${createdbPath}`,
    };
  }
  
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PGPASSWORD: password,
    };
    
    const args = [
      '-h', '127.0.0.1',
      '-p', port.toString(),
      '-U', user,
      db,
    ];
    
    console.log(`[initDb] Running: createdb ${args.join(' ')}`);
    
    const proc = spawn(createdbPath, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      resolve({
        success: false,
        message: 'Failed to run createdb',
        error: err.message,
      });
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: `Database '${db}' created`,
        });
      } else if (stderr.includes('already exists')) {
        resolve({
          success: true,
          message: `Database '${db}' already exists`,
        });
      } else {
        resolve({
          success: false,
          message: 'Failed to create database',
          error: stderr,
        });
      }
    });
    
    // Timeout
    setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        message: 'createdb timed out',
      });
    }, 30000);
  });
}
