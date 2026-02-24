/**
 * Monterrial POS Desktop - Build Preparation Script
 * 
 * Copies necessary files to build-resources/ before electron-builder runs.
 * This ensures consistent paths regardless of how electron-builder resolves relative paths.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DESKTOP_DIR = path.join(__dirname, '..');
const BUILD_RESOURCES = path.join(DESKTOP_DIR, 'build-resources');

// Files to copy
const COPY_TASKS = [
  {
    from: path.join(ROOT_DIR, '.next', 'standalone'),
    to: path.join(BUILD_RESOURCES, 'server'),
    name: 'Next.js standalone server'
  },
  {
    from: path.join(ROOT_DIR, '.next', 'static'),
    to: path.join(BUILD_RESOURCES, 'static'),
    name: 'Next.js static files'
  },
  {
    from: path.join(ROOT_DIR, 'public'),
    to: path.join(BUILD_RESOURCES, 'public'),
    name: 'Public assets'
  },
  {
    from: path.join(ROOT_DIR, 'prisma'),
    to: path.join(BUILD_RESOURCES, 'prisma'),
    name: 'Prisma schema'
  },
  // IMPORTANT: Also copy prisma to server/prisma for MigrationRunner to find it
  {
    from: path.join(ROOT_DIR, 'prisma'),
    to: path.join(BUILD_RESOURCES, 'server', 'prisma'),
    name: 'Prisma schema (server copy)'
  },
  {
    from: path.join(ROOT_DIR, '.env'),
    to: path.join(BUILD_RESOURCES, '.env'),
    name: '.env file',
    isFile: true
  },
  // Also copy .env to server directory
  {
    from: path.join(ROOT_DIR, '.env'),
    to: path.join(BUILD_RESOURCES, 'server', '.env'),
    name: '.env file (server copy)',
    isFile: true
  },
  // Copy ALL @prisma packages at once to avoid missing sub-package errors
  {
    from: path.join(ROOT_DIR, 'node_modules', '@prisma'),
    to: path.join(BUILD_RESOURCES, 'server', 'node_modules', '@prisma'),
    name: '@prisma (all packages)'
  },
  {
    from: path.join(ROOT_DIR, 'node_modules', 'prisma'),
    to: path.join(BUILD_RESOURCES, 'server', 'node_modules', 'prisma'),
    name: 'prisma'
  },
  {
    from: path.join(ROOT_DIR, 'node_modules', '.bin', 'prisma.cmd'),
    to: path.join(BUILD_RESOURCES, 'server', 'node_modules', '.bin', 'prisma.cmd'),
    name: 'prisma.cmd',
    isFile: true
  },
  {
    from: path.join(ROOT_DIR, 'node_modules', '.bin', 'prisma'),
    to: path.join(BUILD_RESOURCES, 'server', 'node_modules', '.bin', 'prisma'),
    name: 'prisma (bin)',
    isFile: true
  }
];

/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean and recreate build-resources directory
 */
function cleanBuildResources() {
  console.log('Cleaning build-resources...');
  if (fs.existsSync(BUILD_RESOURCES)) {
    fs.rmSync(BUILD_RESOURCES, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_RESOURCES, { recursive: true });
}

/**
 * Main function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Monterrial POS - Build Preparation');
  console.log('='.repeat(60));
  console.log('');
  
  // Verify standalone exists
  const standalonePath = path.join(ROOT_DIR, '.next', 'standalone', 'server.js');
  if (!fs.existsSync(standalonePath)) {
    console.error('ERROR: Next.js standalone build not found!');
    console.error('Run "npm run desktop:standalone" from the root directory first.');
    process.exit(1);
  }
  
  // Clean build-resources
  cleanBuildResources();
  
  // Copy each task
  for (const task of COPY_TASKS) {
    console.log(`Copying ${task.name}...`);
    console.log(`  From: ${task.from}`);
    console.log(`  To:   ${task.to}`);
    
    try {
      if (task.isFile) {
        if (fs.existsSync(task.from)) {
          fs.mkdirSync(path.dirname(task.to), { recursive: true });
          fs.copyFileSync(task.from, task.to);
          console.log(`  ✓ Done`);
        } else {
          console.log(`  ⚠ Source file not found (skipped)`);
        }
      } else {
        if (!fs.existsSync(task.from)) {
          if (task.optional) {
            console.log(`  ⚠ Optional package not found (skipped)`);
          } else {
            throw new Error(`Source not found: ${task.from}`);
          }
        } else {
          copyDir(task.from, task.to);
          console.log(`  ✓ Done`);
        }
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      process.exit(1);
    }
    
    console.log('');
  }
  
  console.log('='.repeat(60));
  console.log('Build preparation complete!');
  console.log('='.repeat(60));
}

main();
