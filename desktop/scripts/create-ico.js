const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '../../public/icons/icon-512.png');
const icoPath = path.join(__dirname, '../resources/icon.ico');

// Ensure resources directory exists
const resourcesDir = path.dirname(icoPath);
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

pngToIco(pngPath)
  .then(buf => {
    fs.writeFileSync(icoPath, buf);
    console.log('✓ icon.ico created at:', icoPath);
  })
  .catch(err => {
    console.error('Error creating ico:', err);
    process.exit(1);
  });
