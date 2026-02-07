// Script para generar iconos PWA
// Ejecutar: node scripts/generate-pwa-icons.js

const fs = require('fs');
const path = require('path');

// SVG base para el icono (cuadrado verde con texto POS)
const createSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#16A34A"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, sans-serif" font-weight="bold" 
        font-size="${size * 0.25}" fill="white">POS</text>
  <text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, sans-serif" font-weight="normal" 
        font-size="${size * 0.1}" fill="white">Bodega</text>
</svg>
`.trim();

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Crear directorio si no existe
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generar iconos SVG (funcionan como iconos en la mayoría de navegadores)
const sizes = [192, 512];

sizes.forEach(size => {
  const svg = createSVG(size);
  const filePath = path.join(iconsDir, `icon-${size}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`✅ Created ${filePath}`);
});

console.log('\n📝 Nota: Para producción, convierte los SVG a PNG usando:');
console.log('   - https://cloudconvert.com/svg-to-png');
console.log('   - O instala sharp: npm install sharp');
