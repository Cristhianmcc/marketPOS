#!/usr/bin/env node
/**
 * Genera los iconos de la aplicación desde el SVG del logo Monterrial.
 *   icon-256.png  → cuadrado con fondo verde oscuro (instalador / ventana)
 *   icon-tray.png → redondo con fondo verde oscuro (bandeja del sistema)
 *   icon.ico      → multi-tamaño ICO para Windows (16, 32, 48, 256)
 *
 * Uso: node scripts/generate-icons.js
 */

const sharp      = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco   = pngToIcoMod.default || pngToIcoMod.imagesToIco || pngToIcoMod;
const path     = require('path');
const fs       = require('fs');

const RESOURCES = path.join(__dirname, '..', 'resources');

// ── Icono cuadrado (fondo verde + montañas) ───────────────────────────────────
const SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#0E2A24"/>
  <path d="M18 104 L58 46 L78 70 L94 52 L110 104 Z" fill="#F3F1EC"/>
  <path d="M58 46 L70 64 L66 72 L54 60 Z"           fill="#0E2A24" opacity="0.8"/>
  <path d="M94 52 L86 62 L78 70 L88 72 L98 62 Z"    fill="#0E2A24" opacity="0.8"/>
  <path d="M58 46 L70 64 L66 72 L58 60 Z"           fill="#BFA463"/>
</svg>`;

// ── Icono redondo (circulo verde + montañas) ──────────────────────────────────
const ROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#0E2A24"/>
  <path d="M18 104 L58 46 L78 70 L94 52 L110 104 Z" fill="#F3F1EC"/>
  <path d="M58 46 L70 64 L66 72 L54 60 Z"           fill="#0E2A24" opacity="0.8"/>
  <path d="M94 52 L86 62 L78 70 L88 72 L98 62 Z"    fill="#0E2A24" opacity="0.8"/>
  <path d="M58 46 L70 64 L66 72 L58 60 Z"           fill="#BFA463"/>
</svg>`;

async function main() {
  console.log('Generando iconos...\n');

  // 1. icon-256.png — cuadrado para ventana / acceso directo
  await sharp(Buffer.from(SQUARE_SVG))
    .resize(256, 256)
    .png()
    .toFile(path.join(RESOURCES, 'icon-256.png'));
  console.log('✓ icon-256.png');

  // 2. icon-tray.png — redondo para la bandeja del sistema
  await sharp(Buffer.from(ROUND_SVG))
    .resize(256, 256)
    .png()
    .toFile(path.join(RESOURCES, 'icon-tray.png'));
  console.log('✓ icon-tray.png');

  // 3. icon.ico — múltiples tamaños para Windows
  const sizes = [16, 32, 48, 256];
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(Buffer.from(SQUARE_SVG)).resize(size, size).png().toBuffer()
    )
  );
  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(RESOURCES, 'icon.ico'), icoBuffer);
  console.log('✓ icon.ico');

  console.log('\n✅ Todos los iconos generados correctamente.');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
