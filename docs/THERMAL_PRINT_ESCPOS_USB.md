# Impresión ESC/POS USB (D6-USB)

## Resumen

Módulo de impresión térmica raw ESC/POS vía USB para tickets 80mm con texto nítido y corte automático. Este modo es **adicional** al modo HTML existente y solo funciona en Desktop.

### Características
- ✅ Impresión raw ESC/POS (texto nítido)
- ✅ Detección automática de impresoras USB
- ✅ Corte automático de papel
- ✅ Apertura de gaveta (configurable)
- ✅ Soporte 42 y 48 columnas
- ✅ Fallback a modo HTML si falla

---

## Arquitectura

```
desktop/src/printing/escpos/
├── types.ts          # Tipos y configuración
├── usbPrinter.ts     # Detección y conexión USB
├── formatTicket.ts   # Formateador de tickets
├── testPrint.ts      # Test de impresión
└── index.ts          # Manager principal
```

---

## Modos de Impresión

| Modo | Descripción | Plataforma |
|------|-------------|------------|
| `HTML` | Usa driver de Windows y `window.print()` | Web + Desktop |
| `ESCPOS_USB` | Comandos raw ESC/POS directo a USB | Solo Desktop |

---

## Configuración

### EscposConfig

```typescript
interface EscposConfig {
  mode: 'HTML' | 'ESCPOS_USB';
  vendorId: number | null;      // ID del fabricante USB
  productId: number | null;     // ID del producto USB
  charsPerLine: 42 | 48;        // Columnas (80mm típico: 42)
  autoCut: boolean;             // Corte automático
  openCashDrawer: boolean;      // Abrir gaveta
  encoding: 'CP437' | 'CP850' | 'CP858' | 'ISO8859_15';
}
```

### Impresoras Conocidas

| Fabricante | Vendor ID | Nota |
|------------|-----------|------|
| EPSON | 0x04b8 | TM-T20, TM-T88 |
| Star Micronics | 0x0519 | TSP100 |
| Citizen | 0x2730 | CT-S310 |
| Custom | 0x0dd4 | KUBE |
| Brother | 0x04f9 | QL series |

---

## API Desktop

### Listar Impresoras USB

```typescript
const devices = await window.desktop.escpos.listUsb();

devices.forEach(d => {
  console.log(`${d.name} (${d.vendorId.toString(16)}:${d.productId.toString(16)})`);
});
```

### Configurar Impresora

```typescript
// Obtener config actual
const config = await window.desktop.escpos.getConfig();

// Actualizar
await window.desktop.escpos.updateConfig({
  mode: 'ESCPOS_USB',
  vendorId: 0x04b8,       // EPSON
  productId: 0x0e15,      // TM-T20III
  charsPerLine: 42,
  autoCut: true,
  openCashDrawer: false,
});
```

### Test de Impresión

```typescript
// Test completo (caracteres, alineación, etc.)
const result = await window.desktop.escpos.testPrint(true);

// Test mínimo (solo fecha)
const result = await window.desktop.escpos.testPrint(false);

if (result.success) {
  console.log('Test exitoso');
} else {
  console.error('Error:', result.error);
  if (result.fallbackToHtml) {
    // Usar modo HTML como fallback
  }
}
```

### Imprimir Venta

```typescript
const result = await window.desktop.escpos.printSale(saleId);

if (!result.success) {
  if (result.fallbackToHtml) {
    // Fallback a impresión HTML
    window.open(`/receipt/${saleId}?print=true`, '_blank');
  } else {
    alert(`Error: ${result.error}`);
  }
}
```

---

## UI: Configuración de Impresión

```tsx
// components/settings/PrinterSettings.tsx (extendido)
'use client';

import { useEffect, useState } from 'react';

export function EscposPrinterSettings() {
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [config, setConfig] = useState<EscposConfig | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!window.desktop?.escpos) return;
    
    loadConfig();
    scanDevices();
  }, []);

  const loadConfig = async () => {
    const c = await window.desktop.escpos.getConfig();
    setConfig(c);
  };

  const scanDevices = async () => {
    const d = await window.desktop.escpos.listUsb();
    setDevices(d);
  };

  const handleModeChange = async (mode: 'HTML' | 'ESCPOS_USB') => {
    await window.desktop.escpos.updateConfig({ mode });
    loadConfig();
  };

  const handleSelectDevice = async (vendorId: number, productId: number) => {
    await window.desktop.escpos.updateConfig({ 
      vendorId, 
      productId,
      mode: 'ESCPOS_USB' 
    });
    loadConfig();
  };

  const handleTestPrint = async () => {
    setTesting(true);
    const result = await window.desktop.escpos.testPrint(true);
    setTesting(false);
    
    if (result.success) {
      alert('Impresión de prueba exitosa');
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  if (!window.desktop?.escpos) {
    return <p>Solo disponible en app desktop</p>;
  }

  return (
    <div className="space-y-6">
      <h3 className="font-bold">Modo de Impresión</h3>
      
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={config?.mode === 'HTML'}
            onChange={() => handleModeChange('HTML')}
          />
          HTML (Driver)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={config?.mode === 'ESCPOS_USB'}
            onChange={() => handleModeChange('ESCPOS_USB')}
          />
          ESC/POS (USB)
        </label>
      </div>

      {config?.mode === 'ESCPOS_USB' && (
        <>
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4>Impresora USB</h4>
              <button onClick={scanDevices} className="text-sm">
                Detectar
              </button>
            </div>
            
            {devices.length === 0 ? (
              <p className="text-gray-500">No se encontraron impresoras USB</p>
            ) : (
              <select
                value={config.vendorId && config.productId 
                  ? `${config.vendorId}:${config.productId}` 
                  : ''}
                onChange={(e) => {
                  const [v, p] = e.target.value.split(':').map(Number);
                  handleSelectDevice(v, p);
                }}
              >
                <option value="">Seleccionar...</option>
                {devices.map(d => (
                  <option key={`${d.vendorId}:${d.productId}`} 
                          value={`${d.vendorId}:${d.productId}`}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config?.autoCut}
                onChange={(e) => {
                  window.desktop.escpos.updateConfig({ autoCut: e.target.checked });
                  loadConfig();
                }}
              />
              Corte automático
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config?.openCashDrawer}
                onChange={(e) => {
                  window.desktop.escpos.updateConfig({ openCashDrawer: e.target.checked });
                  loadConfig();
                }}
              />
              Abrir gaveta
            </label>
          </div>

          <div>
            <label>Columnas:</label>
            <select
              value={config?.charsPerLine || 42}
              onChange={(e) => {
                window.desktop.escpos.updateConfig({ 
                  charsPerLine: Number(e.target.value) as 42 | 48 
                });
                loadConfig();
              }}
            >
              <option value={42}>42 columnas (estándar)</option>
              <option value={48}>48 columnas</option>
            </select>
          </div>

          <button 
            onClick={handleTestPrint}
            disabled={testing || !config?.vendorId}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {testing ? 'Imprimiendo...' : 'Prueba de Impresión'}
          </button>
        </>
      )}
    </div>
  );
}
```

---

## Formato del Ticket

El ticket se genera con el siguiente layout (42 columnas):

```
==========================================
         NOMBRE DE LA TIENDA
            RUC: XXXXXXXXXXX
      Av. Principal 123, Lima
            Tel: 999999999
------------------------------------------
TICKET: AB12CD34          13/02/2026
                          10:30:45
Cajero: Juan Pérez
------------------------------------------
CANT DESCRIPCION              IMPORTE
------------------------------------------
2x   Coca Cola 500ml          S/8.00
       @S/4.00
1x   Pan francés (und)        S/0.50
3kg  Arroz Extra              S/15.00
       @S/5.00
------------------------------------------
CUPON: VERANO20              -S/2.00
==========================================
SUBTOTAL:                    S/23.50
DESCUENTO:                   -S/2.00
TOTAL:                       S/21.50
------------------------------------------
PAGO: EFECTIVO
RECIBIDO:                    S/25.00
VUELTO:                      S/3.50
==========================================
       Gracias por su compra!
         MarketPOS Desktop
==========================================
```

---

## Integración con Checkout

```typescript
// En el checkout, después de completar venta
const handleAfterSale = async (saleId: string) => {
  // Verificar si estamos en desktop y modo ESCPOS
  if (window.desktop?.escpos) {
    const config = await window.desktop.escpos.getConfig();
    
    if (config.mode === 'ESCPOS_USB') {
      // Imprimir con ESC/POS
      const result = await window.desktop.escpos.printSale(saleId);
      
      if (!result.success && result.fallbackToHtml) {
        // Fallback a HTML
        window.open(`/receipt/${saleId}?print=true`, '_blank');
      }
    } else {
      // Modo HTML tradicional
      window.open(`/receipt/${saleId}?print=true`, '_blank');
    }
  } else {
    // Web - modo HTML
    window.open(`/receipt/${saleId}?print=true`, '_blank');
  }
};
```

---

## API Endpoint de Datos

### GET /api/print/sale/[saleId]

Retorna datos de venta formateados para impresión:

```json
{
  "store": {
    "name": "Mi Tienda",
    "ruc": "12345678901",
    "address": "Av. Principal 123",
    "phone": "999999999"
  },
  "saleNumber": "AB12CD34",
  "date": "13/02/2026",
  "time": "10:30:45",
  "items": [
    {
      "name": "Coca Cola 500ml",
      "quantity": 2,
      "unitPrice": 4.00,
      "subtotal": 8.00,
      "discount": 0
    }
  ],
  "subtotal": 23.50,
  "totalDiscount": 2.00,
  "total": 21.50,
  "discounts": [
    {
      "type": "coupon",
      "description": "VERANO20",
      "amount": 2.00
    }
  ],
  "payment": {
    "method": "CASH",
    "amountPaid": 25.00,
    "change": 3.50
  },
  "cashierName": "Juan Pérez",
  "footer": "Gracias por su compra!"
}
```

---

## Requisitos Windows

### Driver USB

Para usar impresión ESC/POS raw:

1. **Opción A**: Instalar driver ESC/POS del fabricante
2. **Opción B**: Usar "Generic / Text Only" en Windows
3. **Opción C**: Instalar WinUSB con Zadig (avanzado)

> En muchos casos funciona sin configuración adicional si la impresora está conectada.

---

## Troubleshooting

### "No se encontraron impresoras USB"

1. Verificar que la impresora está conectada y encendida
2. Verificar cable USB
3. Probar en otro puerto USB
4. Reiniciar la aplicación

### "No se pudo conectar con la impresora"

1. La impresora puede estar siendo usada por otro programa
2. Cerrar otros programas que usen la impresora
3. Verificar que el VendorId/ProductId son correctos

### Caracteres incorrectos (ñ, tildes)

1. Cambiar encoding en configuración:
   - `CP858` para España/Latinoamérica (tiene €)
   - `CP850` alternativa
   - `ISO8859_15` para caracteres europeos

### El papel no corta

1. Verificar que "Corte automático" está activado
2. Verificar capacidad de corte de la impresora
3. Algunas impresoras solo hacen corte parcial

---

## Checklist Manual

- [ ] Detectar USB devices → aparecen en lista
- [ ] Test print → imprime y corta
- [ ] Venta CASH → items + total + pagó/vuelto + corta
- [ ] Venta YAPE/PLIN → método sin vuelto
- [ ] Venta con descuentos/promos/cupón → líneas correctas
- [ ] Reimpresión desde historial → OK
- [ ] Si falla ESC/POS → fallback a HTML
- [ ] Web en la nube → sin cambios (no rompe nada)

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| [desktop/src/printing/escpos/](../desktop/src/printing/escpos/) | Módulos ESC/POS |
| [desktop/src/main.ts](../desktop/src/main.ts) | IPC handlers |
| [desktop/src/preload.ts](../desktop/src/preload.ts) | API expuesta |
| [src/app/api/print/sale/[saleId]/route.ts](../src/app/api/print/sale/[saleId]/route.ts) | Endpoint de datos |
