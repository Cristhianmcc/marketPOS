/**
 * MarketPOS Desktop - Build Standalone Script
 * 
 * This script prepares the Next.js standalone build for Electron packaging.
 * It copies necessary files to the desktop/resources folder.
 * 
 * Usage: npx ts-node scripts/desktop/build-standalone.ts
 * Or: npm run build:standalone (from root)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DESKTOP_DIR = path.join(ROOT_DIR, 'desktop');
const RESOURCES_DIR = path.join(DESKTOP_DIR, 'resources');
const STANDALONE_DIR = path.join(ROOT_DIR, '.next', 'standalone');
const STATIC_DIR = path.join(ROOT_DIR, '.next', 'static');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PRISMA_DIR = path.join(ROOT_DIR, 'prisma');

// ============================================================================
// UTILIDADES
// ============================================================================

function log(message: string): void {
  console.log(`[build-standalone] ${message}`);
}

function error(message: string): void {
  console.error(`[build-standalone] ERROR: ${message}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`);
  }
}

function copyRecursive(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  
  if (!fs.existsSync(src)) {
    throw new Error(`Source does not exist: ${src}`);
  }

  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    ensureDir(dest);
    const items = fs.readdirSync(src);
    for (const item of items) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    log(`Cleaned directory: ${dir}`);
  }
}

// ============================================================================
// BUILD STEPS
// ============================================================================

function checkPrerequisites(): void {
  log('Checking prerequisites...');
  
  // Check Next.js standalone output
  if (!fs.existsSync(STANDALONE_DIR)) {
    error('Next.js standalone build not found.');
    error('Run: npm run build (from project root)');
    error('Make sure next.config.ts has: output: "standalone"');
    process.exit(1);
  }
  
  // Check static files
  if (!fs.existsSync(STATIC_DIR)) {
    error('Next.js static files not found.');
    error('Run: npm run build (from project root)');
    process.exit(1);
  }
  
  log('Prerequisites OK');
}

function prepareResourcesDir(): void {
  log('Preparing resources directory...');
  
  const serverDir = path.join(RESOURCES_DIR, 'server');
  
  // Clean old server directory
  cleanDir(serverDir);
  
  // Create fresh server directory
  ensureDir(serverDir);
  
  log('Resources directory ready');
}

function copyStandaloneServer(): void {
  log('Copying Next.js standalone server...');
  
  const destServerDir = path.join(RESOURCES_DIR, 'server');
  
  // Copy entire standalone folder contents
  copyRecursive(STANDALONE_DIR, destServerDir);
  
  log('Standalone server copied');
}

function copyStaticFiles(): void {
  log('Copying static files...');
  
  const destStaticDir = path.join(RESOURCES_DIR, 'server', '.next', 'static');
  
  ensureDir(destStaticDir);
  copyRecursive(STATIC_DIR, destStaticDir);
  
  log('Static files copied');
}

function copyPublicFiles(): void {
  log('Copying public files...');
  
  if (!fs.existsSync(PUBLIC_DIR)) {
    log('No public directory found, skipping');
    return;
  }
  
  const destPublicDir = path.join(RESOURCES_DIR, 'server', 'public');
  
  ensureDir(destPublicDir);
  copyRecursive(PUBLIC_DIR, destPublicDir);
  
  log('Public files copied');
}

function copyPrismaFiles(): void {
  log('Copying Prisma schema and migrations...');
  
  if (!fs.existsSync(PRISMA_DIR)) {
    log('No prisma directory found, skipping');
    return;
  }
  
  const destPrismaDir = path.join(RESOURCES_DIR, 'server', 'prisma');
  
  ensureDir(destPrismaDir);
  
  // Copy schema.prisma
  const schemaPath = path.join(PRISMA_DIR, 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    fs.copyFileSync(schemaPath, path.join(destPrismaDir, 'schema.prisma'));
    log('Copied schema.prisma');
  }
  
  // Copy migrations folder
  const migrationsDir = path.join(PRISMA_DIR, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const destMigrationsDir = path.join(destPrismaDir, 'migrations');
    copyRecursive(migrationsDir, destMigrationsDir);
    
    // Count migrations
    const migrationFolders = fs.readdirSync(migrationsDir)
      .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory());
    log(`Copied ${migrationFolders.length} migrations`);
  }
  
  log('Prisma files copied');
}

function createEnvTemplate(): void {
  log('Creating .env template...');
  
  const envTemplatePath = path.join(RESOURCES_DIR, '.env.template');
  const envTemplate = `# MarketPOS Desktop Environment
# Copy this file to .env and configure values

# Database connection (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marketpos?schema=public"

# JWT Secret (generate a secure random string)
JWT_SECRET="your-jwt-secret-here"

# Desktop mode
DESKTOP_MODE="true"
NODE_ENV="production"

# Optional: Cloudinary (for image uploads)
# CLOUDINARY_CLOUD_NAME=""
# CLOUDINARY_API_KEY=""
# CLOUDINARY_API_SECRET=""
`;
  
  fs.writeFileSync(envTemplatePath, envTemplate);
  log('Created .env.template');
}

function verifyBuild(): void {
  log('Verifying build...');
  
  const serverJs = path.join(RESOURCES_DIR, 'server', 'server.js');
  
  if (!fs.existsSync(serverJs)) {
    error('server.js not found in output!');
    error('Build verification failed.');
    process.exit(1);
  }
  
  const staticCheck = path.join(RESOURCES_DIR, 'server', '.next', 'static');
  if (!fs.existsSync(staticCheck)) {
    error('Static files not found in output!');
    error('Build verification failed.');
    process.exit(1);
  }
  
  log('Build verified successfully!');
}

function printSummary(): void {
  log('');
  log('========================================');
  log('  BUILD STANDALONE COMPLETE');
  log('========================================');
  log('');
  log(`Output: ${path.join(RESOURCES_DIR, 'server')}`);
  log('');
  log('Next steps:');
  log('  1. cd desktop');
  log('  2. npm run build');
  log('');
  log('This will create the installer in desktop/dist-electron/');
  log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  log('MarketPOS Desktop - Build Standalone');
  log(`Root: ${ROOT_DIR}`);
  log(`Desktop: ${DESKTOP_DIR}`);
  log('');
  
  try {
    checkPrerequisites();
    prepareResourcesDir();
    copyStandaloneServer();
    copyStaticFiles();
    copyPublicFiles();
    copyPrismaFiles();
    createEnvTemplate();
    verifyBuild();
    printSummary();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
