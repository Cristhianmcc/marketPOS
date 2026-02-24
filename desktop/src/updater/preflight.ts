/**
 * D7 - Preflight Checks
 * Verifies system requirements before starting the app
 */

import { app, dialog, BrowserWindow } from 'electron';
import { execSync, spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations as runMigrationsDeploy, MigrationResult } from './runMigrations';

// ============== Types ==============

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
  canContinue: boolean;
}

export interface PreflightCheck {
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message: string;
  details?: string;
  canContinue: boolean;
}

// ============== Preflight Manager ==============

export class PreflightManager {
  private resourcesPath: string;
  private isProd: boolean;

  constructor() {
    this.isProd = app.isPackaged;
    this.resourcesPath = this.isProd
      ? path.join(process.resourcesPath)
      : path.join(__dirname, '..', '..');
  }

  // ============== Main Check ==============

  async runAllChecks(): Promise<PreflightResult> {
    const checks: PreflightCheck[] = [];

    // 1. Check PostgreSQL is running
    checks.push(await this.checkPostgres());

    // 2. Check database exists
    checks.push(await this.checkDatabaseExists());

    // 3. Check migrations (if Prisma is used)
    checks.push(await this.checkMigrations());

    // 4. Check server files exist (production only)
    if (this.isProd) {
      checks.push(await this.checkServerFiles());
    }

    // 5. Check required ports are available
    checks.push(await this.checkPortAvailable(3001));

    // Calculate overall result
    const failed = checks.filter(c => c.status === 'failed' && !c.canContinue);
    const success = failed.length === 0;
    const canContinue = checks.every(c => c.canContinue);

    return { success, checks, canContinue };
  }

  // ============== Individual Checks ==============

  async checkPostgres(): Promise<PreflightCheck> {
    const name = 'PostgreSQL';
    
    try {
      // D7.1: With embedded PostgreSQL, DATABASE_URL is set by ensurePostgres()
      // Check if DATABASE_URL environment variable is set
      if (process.env.DATABASE_URL) {
        // Extract port from DATABASE_URL
        const portMatch = process.env.DATABASE_URL.match(/:(\d+)\//);
        const port = portMatch ? parseInt(portMatch[1], 10) : 5432;
        
        const isRunning = await this.isPortInUse(port);
        if (isRunning) {
          return {
            name,
            status: 'passed',
            message: `PostgreSQL embebido activo (puerto ${port})`,
            canContinue: true,
          };
        }
      }
      
      // Fallback: Try to connect to standard PostgreSQL port
      const isRunning = await this.isPortInUse(5432);
      
      if (isRunning) {
        return {
          name,
          status: 'passed',
          message: 'PostgreSQL está ejecutándose',
          canContinue: true,
        };
      }

      // Not running - try to start it (Windows)
      if (process.platform === 'win32') {
        const started = await this.tryStartPostgresWindows();
        if (started) {
          return {
            name,
            status: 'passed',
            message: 'PostgreSQL iniciado automáticamente',
            canContinue: true,
          };
        }
      }

      return {
        name,
        status: 'failed',
        message: 'PostgreSQL no está ejecutándose',
        details: 'Inicie PostgreSQL manualmente o use el script de instalación',
        canContinue: false,
      };
    } catch (error) {
      return {
        name,
        status: 'failed',
        message: 'Error verificando PostgreSQL',
        details: error instanceof Error ? error.message : 'Unknown error',
        canContinue: false,
      };
    }
  }

  async checkDatabaseExists(): Promise<PreflightCheck> {
    const name = 'Base de Datos';
    const dbName = 'marketpos_desktop';
    
    try {
      // Try to query the database
      const psqlPath = this.findPsqlPath();
      if (!psqlPath) {
        return {
          name,
          status: 'warning',
          message: 'No se puede verificar la base de datos',
          details: 'psql no encontrado en PATH',
          canContinue: true,
        };
      }

      try {
        execSync(`"${psqlPath}" -U postgres -lqt`, {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
        });

        // Check if our database exists
        const result = execSync(
          `"${psqlPath}" -U postgres -lqt | findstr ${dbName}`,
          { encoding: 'utf-8', timeout: 5000, windowsHide: true }
        );

        if (result.includes(dbName)) {
          return {
            name,
            status: 'passed',
            message: `Base de datos '${dbName}' existe`,
            canContinue: true,
          };
        }
      } catch {
        // Database doesn't exist - try to create it
        return {
          name,
          status: 'warning',
          message: `Base de datos '${dbName}' no encontrada`,
          details: 'Se creará automáticamente al iniciar',
          canContinue: true,
        };
      }

      return {
        name,
        status: 'passed',
        message: `Base de datos '${dbName}' verificada`,
        canContinue: true,
      };
    } catch (error) {
      return {
        name,
        status: 'warning',
        message: 'No se pudo verificar la base de datos',
        details: error instanceof Error ? error.message : 'Unknown error',
        canContinue: true,
      };
    }
  }

  async checkMigrations(): Promise<PreflightCheck> {
    const name = 'Migraciones';
    
    try {
      const prismaPath = path.join(this.resourcesPath, 'server', 'prisma');
      const migrationsPath = path.join(prismaPath, 'migrations');

      if (!fs.existsSync(migrationsPath)) {
        return {
          name,
          status: 'skipped',
          message: 'No hay migraciones para verificar',
          canContinue: true,
        };
      }

      // Count migration folders
      const migrations = fs.readdirSync(migrationsPath)
        .filter(f => fs.statSync(path.join(migrationsPath, f)).isDirectory());

      return {
        name,
        status: 'passed',
        message: `${migrations.length} migraciones encontradas`,
        canContinue: true,
      };
    } catch (error) {
      return {
        name,
        status: 'warning',
        message: 'No se pudieron verificar migraciones',
        details: error instanceof Error ? error.message : 'Unknown error',
        canContinue: true,
      };
    }
  }

  async checkServerFiles(): Promise<PreflightCheck> {
    const name = 'Archivos del Servidor';
    
    try {
      const serverPath = path.join(this.resourcesPath, 'server');
      const serverJs = path.join(serverPath, 'server.js');

      if (!fs.existsSync(serverJs)) {
        return {
          name,
          status: 'failed',
          message: 'Archivos del servidor no encontrados',
          details: `No existe: ${serverJs}`,
          canContinue: false,
        };
      }

      return {
        name,
        status: 'passed',
        message: 'Archivos del servidor verificados',
        canContinue: true,
      };
    } catch (error) {
      return {
        name,
        status: 'failed',
        message: 'Error verificando archivos',
        details: error instanceof Error ? error.message : 'Unknown error',
        canContinue: false,
      };
    }
  }

  async checkPortAvailable(port: number): Promise<PreflightCheck> {
    const name = `Puerto ${port}`;
    
    try {
      const inUse = await this.isPortInUse(port);
      
      if (inUse) {
        return {
          name,
          status: 'warning',
          message: `Puerto ${port} está en uso`,
          details: 'Otro servidor puede estar ejecutándose',
          canContinue: true, // We might be reconnecting
        };
      }

      return {
        name,
        status: 'passed',
        message: `Puerto ${port} disponible`,
        canContinue: true,
      };
    } catch (error) {
      return {
        name,
        status: 'warning',
        message: `No se pudo verificar puerto ${port}`,
        canContinue: true,
      };
    }
  }

  // ============== Migration Execution ==============

  async applyMigrations(): Promise<MigrationResult> {
    try {
      console.log('[Preflight] Applying database migrations...');
      return await runMigrationsDeploy();
    } catch (error) {
      console.error('[Preflight] Migration error:', error);
      return {
        success: false,
        migrationsApplied: 0,
        migrationsSkipped: 0,
        message: 'Migration failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============== Helpers ==============

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(false);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  private async tryStartPostgresWindows(): Promise<boolean> {
    try {
      // Try to start PostgreSQL service
      execSync('net start postgresql-x64-16', {
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
      });
      
      // Wait for it to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify it's running
      return await this.isPortInUse(5432);
    } catch {
      // Try older version names
      const versions = ['15', '14', '13', '12'];
      for (const ver of versions) {
        try {
          execSync(`net start postgresql-x64-${ver}`, {
            encoding: 'utf-8',
            timeout: 30000,
            windowsHide: true,
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
          if (await this.isPortInUse(5432)) {
            return true;
          }
        } catch {
          continue;
        }
      }
    }
    return false;
  }

  private findPsqlPath(): string | null {
    // Check if psql is in PATH
    try {
      execSync('where psql', { encoding: 'utf-8', windowsHide: true });
      return 'psql';
    } catch {
      // Not in PATH, check common locations
      const commonPaths = [
        'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
        'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
        'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
      ];

      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    }
    return null;
  }

  // ============== UI ==============

  async showPreflightDialog(window: BrowserWindow | null): Promise<boolean> {
    const result = await this.runAllChecks();

    if (result.success) {
      // Run migrations when all checks pass
      console.log('[Preflight] Checks passed, running migrations...');
      const migrationResult = await this.applyMigrations();
      if (!migrationResult.success) {
        await dialog.showMessageBox(window || undefined as any, {
          type: 'error',
          title: 'Error de Migraciones',
          message: 'No se pudieron aplicar las migraciones',
          detail: migrationResult.error || 'Error desconocido',
          buttons: ['Cerrar'],
        });
        return false;
      }
      console.log(`[Preflight] Migrations: ${migrationResult.message}`);
      return true;
    }

    // Build message
    const failedChecks = result.checks
      .filter(c => c.status === 'failed')
      .map(c => `❌ ${c.name}: ${c.message}${c.details ? `\n   ${c.details}` : ''}`)
      .join('\n');

    const warningChecks = result.checks
      .filter(c => c.status === 'warning')
      .map(c => `⚠️ ${c.name}: ${c.message}`)
      .join('\n');

    const message = [
      failedChecks ? `Errores:\n${failedChecks}` : '',
      warningChecks ? `Advertencias:\n${warningChecks}` : '',
    ].filter(Boolean).join('\n\n');

    if (!result.canContinue) {
      await dialog.showMessageBox(window || undefined as any, {
        type: 'error',
        title: 'Error de Inicio',
        message: 'No se puede iniciar Monterrial POS',
        detail: message,
        buttons: ['Cerrar'],
      });
      return false;
    }

    // Can continue with warnings
    const response = await dialog.showMessageBox(window || undefined as any, {
      type: 'warning',
      title: 'Advertencias de Inicio',
      message: 'Se encontraron problemas',
      detail: message + '\n\n¿Desea continuar de todas formas?',
      buttons: ['Continuar', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
    });

    return response.response === 0;
  }
}

// ============== Run Migrations ==============

/**
 * Legacy function for backward compatibility.
 * Uses the new MigrationRunner from runMigrations.ts
 */
export async function runMigrations(resourcesPath: string): Promise<boolean> {
  console.log('[Preflight] Running migrations via MigrationRunner...');
  try {
    const result = await runMigrationsDeploy();
    if (result.success) {
      console.log(`[Preflight] ${result.message}`);
      return true;
    } else {
      console.error(`[Preflight] Migration failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('[Preflight] Migration error:', error);
    return false;
  }
}

// ============== Export ==============

export function createPreflightManager(): PreflightManager {
  return new PreflightManager();
}
