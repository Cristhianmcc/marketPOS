# 🖼️ MÓDULO D6.2 — IMPRESIÓN RASTER (HTML→IMAGEN→ESC/POS)

**Estado:** ✅ Completado  
**Dependencias:** D6 (PrinterManager), D6-USB, D6.1-NET  
**Fecha:** Febrero 2026

---

## 📌 Resumen

El módulo D6.2 permite imprimir el ticket con el **mismo diseño CSS** que la página web `/receipt/[saleId]`, pero enviándolo como **imagen raster** a la impresora ESC/POS.

### Ventajas del modo Raster

| Problema con texto ESC/POS | Solución Raster |
|---------------------------|-----------------|
| Fuentes limitadas | CSS completo, cualquier fuente |
| Márgenes inconsistentes | Diseño exacto del web |
| Logos/imágenes complejos | Screenshot completo |
| Alineación difícil | Layout flex/grid funciona |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     RasterPrintManager                         │
│                        (index.ts)                               │
├─────────────────────────────────────────────────────────────────┤
│ 1. renderReceiptToPng.ts                                       │
│    └── Playwright Chromium → Screenshot PNG                    │
│                                                                 │
│ 2. printRaster.ts                                               │
│    └── Sharp → Bitmap 1-bit → ESC/POS GS v 0                   │
│                                                                 │
│ 3. transport.ts                                                 │
│    └── USB (printAndClose) o Network (printToNetworkPrinter)   │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de Impresión

```
/receipt/[saleId]?print=1
         │
         ▼
┌─────────────────────┐
│ Playwright Headless │
│    (Chromium)       │
└─────────────────────┘
         │ PNG Buffer
         ▼
┌─────────────────────┐
│  Sharp (grayscale,  │
│  threshold, 1-bit)  │
└─────────────────────┘
         │ Bitmap Buffer
         ▼
┌─────────────────────┐
│  ESC/POS GS v 0     │
│  (raster command)   │
└─────────────────────┘
         │
         ▼
    USB / Network
```

---

## 📁 Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `src/printing/raster/renderReceiptToPng.ts` | Captura HTML con Playwright |
| `src/printing/raster/printRaster.ts` | Conversión PNG→bitmap ESC/POS |
| `src/printing/raster/transport.ts` | Capa de transporte USB/Network |
| `src/printing/raster/index.ts` | RasterPrintManager y exports |

---

## 🔧 Configuración

### EscposConfig (extendido para Raster)

```typescript
interface EscposConfig {
  // Modo de impresión
  mode: 'HTML' | 'ESCPOS_USB' | 'ESCPOS_NET' | 'ESCPOS_RASTER';
  
  // USB (D6)
  vendorId: number | null;
  productId: number | null;
  
  // Network (D6.1)
  netHost: string | null;
  netPort: number;
  netTimeout: number;
  
  // Raster (D6.2)
  rasterTransport: 'USB' | 'NET';
  rasterWidthPx: 512 | 576 | 640;  // 576 = 80mm típico
  rasterDither: boolean;           // Mejora gradientes
  rasterCut: boolean;              // Corte automático
  rasterOpenDrawer: boolean;       // Abrir gaveta
  rasterMarginTopPx: number;
  rasterMarginLeftPx: number;
  
  // Común
  charsPerLine: 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: 'CP437' | 'CP850' | 'CP858' | 'ISO8859_15';
}
```

### Valores por Defecto

```typescript
{
  rasterTransport: 'USB',
  rasterWidthPx: 576,      // 80mm @ 203dpi
  rasterDither: true,
  rasterCut: true,
  rasterOpenDrawer: false,
  rasterMarginTopPx: 0,
  rasterMarginLeftPx: 0,
}
```

### Anchos Recomendados

| Papel | Ancho px | Resolución |
|-------|----------|------------|
| 58mm | 384-432 | 8 px/mm |
| 80mm | 512-576 | 8 px/mm |
| 80mm HD | 576-640 | 8+ px/mm |

---

## 🚀 API Frontend

### window.desktop.raster

```typescript
// Obtener configuración raster
const config = await window.desktop.raster.getConfig();

// Actualizar configuración
await window.desktop.raster.updateConfig({
  rasterTransport: 'NET',
  rasterWidthPx: 576,
  rasterDither: true,
  rasterCut: true,
});

// Validar configuración
const error = await window.desktop.raster.validateConfig();
// null = válido, string = error

// Test de impresión (genera HTML de prueba)
const result = await window.desktop.raster.testPrint();

// Imprimir venta
const result = await window.desktop.raster.printSale('sale_abc123');
```

### Resultado

```typescript
interface EscposPrintResult {
  success: boolean;
  error?: string;
  fallbackToHtml?: boolean;  // Si true, usar driver HTML
}
```

---

## 🖥️ Modo Print en /receipt

Para que Playwright capture el recibo correctamente, se agregaron modificaciones mínimas:

### Query Param `?print=1`

```
/receipt/abc123?print=1
```

Efectos:
- Oculta navbar y botones
- Fondo blanco puro
- Sin padding extra
- Establece `data-receipt-ready="true"` al cargar

### Atributo data-receipt-ready

```html
<div data-receipt-ready="true">
  <!-- Receipt content -->
</div>
```

Playwright espera este atributo antes de tomar screenshot.

---

## 🔌 IPC Handlers

```typescript
// main.ts
ipcMain.handle('raster:get-config', ...);
ipcMain.handle('raster:update-config', ...);
ipcMain.handle('raster:test-print', ...);
ipcMain.handle('raster:print-sale', ...);
ipcMain.handle('raster:validate-config', ...);
```

---

## 🧪 Testing Manual

### 1. Verificar Chromium instalado

```bash
cd desktop
npx playwright install chromium
```

### 2. Test desde DevTools

```javascript
// Verificar config
const config = await window.desktop.raster.getConfig();
console.log(config);

// Validar
const error = await window.desktop.raster.validateConfig();
console.log('Validation:', error || 'OK');

// Test print
const result = await window.desktop.raster.testPrint();
console.log('Test print:', result);

// Imprimir venta real
const sale = await window.desktop.raster.printSale('sale_xxx');
console.log('Sale print:', sale);
```

### 3. Checklist Manual

| Test | Esperado |
|------|----------|
| Modo Raster ON | Ticket idéntico a web |
| Corte automático | Funciona si `rasterCut: true` |
| CASH | Muestra pagó/vuelto |
| YAPE/PLIN | No muestra vuelto |
| FIADO | Muestra cliente/saldo |
| Promos/cupones | Visibles igual que pantalla |
| Error Playwright | Mensaje controlado, fallbackToHtml |
| No afecta HTML mode | Sigue funcionando |
| No afecta D6/D6.1 | Modos texto funcionan |

---

## 🔧 Conversión Imagen → ESC/POS

### Comando GS v 0 (Raster)

```
GS v 0 m xL xH yL yH d1...dk

m = 0      Normal (1:1)
m = 1      Double width
m = 2      Double height
m = 3      Quadruple

xL xH = width in bytes (width_px / 8)
yL yH = height in dots
```

### Procesamiento con Sharp

```typescript
sharp(pngBuffer)
  .resize(576)           // Ancho fijo
  .grayscale()           // Escala de grises
  .threshold(128)        // Convertir a 1-bit
  .negate()              // Invertir (negro = print)
  .raw()                 // Buffer crudo
```

---

## 📊 Comparativa de Modos

| Característica | HTML | ESC/POS Texto | ESC/POS Raster |
|---------------|------|---------------|----------------|
| Diseño | CSS completo | Muy limitado | CSS completo |
| Fuentes | Todas | Solo built-in | Todas |
| Logos | Sí (driver) | Difícil | Sí |
| Velocidad | ~1s | ~0.3s | ~1-2s |
| Dependencia | Driver | Ninguna | Playwright |
| Tamaño datos | N/A | ~2KB | ~50-200KB |
| Calidad | Depende driver | Media | Alta |

---

## 🐛 Troubleshooting

### Playwright no inicia

1. Verificar instalación: `npx playwright install chromium`
2. Verificar permisos de carpeta
3. Verificar antivirus no bloquea

### Imagen muy oscura/clara

1. Ajustar threshold (`rasterDither: true` ayuda)
2. Verificar diseño CSS tiene buen contraste

### Impresión lenta

1. Reducir `rasterWidthPx` a 512
2. Optimizar CSS del receipt (menos elementos)
3. El primer print es más lento (carga browser)

### Error "Receipt not ready"

1. Verificar que `data-receipt-ready="true"` está en el HTML
2. Aumentar timeout en `renderReceiptToPng`
3. Verificar que la venta existe

---

## 📚 Referencias

- [Playwright API](https://playwright.dev/docs/api/class-page)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [ESC/POS Raster Commands](https://reference.epson-biz.com/modules/ref_escpos/index.php?content_id=94)

---

## ✅ Checklist D6.2

- [x] Instalar playwright y sharp
- [x] Tipos raster en types.ts
- [x] renderReceiptToPng.ts (Playwright)
- [x] transport.ts (USB/Network)
- [x] printRaster.ts (Sharp + ESC/POS)
- [x] index.ts (RasterPrintManager)
- [x] IPC handlers en main.ts
- [x] Preload API raster
- [x] /receipt con modo print=1
- [x] TypeScript compila sin errores
- [x] Documentación completa

---

## 🔄 Integración con Modos Existentes

El módulo D6.2 **no rompe** los modos existentes:

```typescript
// El frontend decide qué usar según config.mode
switch (config.mode) {
  case 'HTML':
    await window.desktop.printing.print({ saleId });
    break;
  case 'ESCPOS_USB':
  case 'ESCPOS_NET':
    await window.desktop.escpos.printSale(saleId);
    break;
  case 'ESCPOS_RASTER':
    await window.desktop.raster.printSale(saleId);
    break;
}
```
