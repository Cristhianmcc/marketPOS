// Script para generar iconos PNG para PWA
// Ejecutar: node scripts/generate-pwa-icons.cjs

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Crear directorio si no existe
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG base para el icono (fondo verde con texto POS)
const createSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#16A34A"/>
  <text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, Helvetica, sans-serif" font-weight="bold" 
        font-size="${Math.round(size * 0.28)}" fill="white">POS</text>
  <text x="50%" y="72%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, Helvetica, sans-serif" font-weight="normal" 
        font-size="${Math.round(size * 0.12)}" fill="rgba(255,255,255,0.9)">Bodega</text>
</svg>
`.trim();

async function generateIcons() {
  const sizes = [192, 512];

  for (const size of sizes) {
    const svg = createSVG(size);
    const outputPath = path.join(iconsDir, `icon-${size}.png`);

    try {
      await sharp(Buffer.from(svg))
        .png()
        .toFile(outputPath);
      console.log(`✅ Created ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error creating icon-${size}.png:`, error.message);
    }
  }

  console.log('\n🎉 Iconos PWA generados exitosamente!');
}

generateIcons().catch(console.error);
