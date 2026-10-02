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
   * Get the first migration folder name (used for baseline on existing DBs)
   */
  private getFirstMigrationName(schemaPath: string): string | null {
    const migrationsPath = path.join(path.dirname(schemaPath), 'migrations');
    if (!fs.existsSync(migrationsPath)) return null;

    const migrationFolders = fs.readdirSync(migrationsPath)
      .filter((f) => {
        const fullPath = path.join(migrationsPath, f);
        return fs.statSync(fullPath).isDirectory() && f.match(/^\d{4}_|^\d{14}_/);
      })
      .sort();

    return migrationFolders.length > 0 ? migrationFolders[0] : null;
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
   * Apply SQL patches for columns that may be missing from older installs.
   * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS — safe to run multiple times.
   */
  private async runSchemaPatch(databaseUrl: string): Promise<void> {
    const psqlPath = this.findPsqlPath();
    if (!psqlPath) {
      console.warn('[MigrationRunner] psql not found, skipping schema patch');
      return;
    }

    const conn = this.parseConnectionUrl(databaseUrl);
    const psqlBase = [
      '-h', conn.host,
      '-p', conn.port,
      '-U', conn.user,
      '-d', conn.database,
      '-v', 'ON_ERROR_STOP=0',
    ];

    // List of idempotent column patches — add new ones here as needed
    const patches: string[] = [
      // ticket_website added after initial release
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS ticket_website VARCHAR(255);`,
      // ticket_logo added for custom logo on receipt
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS ticket_logo VARCHAR(500);`,
      // cost_price added for purchase cost + margin feature
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);`,
      // CatalogStatus enum (PostgreSQL)
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CatalogStatus') THEN CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SYNC_PENDING', 'SYNC_ERROR', 'DISABLED'); END IF; END $$;`,
      // Fix catalog_status column type if table existed with VARCHAR(20)
      `DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'catalog_settings' AND column_name = 'catalog_status'
            AND data_type = 'character varying'
        ) THEN
          ALTER TABLE catalog_settings ALTER COLUMN catalog_status DROP DEFAULT;
          ALTER TABLE catalog_settings ALTER COLUMN catalog_status TYPE "CatalogStatus" USING catalog_status::"CatalogStatus";
          ALTER TABLE catalog_settings ALTER COLUMN catalog_status SET DEFAULT 'DRAFT';
        END IF;
      END $$;`,
      // catalog_settings table for public catalog feature
      `CREATE TABLE IF NOT EXISTS catalog_settings (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false,
        store_name VARCHAR(255) NOT NULL DEFAULT '',
        store_slug VARCHAR(255) UNIQUE,
        store_logo_path VARCHAR(500),
        store_banner_path VARCHAR(500),
        whatsapp_number VARCHAR(50) NOT NULL DEFAULT '',
        facebook_url VARCHAR(255),
        instagram_url VARCHAR(255),
        tiktok_url VARCHAR(255),
        catalog_status "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
        catalog_url VARCHAR(500),
        last_published_at TIMESTAMP(3),
        last_sync_at TIMESTAMP(3),
        sync_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      // social links for public catalog (in case table existed without them)
      `ALTER TABLE catalog_settings ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(255);`,
      `ALTER TABLE catalog_settings ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255);`,
      `ALTER TABLE catalog_settings ADD COLUMN IF NOT EXISTS tiktok_url VARCHAR(255);`,
      // catalog columns on store_products
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS publish_in_catalog BOOLEAN DEFAULT false;`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_title VARCHAR(255);`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_description TEXT;`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_image_path VARCHAR(500);`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_category VARCHAR(255);`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_visible BOOLEAN DEFAULT true;`,
      `ALTER TABLE store_products ADD COLUMN IF NOT EXISTS catalog_updated_at TIMESTAMP(3);`,

      // ═══════════════════════════════════════════════════════════════
      // MÓDULOS FARMACIA (PH1-PH12) — añadidos al sistema web
      // ═══════════════════════════════════════════════════════════════

      // 1. Nuevos valores del enum FeatureFlagKey
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_FEFO_SALES';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_PHARMA_FIELDS';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_MEDICINE_SEARCH';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_RESTRICTED_PRODUCTS';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_SUPPLIERS';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_PATIENTS';`,
      `ALTER TYPE "FeatureFlagKey" ADD VALUE IF NOT EXISTS 'ENABLE_CONTROLLED_BOOK';`,

      // 2. Nuevo valor en BusinessProfile
      `ALTER TYPE "BusinessProfile" ADD VALUE IF NOT EXISTS 'FARMACIA';`,

      // 3. Nuevos enums para farmacia
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
          CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InteractionSeverity') THEN
          CREATE TYPE "InteractionSeverity" AS ENUM ('LOW','MODERATE','HIGH');
        END IF;
      END $$;`,

      // 4. Columnas farmacéuticas en products_master (PH1)
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS commercial_name VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS generic_name VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS concentration VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS pharmaceutical_form VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS presentation VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS laboratory VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS sanitary_registry VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS medicine_category VARCHAR(255);`,
      `ALTER TABLE products_master ADD COLUMN IF NOT EXISTS barcode_secondary VARCHAR(255);`,

      // 5. Columnas farmacéuticas en sale_items (PH8 snapshot)
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS commercial_name VARCHAR(255);`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS generic_name VARCHAR(255);`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS ph_concentration VARCHAR(255);`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS pharmaceutical_form VARCHAR(255);`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_sunat_code_used VARCHAR(30);`,
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_breakdown JSONB;`,

      // 5b. Snapshot de costo en sale_items (ganancia por venta)
      `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);`,

      // 6. Columna batch_id en movements (PH2)
      `ALTER TABLE movements ADD COLUMN IF NOT EXISTS batch_id VARCHAR(30);`,

      // 7. Columnas FEFO y alertas de vencimiento en store_settings (PH3/PH4)
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS expired_batch_policy VARCHAR(20) NOT NULL DEFAULT 'BLOCK_EXPIRED';`,
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS fefo_enabled BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 60;`,
      `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS show_expired_warnings BOOLEAN NOT NULL DEFAULT true;`,

      // 8. Tabla product_batches (PH2 — lotes y vencimientos)
      `CREATE TABLE IF NOT EXISTS product_batches (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        store_product_id VARCHAR(30) NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
        batch_number VARCHAR(255) NOT NULL,
        expiry_date TIMESTAMP(3) NOT NULL,
        purchase_date TIMESTAMP(3),
        quantity_initial DECIMAL(18,6) NOT NULL,
        quantity_available DECIMAL(18,6) NOT NULL,
        unit_cost DECIMAL(10,2),
        active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS product_batches_store_product_batch_expiry_key
        ON product_batches(store_id, store_product_id, batch_number, expiry_date);`,
      `CREATE INDEX IF NOT EXISTS product_batches_store_product_idx ON product_batches(store_id, store_product_id);`,
      `CREATE INDEX IF NOT EXISTS product_batches_expiry_idx ON product_batches(expiry_date);`,
      `CREATE INDEX IF NOT EXISTS product_batches_store_active_idx ON product_batches(store_id, active);`,

      // 9. Tabla suppliers (PH9 — proveedores)
      `CREATE TABLE IF NOT EXISTS suppliers (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        ruc VARCHAR(20),
        contact_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS suppliers_store_active_idx ON suppliers(store_id, active);`,
      `CREATE INDEX IF NOT EXISTS suppliers_store_name_idx ON suppliers(store_id, name);`,

      // 10. Tabla purchase_orders (PH9)
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        supplier_id VARCHAR(30) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        created_by_id VARCHAR(30) NOT NULL REFERENCES users(id),
        order_number INT NOT NULL,
        status "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
        notes TEXT,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        expected_date TIMESTAMP(3),
        received_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_store_number_key ON purchase_orders(store_id, order_number);`,
      `CREATE INDEX IF NOT EXISTS purchase_orders_store_status_idx ON purchase_orders(store_id, status);`,
      `CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders(supplier_id);`,

      // 11. Tabla purchase_order_items (PH9)
      `CREATE TABLE IF NOT EXISTS purchase_order_items (
        id VARCHAR(30) PRIMARY KEY,
        purchase_order_id VARCHAR(30) NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        store_product_id VARCHAR(30) NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
        quantity_ordered DECIMAL(10,2) NOT NULL,
        quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(10,2) NOT NULL,
        batch_number VARCHAR(255),
        expiry_date TIMESTAMP(3)
      );`,
      `CREATE INDEX IF NOT EXISTS po_items_order_idx ON purchase_order_items(purchase_order_id);`,

      // 12. Tabla patients (PH10 — pacientes)
      `CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        dni VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        birth_date TIMESTAMP(3),
        gender VARCHAR(5),
        address TEXT,
        allergies TEXT,
        conditions TEXT,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS patients_store_dni_key ON patients(store_id, dni);`,
      `CREATE INDEX IF NOT EXISTS patients_store_name_idx ON patients(store_id, name);`,
      `CREATE INDEX IF NOT EXISTS patients_store_active_idx ON patients(store_id, active);`,

      // 13. Tabla patient_medications (PH10)
      `CREATE TABLE IF NOT EXISTS patient_medications (
        id VARCHAR(30) PRIMARY KEY,
        patient_id VARCHAR(30) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        sale_id VARCHAR(30) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        concentration VARCHAR(255),
        quantity DECIMAL(10,2) NOT NULL,
        prescribed_by VARCHAR(255),
        dosage VARCHAR(255),
        consult_reason TEXT,
        notes TEXT,
        dispensed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS patient_meds_patient_date_idx ON patient_medications(patient_id, dispensed_at);`,
      `CREATE INDEX IF NOT EXISTS patient_meds_patient_generic_idx ON patient_medications(patient_id, generic_name);`,
      `CREATE INDEX IF NOT EXISTS patient_meds_sale_idx ON patient_medications(sale_id);`,

      // 14. Tabla controlled_book_entries (PH11 — libro controlados)
      `CREATE TABLE IF NOT EXISTS controlled_book_entries (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        sale_id VARCHAR(30) NOT NULL,
        sale_number INT NOT NULL,
        sale_date TIMESTAMP(3) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        concentration VARCHAR(255),
        laboratory VARCHAR(255),
        batch_number VARCHAR(255),
        quantity DECIMAL(10,2) NOT NULL,
        prescription_number VARCHAR(255) NOT NULL,
        prescribed_by VARCHAR(255),
        cmp_number VARCHAR(50),
        patient_id VARCHAR(30) REFERENCES patients(id) ON DELETE SET NULL,
        patient_name VARCHAR(255) NOT NULL,
        patient_dni VARCHAR(30) NOT NULL,
        dispensed_by_id VARCHAR(30) NOT NULL REFERENCES users(id),
        dispensed_by_name VARCHAR(255) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS controlled_book_store_date_idx ON controlled_book_entries(store_id, sale_date);`,
      `CREATE INDEX IF NOT EXISTS controlled_book_store_dni_idx ON controlled_book_entries(store_id, patient_dni);`,
      `CREATE INDEX IF NOT EXISTS controlled_book_store_product_idx ON controlled_book_entries(store_id, product_name);`,
      `CREATE INDEX IF NOT EXISTS controlled_book_store_rx_idx ON controlled_book_entries(store_id, prescription_number);`,

      // 15. Tabla drug_interactions (PH12 — interacciones)
      `CREATE TABLE IF NOT EXISTS drug_interactions (
        id VARCHAR(30) PRIMARY KEY,
        drug_a VARCHAR(255) NOT NULL,
        drug_b VARCHAR(255) NOT NULL,
        severity "InteractionSeverity" NOT NULL,
        description TEXT NOT NULL,
        recommendation TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS drug_interactions_drugs_key ON drug_interactions(drug_a, drug_b);`,
      `CREATE INDEX IF NOT EXISTS drug_interactions_drug_a_idx ON drug_interactions(drug_a);`,
      `CREATE INDEX IF NOT EXISTS drug_interactions_drug_b_idx ON drug_interactions(drug_b);`,

      // 16. Tabla drug_interaction_logs (PH12)
      `CREATE TABLE IF NOT EXISTS drug_interaction_logs (
        id VARCHAR(30) PRIMARY KEY,
        store_id VARCHAR(30) NOT NULL,
        sale_id VARCHAR(30),
        patient_id VARCHAR(30) REFERENCES patients(id) ON DELETE SET NULL,
        drug_a VARCHAR(255) NOT NULL,
        drug_b VARCHAR(255) NOT NULL,
        severity "InteractionSeverity" NOT NULL,
        description TEXT NOT NULL,
        action VARCHAR(50) NOT NULL,
        acknowledged_by VARCHAR(30),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS drug_interaction_logs_store_date_idx ON drug_interaction_logs(store_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS drug_interaction_logs_patient_idx ON drug_interaction_logs(patient_id);`,
    ];

    const sql = patches.join('\n');
    const tmpSql = path.join(os.tmpdir(), `schema_patch_${Date.now()}.sql`);

    try {
      fs.writeFileSync(tmpSql, sql, 'utf-8');
      execFileSync(psqlPath, [...psqlBase, '-f', tmpSql], {
        env: { ...process.env, PGPASSWORD: conn.password },
        timeout: 15_000,
        stdio: 'pipe',
      });
      console.log('[MigrationRunner] Schema patch applied successfully');
    } catch (e) {
      console.error('[MigrationRunner] Schema patch error (non-fatal):', e);
    } finally {
      try { fs.unlinkSync(tmpSql); } catch { /* ignore */ }
    }
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

      // Apply SQL patches for columns missing in older installs
      await this.runSchemaPatch(databaseUrl);
      
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

      // Count real (14-digit timestamp) migration folders
      const migrationFolders = fs.readdirSync(migrationsPath)
        .filter(f => {
          const fullPath = path.join(migrationsPath, f);
          return fs.statSync(fullPath).isDirectory() && f.match(/^\d{14}_/);
        });

      console.log(`[MigrationRunner] Found ${migrationFolders.length} real migration(s)`);

      // If only baseline migrations exist (0001_init style with empty SQL),
      // fall through to db push so fresh installs get all tables created.
      if (migrationFolders.length === 0) {
        console.log('[MigrationRunner] Only baseline migrations found - using db push for schema creation');
        await this.execPrismaDbPush(schemaPath, databaseUrl);

        console.log('[MigrationRunner] Schema created via db push. User must complete /setup to provision store.');

        try {
          await this.seedGlobalCatalog(databaseUrl);
        } catch (seedErr) {
          console.error('[MigrationRunner] Catalog seed error (non-fatal):', seedErr);
        }

        return {
          success: true,
          migrationsApplied: 1,
          migrationsSkipped: 0,
          message: 'Schema pushed successfully (db push — baseline only)',
        };
      }

      // Run prisma migrate deploy
      let output = '';
      try {
        output = await this.execPrismaMigrate(schemaPath, databaseUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isP3005 = msg.includes('P3005') || msg.includes('database schema is not empty');

        if (isP3005) {
          const firstMigration = this.getFirstMigrationName(schemaPath);
          if (firstMigration) {
            console.warn(`[MigrationRunner] Detected existing DB. Baseline with migration: ${firstMigration}`);
            await this.execPrismaMigrateResolve(schemaPath, databaseUrl, firstMigration);
            output = await this.execPrismaMigrate(schemaPath, databaseUrl);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      
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
   * Execute prisma migrate resolve --applied <migration>
   * Used to baseline an existing database (avoid P3005)
   */
  private async execPrismaMigrateResolve(
    schemaPath: string,
    databaseUrl: string,
    migrationName: string,
  ): Promise<string> {
    const prismaCliJs = this.getPrismaCliJsPath();
    const prismaBin = prismaCliJs ? process.execPath : this.getPrismaBinary();
    const isNpx = !prismaCliJs && prismaBin.includes('npx');

    const args = isNpx
      ? [`prisma@${this.prismaVersion}`, 'migrate', 'resolve', '--applied', migrationName, '--schema', schemaPath]
      : ['migrate', 'resolve', '--applied', migrationName, '--schema', schemaPath];
    const fullArgs = prismaCliJs ? [prismaCliJs, ...args] : args;

    let cmd = isNpx
      ? (process.platform === 'win32' ? 'npx.cmd' : 'npx')
      : prismaBin;
    let cmdArgs = fullArgs;
    let useShell = false;

    if (process.platform === 'win32' && cmd.toLowerCase().endsWith('.cmd')) {
      useShell = true;
    }

    console.log(`[MigrationRunner] Running: ${cmd} ${cmdArgs.join(' ')}`);
    return this.runPrismaProcess(cmd, cmdArgs, databaseUrl, !!prismaCliJs, useShell);
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
