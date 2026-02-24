# Impresión Térmica Desktop (D6)

## Resumen

El módulo D6 proporciona impresión de tickets en impresoras térmicas 80mm/58mm desde la aplicación desktop Electron.

Características:
- ✅ Impresión silenciosa (sin diálogo)
- ✅ Selector de impresora
- ✅ Impresión de prueba
- ✅ Reimpresión desde historial
- ✅ Soporte 80mm y 58mm
- ✅ Preview opcional

---

## Arquitectura

```
desktop/src/
├── printing/
│   └── printTicket.ts    # PrinterManager principal
├── main.ts               # IPC handlers
└── preload.ts            # API window.desktop.printer
```

---

## Configuración

### PrinterConfig

```typescript
interface PrinterConfig {
  defaultPrinter: string | null;  // Nombre de impresora por defecto
  paperWidth: '58mm' | '80mm';    // Ancho del papel
  silentPrint: boolean;           // Imprimir sin diálogo
  copies: number;                 // Número de copias
  margins: {                      // Márgenes en pixels
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}
```

### Valores por Defecto

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| `defaultPrinter` | `null` | Sin impresora configurada |
| `paperWidth` | `'80mm'` | Papel térmico estándar |
| `silentPrint` | `true` | Sin diálogo de impresión |
| `copies` | `1` | Una copia |
| `margins` | `0` | Sin márgenes |

---

## API Desktop

### Obtener Impresoras Disponibles

```typescript
const printers = await window.desktop.printer.getPrinters();

printers.forEach(printer => {
  console.log(printer.name, printer.isDefault);
});
```

### Configurar Impresora por Defecto

```typescript
// Obtener config actual
const config = await window.desktop.printer.getConfig();

// Actualizar impresora
await window.desktop.printer.updateConfig({
  defaultPrinter: 'EPSON TM-T20III',
  paperWidth: '80mm',
});
```

### Imprimir Ticket de Venta

```typescript
// Impresión silenciosa con impresora configurada
const result = await window.desktop.printer.printTicket('sale_abc123');

if (result.success) {
  console.log('Impreso en:', result.printerName);
} else {
  console.error('Error:', result.error);
}
```

### Impresión de Prueba

```typescript
// Con impresora específica
const result = await window.desktop.printer.testPrint('EPSON TM-T20III');

// Con impresora por defecto
const result = await window.desktop.printer.testPrint();
```

### Reimpresión desde Historial

```typescript
// Reimprimir ticket de venta anterior
const result = await window.desktop.printer.reprint('sale_old_id');
```

### Opciones de Impresión

```typescript
interface PrintOptions {
  printerName?: string;   // Impresora específica
  silent?: boolean;       // Sin diálogo (default: true)
  copies?: number;        // Copias (default: 1)
  preview?: boolean;      // Mostrar preview en vez de imprimir
}

// Ejemplo: preview antes de imprimir
await window.desktop.printer.printTicket('sale_id', { preview: true });

// Ejemplo: múltiples copias
await window.desktop.printer.printTicket('sale_id', { copies: 2 });
```

---

## Integración con Checkout

### Después de Completar Venta

```typescript
// En el componente de checkout
const handleCompleteSale = async () => {
  const sale = await createSale(cart);
  
  // Imprimir ticket si estamos en desktop
  if (typeof window !== 'undefined' && window.desktop?.printer) {
    const result = await window.desktop.printer.printTicket(sale.id);
    
    if (!result.success) {
      toast.warning(`Ticket no impreso: ${result.error}`);
    }
  }
  
  // ... resto de lógica
};
```

---

## UI: Configuración de Impresora

### Componente Sugerido

```tsx
// components/settings/PrinterSettings.tsx
'use client';

import { useEffect, useState } from 'react';

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export function PrinterSettings() {
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [config, setConfig] = useState<PrinterConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.desktop?.printer) {
      loadPrinters();
      loadConfig();
    }
  }, []);

  const loadPrinters = async () => {
    const list = await window.desktop.printer.getPrinters();
    setPrinters(list);
  };

  const loadConfig = async () => {
    const cfg = await window.desktop.printer.getConfig();
    setConfig(cfg);
  };

  const handleSelectPrinter = async (name: string) => {
    await window.desktop.printer.updateConfig({ defaultPrinter: name });
    loadConfig();
  };

  const handleTestPrint = async () => {
    setLoading(true);
    const result = await window.desktop.printer.testPrint();
    setLoading(false);
    
    if (result.success) {
      alert('Prueba de impresión exitosa');
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  if (!window.desktop?.printer) {
    return <p>Configuración solo disponible en app desktop</p>;
  }

  return (
    <div className="space-y-4">
      <h3>Impresora de Tickets</h3>
      
      <select 
        value={config?.defaultPrinter || ''} 
        onChange={(e) => handleSelectPrinter(e.target.value)}
      >
        <option value="">Seleccionar impresora...</option>
        {printers.map(p => (
          <option key={p.name} value={p.name}>
            {p.name} {p.isDefault && '(por defecto)'}
          </option>
        ))}
      </select>

      <select
        value={config?.paperWidth || '80mm'}
        onChange={(e) => window.desktop.printer.updateConfig({ 
          paperWidth: e.target.value as '58mm' | '80mm' 
        })}
      >
        <option value="80mm">80mm (estándar)</option>
        <option value="58mm">58mm (pequeño)</option>
      </select>

      <button onClick={handleTestPrint} disabled={loading}>
        {loading ? 'Imprimiendo...' : 'Prueba de Impresión'}
      </button>
    </div>
  );
}
```

---

## Página de Receipt

La impresión usa la página `/receipt/[saleId]` existente con parámetros adicionales:

```
/receipt/{saleId}?print=true&thermal=true
```

La página debe:
1. Detectar `thermal=true` para usar estilos optimizados
2. Renderizar en ancho fijo (72mm para 80mm, 54mm para 58mm)
3. Usar fuente monospace para alineación

### Ejemplo CSS para Ticket Térmico

```css
@media print {
  body {
    width: 72mm;
    margin: 0;
    padding: 2mm;
    font-family: 'Courier New', monospace;
    font-size: 10px;
  }
  
  .no-print {
    display: none;
  }
}

/* Estilos para thermal=true */
.thermal-ticket {
  width: 72mm;
  max-width: 72mm;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.3;
}

.thermal-ticket .divider {
  border-top: 1px dashed #000;
  margin: 4px 0;
}

.thermal-ticket .center {
  text-align: center;
}

.thermal-ticket .right {
  text-align: right;
}

.thermal-ticket .bold {
  font-weight: bold;
}
```

---

## Troubleshooting

### "No hay impresora configurada"

1. Ir a Configuración > Impresora
2. Seleccionar impresora de la lista
3. Realizar prueba de impresión

### El ticket sale en blanco

1. Verificar que la página `/receipt/[saleId]` carga correctamente
2. Verificar CSS de impresión
3. Probar con `preview: true` para ver el contenido

### El texto está cortado

1. Verificar `paperWidth` correcto (58mm vs 80mm)
2. Ajustar márgenes en configuración
3. Verificar CSS no excede el ancho

### No aparecen impresoras

1. Verificar impresoras instaladas en Windows
2. Reiniciar aplicación desktop
3. Verificar que la impresora está encendida y conectada

---

## Impresoras Compatibles

Probado con:
- EPSON TM-T20III
- EPSON TM-T88V
- Star TSP100
- Citizen CT-S310II
- Cualquier impresora térmica POS compatible con Windows

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| [desktop/src/printing/printTicket.ts](../desktop/src/printing/printTicket.ts) | PrinterManager |
| [desktop/src/main.ts](../desktop/src/main.ts) | IPC handlers |
| [desktop/src/preload.ts](../desktop/src/preload.ts) | API expuesta |
| [src/app/receipt/[saleId]/page.tsx](../src/app/receipt/[saleId]/page.tsx) | Página de receipt |
