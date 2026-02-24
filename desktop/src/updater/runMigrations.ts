/**
 * D7 - Migration Runner
 * Executes Prisma migrations during preflight
 */

import { execSync, execFileSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app } from 'electron';

// ============== Types ==============

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  migrationsSkipped: number;
  message: string;
  error?: string;
}

// ============== Migration Runner ==============

export class MigrationRunner {
  private resourcesPath: string;
  private isProd: boolean;
  private prismaVersion: string = '5.22.0';

  constructor() {
    this.isProd = app.isPackaged;
    this.resourcesPath = this.isProd
      ? process.resourcesPath
      : path.join(__dirname, '..', '..');
  }

  /**
   * Get the Prisma binary path
   */
  private getPrismaBinary(): string {
    if (this.isProd) {
      // In production, use the bundled Prisma binary
      const ext = process.platform === 'win32' ? '.exe' : '';
      
      // Log search paths for debugging
      console.log(`[MigrationRunner] Searching for Prisma binary in resources: ${this.resourcesPath}`);
      
      // Check in node_modules first
      const nodeModulesPath = path.join(
        this.resourcesPath, 
        'server', 
        'node_modules', 
        '.bin', 
        `prisma${ext}`
      );
      
      if (fs.existsSync(nodeModulesPath)) {
        console.log(`[MigrationRunner] Found Prisma at: ${nodeModulesPath}`);
        return nodeModulesPath;
      }

      // Windows: .cmd shim for prisma
      if (process.platform === 'win32') {
        const prismaCmd = path.join(
          this.resourcesPath,
          'server',
          'node_modules',
          '.bin',
          'prisma.cmd'
        );
        if (fs.existsSync(prismaCmd)) {
          console.log(`[MigrationRunner] Found Prisma at: ${prismaCmd}`);
          return prismaCmd;
        }
      }

      // Check in resources/prisma-engines
      const enginesPath = path.join(
        this.resourcesPath,
        'prisma-engines',
        `prisma${ext}`
      );
      
      if (fs.existsSync(enginesPath)) {
        console.log(`[MigrationRunner] Found Prisma at: ${enginesPath}`);
        return enginesPath;
      }

      // Log what we actually found
      console.error('[MigrationRunner] Prisma binary not found. Checking available files...');
      try {
        const binPath = path.join(this.resourcesPath, 'server', 'node_modules', '.bin');
        if (fs.existsSync(binPath)) {
          const files = fs.readdirSync(binPath);
          console.error(`[MigrationRunner] Files in .bin/: ${files.join(', ')}`);
        } else {
          console.error(`[MigrationRunner] .bin directory does not exist: ${binPath}`);
        }
      } catch (e) {
        console.error('[MigrationRunner] Error listing .bin directory:', e);
      }

      // Fallback: try npx in PATH (may not work without Node.js installed)
      console.warn('[MigrationRunner] Falling back to npx prisma (requires Node.js in PATH)');
      return 'npx prisma';
    }
    
    // Development: use npx
    return 'npx prisma';
  }

  /**
   * Get Prisma CLI JS path (preferred in production to avoid cmd.exe issues)
   */
  private getPrismaCliJsPath(): string | null {
    if (!this.isProd) {
      return null;
    }

    const cliPath = path.join(
      this.resourcesPath,
      'server',
      'node_modules',
      'prisma',
      'build',
      'index.js'
    );

    return fs.existsSync(cliPath) ? cliPath : null;
  }

  /**
   * Get the Prisma schema path
   */
  private getPrismaSchemaPath(): string {
    const schemaLocations = [
      path.join(this.resourcesPath, 'server', 'prisma', 'schema.prisma'),
      path.join(this.resourcesPath, 'prisma', 'schema.prisma'),
      // Also check in server/.next/server (standalone mode)
      path.join(this.resourcesPath, 'server', '.next', 'server', 'prisma', 'schema.prisma'),
    ];

    console.log('[MigrationRunner] Searching for schema in:', schemaLocations);

    for (const loc of schemaLocations) {
      if (fs.existsSync(loc)) {
        console.log(`[MigrationRunner] Found schema at: ${loc}`);
        return loc;
      }
    }

    // Log all available files in resources for debugging
    console.error('[MigrationRunner] Schema not found. Available resources:');
    try {
      const serverPath = path.join(this.resourcesPath, 'server');
      if (fs.existsSync(serverPath)) {
        const files = fs.readdirSync(serverPath);
        console.error(`[MigrationRunner] Files in server/: ${files.join(', ')}`);
      }
      const prismaPath = path.join(this.resourcesPath, 'server', 'prisma');
      if (fs.existsSync(prismaPath)) {
        const files = fs.readdirSync(prismaPath);
        console.error(`[MigrationRunner] Files in server/prisma/: ${files.join(', ')}`);
      }
    } catch (e) {
      console.error('[MigrationRunner] Error listing files:', e);
    }

    throw new Error(`Prisma schema not found in: ${schemaLocations.join(', ')}`);
  }

  /**
   * Get DATABASE_URL from environment or .env file
   */
  private getDatabaseUrl(): string {
    // Check environment first
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    // Read from .env file
    const envLocations = [
      path.join(this.resourcesPath, '.env'),
      path.join(this.resourcesPath, 'server', '.env'),
    ];

    for (const envPath of envLocations) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/);
        if (match) {
          return match[1];
        }
      }
    }

    // Default local PostgreSQL
    return 'postgresql://postgres:postgres@localhost:5432/marketpos?schema=public';
  }

  /**
   * Get a safe local working directory for Prisma commands (avoid UNC paths)
   * CRITICAL: Windows throws "No se ha encontrado la ruta de acceso de la red" 
   * if the CWD is a network path or doesn't exist.
   */
  private getPrismaCwd(): string {
    // Priority 1: Server directory in resources
    const serverDir = path.join(this.resourcesPath, 'server');
    if (fs.existsSync(serverDir)) {
      console.log(`[MigrationRunner] Using CWD: ${serverDir}`);
      return serverDir;
    }
    
    // Priority 2: Resources path
    if (fs.existsSync(this.resourcesPath)) {
      console.log(`[MigrationRunner] Using CWD: ${this.resourcesPath}`);
      return this.resourcesPath;
    }
    
    // Priority 3: App data directory (always exists)
    const userDataDir = app.getPath('userData');
    if (fs.existsSync(userDataDir)) {
      console.log(`[MigrationRunner] Fallback CWD: ${userDataDir}`);
      return userDataDir;
    }
    
    // Priority 4: Temp directory (guaranteed to exist)
    const tempDir = os.tmpdir();
    console.log(`[MigrationRunner] Using temp CWD: ${tempDir}`);
    return tempDir;
  }

  /**
   * Build env for Prisma execution (ensure module/bin paths)
   */
  private buildPrismaEnv(databaseUrl: string, runAsNode: boolean): NodeJS.ProcessEnv {
    const serverNodeModules = path.join(this.resourcesPath, 'server', 'node_modules');
    const serverBin = path.join(serverNodeModules, '.bin');
    const currentPath = process.env.PATH || '';
    const pathSep = process.platform === 'win32' ? ';' : ':';

    return {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NODE_PATH: serverNodeModules,
      PATH: `${serverBin}${pathSep}${currentPath}`,
      ...(runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    };
  }

  /**
   * Run a Prisma command and capture output
   */
  private runPrismaProcess(
    cmd: string,
    cmdArgs: string[],
    databaseUrl: string,
    runAsNode: boolean,
    useShell: boolean = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const cwd = this.getPrismaCwd();
      
      // Validate CWD exists before spawning (prevents "ruta de acceso de la red" error)
      if (!fs.existsSync(cwd)) {
        console.error(`[MigrationRunner] CWD does not exist: ${cwd}`);
        reject(new Error(`Working directory does not exist: ${cwd}`));
        return;
      }

      // On Windows, ensure cwd is not a UNC path (\\server\share)
      if (process.platform === 'win32' && cwd.startsWith('\\\\')) {
        console.error(`[MigrationRunner] UNC paths not supported as CWD: ${cwd}`);
        // Use a safe fallback
        const safeCwd = os.tmpdir();
        console.log(`[MigrationRunner] Using fallback CWD: ${safeCwd}`);
      }

      // Log detailed info for debugging
      console.log(`[MigrationRunner] Spawning: ${cmd}`);
      console.log(`[MigrationRunner] Args: ${cmdArgs.join(' ')}`);
      console.log(`[MigrationRunner] CWD: ${cwd}`);
      console.log(`[MigrationRunner] Shell: ${useShell}`);

      const spawnOptions: import('child_process').SpawnOptions = {
        env: this.buildPrismaEnv(databaseUrl, runAsNode),
        windowsHide: true,
        cwd: cwd,
        shell: useShell,
      };

      const proc = spawn(cmd, cmdArgs, spawnOptions);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        console.log(`[MigrationRunner] ${data.toString().trim()}`);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        // Log stderr in real-time for debugging
        console.log(`[MigrationRunner] STDERR: ${data.toString().trim()}`);
      });

      proc.on('error', (err) => {
        console.error(`[MigrationRunner] Spawn error: ${err.message}`);
        console.error(`[MigrationRunner] Command was: ${cmd} ${cmdArgs.join(' ')}`);
        reject(new Error(`Failed to spawn prisma: ${err.message}. Command: ${cmd}, CWD: ${cwd}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          const errorMsg = stderr || stdout || 'Unknown error';
          console.error(`[MigrationRunner] Process exited with code ${code}`);
          console.error(`[MigrationRunner] Output: ${errorMsg}`);
          reject(new Error(`Prisma command failed (code ${code}): ${errorMsg}`));
        }
      });
    });
  }

  /**
   * Run prisma migrate deploy
   * This applies all pending migrations that haven't been applied yet
   */
  async runMigrations(): Promise<MigrationResult> {
    console.log('[MigrationRunner] Starting migration deployment...');

    try {
      const schemaPath = this.getPrismaSchemaPath();
      const databaseUrl = this.getDatabaseUrl();
      
      console.log(`[MigrationRunner] Schema: ${schemaPath}`);
      console.log(`[MigrationRunner] Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

      // Check if migrations folder exists
      const migrationsPath = path.join(path.dirname(schemaPath), 'migrations');
      if (!fs.existsSync(migrationsPath)) {
        // No migrations folder - use prisma db push instead
        console.log('[MigrationRunner] No migrations folder - using db push');
        const output = await this.execPrismaDbPush(schemaPath, databaseUrl);
        
        // No seed automático - el usuario debe pasar por /setup para provisionar
        console.log('[MigrationRunner] Schema created. User must complete /setup to provision store.');

        // Seed global catalog
        try {
          await this.seedGlobalCatalog(databaseUrl);
        } catch (seedErr) {
          console.error('[MigrationRunner] Catalog seed error (non-fatal):', seedErr);
        }

        return {
          success: true,
          migrationsApplied: 1,
          migrationsSkipped: 0,
          message: 'Schema pushed successfully (db push)',
        };
      }

      // Count migration folders before
      const migrationFolders = fs.readdirSync(migrationsPath)
        .filter(f => {
          const fullPath = path.join(migrationsPath, f);
          return fs.statSync(fullPath).isDirectory() && f.match(/^\d{14}_/);
        });

      console.log(`[MigrationRunner] Found ${migrationFolders.length} migration(s)`);

      // Run prisma migrate deploy
      const output = await this.execPrismaMigrate(schemaPath, databaseUrl);
      
      // Parse output
      const applied = this.countAppliedMigrations(output);
      const skipped = migrationFolders.length - applied;

      console.log(`[MigrationRunner] Applied: ${applied}, Skipped: ${skipped}`);

      // Seed global catalog after migrations
      try {
        await this.seedGlobalCatalog(databaseUrl);
      } catch (seedErr) {
        // Non-fatal: log but don't fail the migration
        console.error('[MigrationRunner] Catalog seed error (non-fatal):', seedErr);
      }

      return {
        success: true,
        migrationsApplied: applied,
        migrationsSkipped: skipped,
        message: applied > 0 
          ? `${applied} migration(s) applied successfully`
          : 'Database is up to date',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[MigrationRunner] Error: ${errorMsg}`);

      return {
        success: false,
        migrationsApplied: 0,
        migrationsSkipped: 0,
        message: 'Migration failed',
        error: errorMsg,
      };
    }
  }

  // ============== Catalog Seed ==============

  /**
   * Find the bundled catalog seed JSON file
   */
  private findSeedFile(): string | null {
    const locations = [
      path.join(this.resourcesPath, 'data', 'catalog_seed_pe_v2_fixed.json'),
      path.join(__dirname, '..', '..', '..', 'data', 'catalog_seed_pe_v2_fixed.json'),
      path.join(__dirname, '..', '..', 'data', 'catalog_seed_pe_v2_fixed.json'),
    ];
    return locations.find(l => fs.existsSync(l)) || null;
  }

  /**
   * Find psql.exe bundled with postgres
   */
  private findPsqlPath(): string | null {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const locations = [
      path.join(this.resourcesPath, 'postgres', 'bin', `psql${ext}`),
      path.join(__dirname, '..', '..', '..', 'vendor', 'postgres', 'bin', `psql${ext}`),
    ];
    return locations.find(l => fs.existsSync(l)) || null;
  }

  /**
   * Parse postgresql://user:pass@host:port/dbname connection URL
   */
  private parseConnectionUrl(url: string): { host: string; port: string; user: string; password: string; database: string } {
    const match = url.match(/postgresql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/([^?]+)/);
    if (match) {
      return { user: match[1], password: decodeURIComponent(match[2]), host: match[3], port: match[4], database: match[5] };
    }
    return { host: '127.0.0.1', port: '5432', user: 'postgres', password: '', database: 'marketpos' };
  }

  /**
   * Normalize text for fingerprint (remove accents, lowercase, trim)
   */
  private normalizeText(s: string | null | undefined): string {
    if (!s) return '';
    return s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /**
   * Escape a value for SQL single-quoted string (or return NULL)
   */
  private sqlEscape(s: string | null | undefined): string {
    if (s === null || s === undefined || s === '') return 'NULL';
    return `'${String(s).replace(/'/g, "''")}'`;
  }

  /**
   * Seed the global catalog from bundled JSON.
   * Only runs if products_master has no global products.
   */
  private async seedGlobalCatalog(databaseUrl: string): Promise<void> {
    console.log('[MigrationRunner] Checking if global catalog needs seeding...');

    const seedFile = this.findSeedFile();
    if (!seedFile) {
      console.log('[MigrationRunner] Catalog seed file not found, skipping');
      return;
    }

    const psqlPath = this.findPsqlPath();
    if (!psqlPath) {
      console.log('[MigrationRunner] psql not found, skipping catalog seed');
      return;
    }

    const conn = this.parseConnectionUrl(databaseUrl);
    const pgEnv = { ...process.env, PGPASSWORD: conn.password };
    const psqlBase = ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.database];

    // Check current count
    let currentCount = 0;
    try {
      const countOut = execFileSync(psqlPath, [...psqlBase, '-t', '-c', 'SELECT COUNT(*) FROM products_master WHERE is_global = true'], {
        env: pgEnv, encoding: 'utf-8', windowsHide: true, timeout: 10000,
      });
      currentCount = parseInt(countOut.trim(), 10) || 0;
    } catch (e) {
      console.log('[MigrationRunner] Could not count global products, skipping seed:', e);
      return;
    }

    if (currentCount > 0) {
      console.log(`[MigrationRunner] Catalog already has ${currentCount} global products, skipping seed`);
      return;
    }

    console.log('[MigrationRunner] Seeding global catalog from:', seedFile);
    const products: Array<{
      name: string; brand?: string; content?: string;
      unitType?: string; category: string; imageUrl?: string;
    }> = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));

    // Build SQL file with idempotent inserts
    const sqlLines: string[] = ['BEGIN;'];
    let idx = 0;

    for (const item of products) {
      idx++;
      const normalizedName = this.normalizeText(item.name);
      const fingerprint = this.normalizeText(`${item.name}${item.brand || ''}${item.content || ''}`);
      // Deterministic SKU based on index + normalized name to avoid collisions
      const sku = `SEED-${idx}-${normalizedName.replace(/[^a-z0-9]/g, '').substring(0, 12)}`;
      const unitType = item.unitType === 'KG' ? 'KG' : 'UNIT';

      sqlLines.push(
        `INSERT INTO products_master ` +
        `(id, internal_sku, name, brand, content, category, unit_type, image_url, ` +
        `is_global, is_quick_sell, normalized_name, fingerprint, approved_at, created_at, updated_at) ` +
        `SELECT ` +
        `md5(random()::text || clock_timestamp()::text), ` +
        `${this.sqlEscape(sku)}, ` +
        `${this.sqlEscape(item.name)}, ` +
        `${this.sqlEscape(item.brand)}, ` +
        `${this.sqlEscape(item.content)}, ` +
        `${this.sqlEscape(item.category)}, ` +
        `'${unitType}', ` +
        `${this.sqlEscape(item.imageUrl)}, ` +
        `true, false, ` +
        `${this.sqlEscape(normalizedName)}, ` +
        `${this.sqlEscape(fingerprint)}, ` +
        `NOW(), NOW(), NOW() ` +
        `WHERE NOT EXISTS (SELECT 1 FROM products_master WHERE fingerprint = ${this.sqlEscape(fingerprint)} AND is_global = true);`
      );
    }

    sqlLines.push('COMMIT;');

    const tmpSql = path.join(os.tmpdir(), `catalog_seed_${Date.now()}.sql`);
    fs.writeFileSync(tmpSql, sqlLines.join('\n'), 'utf-8');

    try {
      execFileSync(psqlPath, [...psqlBase, '-f', tmpSql], {
        env: pgEnv, encoding: 'utf-8', windowsHide: true, timeout: 60000,
      });
      console.log(`[MigrationRunner] Global catalog seeded with ${products.length} products`);
    } catch (e) {
      console.error('[MigrationRunner] Catalog seed SQL failed:', e);
    } finally {
      try { fs.unlinkSync(tmpSql); } catch { /* ignore */ }
    }
  }

  /**
   * Execute prisma migrate deploy command
   */
  private async execPrismaMigrate(schemaPath: string, databaseUrl: string): Promise<string> {
    const prismaCliJs = this.getPrismaCliJsPath();
    const prismaBin = prismaCliJs ? process.execPath : this.getPrismaBinary();
    const isNpx = !prismaCliJs && prismaBin.includes('npx');

    const args = isNpx
      ? [`prisma@${this.prismaVersion}`, 'migrate', 'deploy', '--schema', schemaPath]
      : ['migrate', 'deploy', '--schema', schemaPath];
    const fullArgs = prismaCliJs ? [prismaCliJs, ...args] : args;

    let cmd = isNpx
      ? (process.platform === 'win32' ? 'npx.cmd' : 'npx')
      : prismaBin;
    let cmdArgs = fullArgs;
    let useShell = false;

    // On Windows with .cmd files, use shell mode directly (more reliable)
    if (process.platform === 'win32' && cmd.toLowerCase().endsWith('.cmd')) {
      useShell = true;
    }

    console.log(`[MigrationRunner] Running: ${cmd} ${cmdArgs.join(' ')}`);

    try {
      return await this.runPrismaProcess(cmd, cmdArgs, databaseUrl, !!prismaCliJs, useShell);
    } catch (err) {
      console.error('[MigrationRunner] First attempt failed, trying fallback...');
      
      // Fallback 1: if using node-cli on Windows fails, try prisma.cmd with shell
      if (prismaCliJs && process.platform === 'win32') {
        const fallbackBin = this.getPrismaBinary();
        if (fallbackBin.toLowerCase().endsWith('.cmd')) {
          console.log('[MigrationRunner] Trying prisma.cmd with shell...');
          const fallbackArgs = ['migrate', 'deploy', '--schema', schemaPath];
          try {
            return await this.runPrismaProcess(fallbackBin, fallbackArgs, databaseUrl, false, true);
          } catch (fallbackErr) {
            console.error('[MigrationRunner] Fallback 1 failed:', fallbackErr);
          }
        }
      }
      
      // Fallback 2: Try with shell mode if we haven't yet
      if (!useShell && process.platform === 'win32') {
        console.log('[MigrationRunner] Trying with shell mode as last resort...');
        try {
          return await this.runPrismaProcess(cmd, cmdArgs, databaseUrl, !!prismaCliJs, true);
        } catch (shellErr) {
          console.error('[MigrationRunner] Shell fallback also failed:', shellErr);
        }
      }
      
      throw err;
    }
  }

  /**
   * Execute prisma db push command
   * Used when no migrations folder exists
   */
  private async execPrismaDbPush(schemaPath: string, databaseUrl: string): Promise<string> {
    const prismaCliJs = this.getPrismaCliJsPath();
    const prismaBin = prismaCliJs ? process.execPath : this.getPrismaBinary();
    const isNpx = !prismaCliJs && prismaBin.includes('npx');

    const args = isNpx
      ? [`prisma@${this.prismaVersion}`, 'db', 'push', '--schema', schemaPath, '--accept-data-loss']
      : ['db', 'push', '--schema', schemaPath, '--accept-data-loss'];
    const fullArgs = prismaCliJs ? [prismaCliJs, ...args] : args;

    let cmd = isNpx
      ? (process.platform === 'win32' ? 'npx.cmd' : 'npx')
      : prismaBin;
    let cmdArgs = fullArgs;
    let useShell = false;

    // On Windows with .cmd files, use shell mode directly (more reliable)
    if (process.platform === 'win32' && cmd.toLowerCase().endsWith('.cmd')) {
      useShell = true;
    }

    console.log(`[MigrationRunner] Running: ${cmd} ${cmdArgs.join(' ')}`);

    try {
      return await this.runPrismaProcess(cmd, cmdArgs, databaseUrl, !!prismaCliJs, useShell);
    } catch (err) {
      console.error('[MigrationRunner] First attempt failed, trying fallback...');
      
      // Fallback 1: if using node-cli on Windows fails, try prisma.cmd with shell
      if (prismaCliJs && process.platform === 'win32') {
        const fallbackBin = this.getPrismaBinary();
        if (fallbackBin.toLowerCase().endsWith('.cmd')) {
          console.log('[MigrationRunner] Trying prisma.cmd with shell...');
          const fallbackArgs = ['db', 'push', '--schema', schemaPath, '--accept-data-loss'];
          try {
            return await this.runPrismaProcess(fallbackBin, fallbackArgs, databaseUrl, false, true);
          } catch (fallbackErr) {
            console.error('[MigrationRunner] Fallback 1 failed:', fallbackErr);
          }
        }
      }
      
      // Fallback 2: Try with shell mode if we haven't yet
      if (!useShell && process.platform === 'win32') {
        console.log('[MigrationRunner] Trying with shell mode as last resort...');
        try {
          return await this.runPrismaProcess(cmd, cmdArgs, databaseUrl, !!prismaCliJs, true);
        } catch (shellErr) {
          console.error('[MigrationRunner] Shell fallback also failed:', shellErr);
        }
      }
      
      throw err;
    }
  }

  /**
   * Parse output to count applied migrations
   */
  private countAppliedMigrations(output: string): number {
    // Prisma outputs something like "X migration(s) applied successfully"
    const match = output.match(/(\d+)\s+migration[s]?\s+applied/i);
    if (match) {
      return parseInt(match[1], 10);
    }

    // If it says "already in sync" or similar
    if (output.includes('already in sync') || output.includes('Database is up to date')) {
      return 0;
    }

    // If we see "applied migration" lines, count them
    const appliedLines = output.match(/applying migration\s+`[^`]+`/gi);
    if (appliedLines) {
      return appliedLines.length;
    }

    return 0;
  }

  /**
   * Check migration status without applying
   */
  async checkMigrationStatus(): Promise<{
    pending: number;
    applied: number;
    total: number;
  }> {
    try {
      const schemaPath = this.getPrismaSchemaPath();
      const migrationsPath = path.join(path.dirname(schemaPath), 'migrations');

      if (!fs.existsSync(migrationsPath)) {
        return { pending: 0, applied: 0, total: 0 };
      }

      // Count all migration folders
      const migrationFolders = fs.readdirSync(migrationsPath)
        .filter(f => {
          const fullPath = path.join(migrationsPath, f);
          return fs.statSync(fullPath).isDirectory() && f.match(/^\d{14}_/);
        });

      const total = migrationFolders.length;

      // We can't easily check pending without connecting to DB
      // Return all as potentially pending
      return {
        pending: total,
        applied: 0,
        total,
      };
    } catch (error) {
      console.error('[MigrationRunner] Error checking status:', error);
      return { pending: 0, applied: 0, total: 0 };
    }
  }

  /**
   * Build a properly quoted Windows cmd.exe command line
   * Uses the pattern: ""C:\path\prisma.cmd" arg1 arg2 "C:\path with space\schema.prisma""
   */
  private buildWindowsCmdLine(exePath: string, args: string[]): string {
    const quoteArg = (s: string) => {
      if (!/[ \t"&^|<>]/.test(s)) return s;
      return `"${s.replace(/"/g, '\\"')}"`;
    };
    const joinedArgs = args.map(quoteArg).join(' ');
    return `""${exePath}" ${joinedArgs}"`;
  }
}

// ============== Singleton Export ==============

let instance: MigrationRunner | null = null;

export function getMigrationRunner(): MigrationRunner {
  if (!instance) {
    instance = new MigrationRunner();
  }
  return instance;
}

export async function runMigrations(): Promise<MigrationResult> {
  const runner = getMigrationRunner();
  return runner.runMigrations();
}
