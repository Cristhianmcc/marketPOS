# Offline Behavior - Desktop

## MÓDULO D5: Comportamiento Offline + Cola de Tareas

El módulo D5 permite que la aplicación desktop opere sin conexión a internet, manteniendo funcionalidad básica y encolando tareas que requieren conectividad.

---

## Arquitectura

```
desktop/src/
├── onlineMonitor.ts    # Detector de conectividad
├── taskQueue.ts        # Cola de tareas offline
├── main.ts             # IPC handlers integrados
└── preload.ts          # API expuesta al renderer

Frontend (web)
└── Usa window.desktop.online y window.desktop.queue
```

---

## Funcionalidad por Módulo

### ✅ Funciona Offline (sin cambios)

| Módulo | Descripción |
|--------|-------------|
| **Ventas** | Checkout completo, efectivo, tarjeta, etc. |
| **Turnos** | Abrir/cerrar turnos |
| **Inventario** | Movimientos, ajustes |
| **Clientes** | Crear, editar, buscar |
| **Productos** | Gestión local |
| **Reportes** | Datos locales |

### ⚠️ Requiere Internet (se encola)

| Módulo | Comportamiento Offline |
|--------|------------------------|
| **SUNAT** | Genera DRAFT/SIGNED, encola SEND |
| **Cloudinary** | Usa imagen local temporal, encola upload |
| **Sincronización** | Encola cambios para sync |

---

## Online Monitor

### Configuración

```typescript
interface OnlineMonitorConfig {
  checkIntervalMs: number;        // 30000 (30s default)
  pingUrl: string;                // 'https://www.google.com/favicon.ico'
  pingTimeoutMs: number;          // 5000 (5s)
  failuresBeforeOffline: number;  // 2 fallos = offline
}
```

### API Frontend

```typescript
// Verificar estado actual
const status = await window.desktop.online.getStatus();
console.log(status.isOnline);        // true/false
console.log(status.lastCheck);       // Date
console.log(status.lastOnline);      // Date | null
console.log(status.consecutiveFailures); // number

// Forzar verificación inmediata
const isOnline = await window.desktop.online.checkNow();

// Obtener/actualizar configuración
const config = await window.desktop.online.getConfig();
await window.desktop.online.updateConfig({ checkIntervalMs: 15000 });
```

### Eventos

```typescript
// Escuchar cambios de estado
window.desktop.on('online:status-changed', (data) => {
  console.log('Online:', data.isOnline);
  
  if (!data.isOnline) {
    showOfflineBanner();
  } else {
    hideOfflineBanner();
  }
});
```

---

## Task Queue

### Tipos de Tareas

| Tipo | Descripción |
|------|-------------|
| `sunat_send` | Envío de documento a SUNAT |
| `cloudinary_upload` | Subida de imagen |
| `sync_data` | Sincronización de datos |

### Encolar Tareas

```typescript
// Cuando SUNAT falla por red, encolar
const taskId = await window.desktop.queue.enqueue('sunat_send', {
  jobId: 'sunat-job-123',
  documentType: 'BOLETA',
  serie: 'B001',
  numero: 45,
});

// Encolar upload de Cloudinary
const taskId = await window.desktop.queue.enqueue('cloudinary_upload', {
  productId: 'prod-123',
  imageData: 'base64...',
  imageName: 'product.jpg',
});
```

### Consultar Estado

```typescript
// Obtener estadísticas
const stats = await window.desktop.queue.getStats();
console.log(stats);
// { pending: 5, processing: 1, completed: 10, failed: 2, total: 18 }

// Obtener tareas pendientes
const pending = await window.desktop.queue.getPending();

// Obtener tarea específica
const task = await window.desktop.queue.getTask('task_123456');
```

### Procesamiento Manual

```typescript
// Forzar procesamiento ahora (útil al reconectar)
await window.desktop.queue.processNow();

// Reintentar tareas fallidas
await window.desktop.queue.retryFailed();

// Limpiar tareas completadas
await window.desktop.queue.clearCompleted();
```

### Eventos de Task Queue

```typescript
window.desktop.on('task:enqueued', (task) => {
  console.log('Nueva tarea encolada:', task.id, task.type);
});

window.desktop.on('task:processing', (task) => {
  console.log('Procesando:', task.id);
});

window.desktop.on('task:completed', (task) => {
  console.log('Completada:', task.id);
  toast.success(`Tarea ${task.type} completada`);
});

window.desktop.on('task:failed', (task) => {
  console.error('Falló:', task.id, task.error);
  toast.error(`Error: ${task.error}`);
});

window.desktop.on('task:retry', (task) => {
  console.warn('Reintentando:', task.id, `(${task.attempts}/${task.maxAttempts})`);
});
```

---

## Implementación Frontend

### Banner Offline

```tsx
// components/OfflineBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingTasks, setPendingTasks] = useState(0);

  useEffect(() => {
    if (!window.desktop) return;

    // Estado inicial
    window.desktop.online.getStatus().then(status => {
      setIsOffline(!status.isOnline);
    });

    window.desktop.queue.getStats().then(stats => {
      setPendingTasks(stats.pending);
    });

    // Listeners
    const handleStatusChange = (data: { isOnline: boolean }) => {
      setIsOffline(!data.isOnline);
    };

    const handleTaskChange = () => {
      window.desktop?.queue.getStats().then(stats => {
        setPendingTasks(stats.pending);
      });
    };

    window.desktop.on('online:status-changed', handleStatusChange);
    window.desktop.on('task:enqueued', handleTaskChange);
    window.desktop.on('task:completed', handleTaskChange);
    window.desktop.on('task:failed', handleTaskChange);

    return () => {
      window.desktop?.off('online:status-changed', handleStatusChange);
      // ... cleanup otros listeners
    };
  }, []);

  if (!isOffline && pendingTasks === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOffline && (
        <div className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-lg">
          <WifiOff className="h-5 w-5" />
          <span>Sin conexión</span>
        </div>
      )}
      
      {pendingTasks > 0 && (
        <div className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg mt-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{pendingTasks} tareas pendientes</span>
        </div>
      )}
    </div>
  );
}
```

### Integración con SUNAT

```typescript
// En la lógica de emisión SUNAT
async function emitirDocumento(data: EmisionData) {
  try {
    // Intentar envío normal
    const response = await fetch('/api/sunat/emit', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Error API');
    
    return await response.json();
  } catch (error) {
    // Si falla por red y estamos en desktop, encolar
    if (isNetworkError(error) && window.desktop) {
      const status = await window.desktop.online.getStatus();
      
      if (!status.isOnline) {
        // Encolar para procesamiento posterior
        const taskId = await window.desktop.queue.enqueue('sunat_send', {
          jobId: data.jobId,
          documentType: data.type,
          ...data,
        });
        
        return {
          status: 'QUEUED',
          taskId,
          message: 'Documento encolado para envío cuando haya conexión',
        };
      }
    }
    
    throw error;
  }
}
```

---

## Flujo de Trabajo

### Escenario: Venta offline con SUNAT

```
1. Usuario crea venta → OK (local)
2. Sistema intenta emitir boleta SUNAT
3. OnlineMonitor detecta offline
4. Se genera documento DRAFT/SIGNED localmente
5. Se encola tarea 'sunat_send'
6. Usuario ve: "Documento pendiente de envío"

--- Más tarde ---

7. OnlineMonitor detecta conexión
8. TaskQueue procesa tareas pendientes
9. SUNAT job se ejecuta exitosamente
10. Usuario recibe notificación "Boleta emitida"
```

---

## Persistencia

### Task Queue

Las tareas se persisten en:
```
{userData}/task-queue.json
```

- Se cargan al iniciar la app
- Se guardan en cada cambio
- Sobreviven reinicios

### Online Status

El estado de conexión NO se persiste (se determina en runtime).

---

## Configuración Avanzada

### Cambiar URL de ping

```typescript
// Usar servidor propio para verificar conectividad
await window.desktop.online.updateConfig({
  pingUrl: 'https://api.miempresa.com/health',
  checkIntervalMs: 60000, // 1 minuto
});
```

### Configurar reintentos de tareas

```typescript
// Las tareas usan maxRetries del TaskQueue (default: 5)
// Si una tarea falla 5 veces, queda en status 'failed'
// Usar retryFailed() para reintentar manualmente
```

---

## Checklist de Testing

- [ ] **Modo avión**: Checkout funciona (efectivo, tarjeta)
- [ ] **Banner offline**: Aparece cuando no hay red
- [ ] **Encolar SUNAT**: Documento queda en DRAFT
- [ ] **Reconexión**: Jobs se procesan automáticamente
- [ ] **Persistencia**: Tareas sobreviven reinicio
- [ ] **UI pendientes**: Muestra contador de tareas

---

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| [desktop/src/onlineMonitor.ts](../desktop/src/onlineMonitor.ts) | Detector de conectividad |
| [desktop/src/taskQueue.ts](../desktop/src/taskQueue.ts) | Cola de tareas |
| [desktop/src/main.ts](../desktop/src/main.ts) | IPC handlers |
| [desktop/src/preload.ts](../desktop/src/preload.ts) | API expuesta |
