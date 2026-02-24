# 🌐 MÓDULO D6.1 — IMPRESIÓN ESC/POS NETWORK (IP:9100)

**Estado:** ✅ Completado  
**Dependencias:** D6-USB (EscposPrintManager base)  
**Fecha:** $(date)

---

## 📌 Resumen

El módulo D6.1 extiende D6-USB para soportar impresoras térmicas ESC/POS conectadas por **red TCP/IP**, típicamente en puerto **9100** (estándar RAW printing).

### Modos de Impresión

| Modo | Descripción |
|------|-------------|
| `HTML` | Usa driver Windows/macOS (webContents.print) |
| `ESCPOS_USB` | Conexión USB directa via libusb |
| `ESCPOS_NET` | Conexión TCP/IP puerto 9100 |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      EscposPrintManager                        │
│                         (index.ts)                              │
├─────────────────────────────────────────────────────────────────┤
│  config.mode = ?                                                │
│     ├── 'HTML'        → webContents.print() (D6 base)           │
│     ├── 'ESCPOS_USB'  → usbPrinter.ts (D6-USB)                  │
│     └── 'ESCPOS_NET'  → networkPrinter.ts (D6.1-NET)            │
├─────────────────────────────────────────────────────────────────┤
│  testPrint(full?)     → testPrintUsb() | testPrintNetwork()    │
│  printSale(saleId)    → printSaleUsb() | printSaleNetwork()    │
│  pingNetworkPrinter() → pingPrinter() (connectivity check)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Archivos Creados/Modificados

### Archivos Nuevos (D6.1)

| Archivo | Descripción |
|---------|-------------|
| `src/printing/escpos/networkPrinter.ts` | Conexión TCP, validación IP/puerto |
| `src/printing/escpos/pingPrinter.ts` | Test de conectividad, escaneo subnet |

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `src/printing/escpos/types.ts` | `PrinterMode`, campos `netHost`, `netPort`, `netTimeout` |
| `src/printing/escpos/index.ts` | Routing por modo, métodos network |
| `src/main.ts` | Handler IPC `escpos:net-ping` |
| `src/preload.ts` | API `window.desktop.escpos.netPing()` |

---

## 🔧 Configuración

### EscposConfig Completo

```typescript
interface EscposConfig {
  // Modo de impresión
  mode: 'HTML' | 'ESCPOS_USB' | 'ESCPOS_NET';
  
  // USB (D6)
  vendorId: number | null;
  productId: number | null;
  
  // Network (D6.1)
  netHost: string;      // IP de la impresora, ej: "192.168.1.100"
  netPort: number;      // Puerto, default: 9100
  netTimeout: number;   // Timeout en ms, default: 5000
  
  // Común
  charsPerLine: 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: 'CP437' | 'CP850' | 'CP858' | 'ISO8859_15';
}
```

### Defaults

```typescript
const DEFAULT_CONFIG: EscposConfig = {
  mode: 'HTML',
  vendorId: null,
  productId: null,
  netHost: '',
  netPort: 9100,
  netTimeout: 5000,
  charsPerLine: 48,
  autoCut: true,
  openCashDrawer: false,
  encoding: 'CP858',  // Soporta símbolo €
};
```

---

## 🚀 API Frontend

### window.desktop.escpos

```typescript
// Listar impresoras USB conectadas
const usbPrinters = await window.desktop.escpos.listUsb();

// Obtener configuración actual
const config = await window.desktop.escpos.getConfig();

// Actualizar configuración (cambiar a modo network)
await window.desktop.escpos.updateConfig({
  mode: 'ESCPOS_NET',
  netHost: '192.168.1.100',
  netPort: 9100,
});

// Test de conectividad (D6.1)
const ping = await window.desktop.escpos.netPing();
// { ok: true, latencyMs: 12 }
// { ok: false, reason: 'ECONNREFUSED: Impresora apagada o IP incorrecta' }

// Test de impresión (funciona en cualquier modo)
const result = await window.desktop.escpos.testPrint(true);
// { success: true }
// { success: false, error: '...', fallbackToHtml: true }

// Imprimir venta
const sale = await window.desktop.escpos.printSale('sale_abc123');
```

---

## 🔌 networkPrinter.ts

### Funciones Exportadas

```typescript
// Conectar a impresora de red
connectNetworkPrinter(host: string, port?: number, timeout?: number): Promise<Socket>

// Enviar datos ESC/POS y cerrar conexión
printToNetworkPrinter(host: string, data: Buffer, port?: number, timeout?: number): Promise<void>

// Validaciones
isValidIp(ip: string): boolean
isValidPort(port: number): boolean
```

### Manejo de Errores

| Código | Mensaje Usuario |
|--------|-----------------|
| `ECONNREFUSED` | Impresora apagada o IP incorrecta |
| `ETIMEDOUT` | Impresora no responde (timeout) |
| `ENOTFOUND` | Host no encontrado en la red |
| `ENETUNREACH` | Red no accesible |
| `EHOSTUNREACH` | Host no accesible |

---

## 🏓 pingPrinter.ts

### Funciones Exportadas

```typescript
// Ping simple a un host:puerto
pingPrinter(host: string, port?: number, timeout?: number): Promise<PingResult>

// Ping múltiples hosts
pingMultiplePrinters(hosts: string[], port?: number): Promise<Map<string, PingResult>>

// Escanear subnet (últimos 50 octetos, para descubrimiento)
scanSubnetForPrinters(subnet: string, port?: number): Promise<string[]>
```

### PingResult

```typescript
interface PingResult {
  ok: boolean;
  reason?: string;     // Solo si ok=false
  latencyMs?: number;  // Solo si ok=true
}
```

---

## 🧪 Testing Manual

### 1. Verificar Compilación

```bash
cd desktop
npx tsc --noEmit
```

### 2. Configurar Impresora Network

Desde DevTools del renderer:

```javascript
// Paso 1: Verificar conectividad
const ping = await window.desktop.escpos.netPing('192.168.1.100', 9100);
console.log(ping);
// { ok: true, latencyMs: 8 }

// Paso 2: Configurar modo network
await window.desktop.escpos.updateConfig({
  mode: 'ESCPOS_NET',
  netHost: '192.168.1.100',
  netPort: 9100,
  netTimeout: 5000,
});

// Paso 3: Test de impresión
const result = await window.desktop.escpos.testPrint();
console.log(result);
// { success: true }
```

### 3. Probar Fallback a HTML

Si la impresora network no responde:

```javascript
// Si devuelve fallbackToHtml: true, el UI debe usar webContents.print()
const result = await window.desktop.escpos.printSale('sale_123');
if (result.fallbackToHtml) {
  // Mostrar diálogo de impresión HTML
  await window.desktop.printing.print({ saleId: 'sale_123' });
}
```

---

## 🔒 Validaciones de Seguridad

1. **IP válida:** Regex para formato IPv4 (x.x.x.x)
2. **Puerto válido:** Rango 1-65535
3. **Timeout:** Previene conexiones colgadas
4. **Cierre de socket:** Cleanup en finally para evitar leaks

---

## 📊 Comparativa USB vs Network

| Aspecto | USB | Network |
|---------|-----|---------|
| Latencia | ~5ms | ~10-50ms |
| Fiabilidad | Alta | Depende de red |
| Distancia | <5m cable | Cualquier lugar en LAN |
| Configuración | VendorId/ProductId | IP:Puerto |
| Descubrimiento | listUsb() automático | pingMultiple o scanSubnet |

---

## 🐛 Troubleshooting

### Impresora no responde

1. Verificar IP correcta: `ping 192.168.1.100`
2. Verificar puerto abierto: `Test-NetConnection 192.168.1.100 -Port 9100`
3. Verificar firewall no bloquea puerto 9100
4. Reiniciar impresora

### Caracteres incorrectos

1. Verificar encoding en config (`CP858` para €)
2. Verificar charsPerLine (42 para 58mm, 48 para 80mm)

### Conexión lenta

1. Aumentar netTimeout a 10000ms
2. Verificar congestión de red
3. Usar cable ethernet (no WiFi)

---

## 📚 Referencias

- [ESC/POS Command Reference](https://reference.epson-biz.com/modules/ref_escpos/index.php)
- [Puerto 9100 RAW Printing](https://en.wikipedia.org/wiki/JetDirect)
- [Node.js net module](https://nodejs.org/api/net.html)

---

## ✅ Checklist D6.1

- [x] Instalar escpos-network
- [x] networkPrinter.ts (TCP connection)
- [x] pingPrinter.ts (connectivity test)
- [x] Actualizar types.ts (PrinterMode, network fields)
- [x] Actualizar index.ts (routing por modo)
- [x] IPC handlers en main.ts
- [x] Actualizar preload.ts API
- [x] TypeScript compila sin errores
- [x] Documentación completa
