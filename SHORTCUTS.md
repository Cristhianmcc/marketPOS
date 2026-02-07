# MÓDULO S7: Atajos de Teclado + Dark Mode

## Resumen

Sistema de atajos de teclado y modo oscuro implementado para BodegaPOS.

## Funcionalidades

### Dark Mode

- **Tres modos disponibles:**
  - Claro (Light)
  - Oscuro (Dark)
  - Sistema (sigue preferencia del SO)
  
- **Toggle ubicado en:** Sidebar (pie de página)
- **Persistencia:** localStorage (clave: `bodegapos-theme`)
- **Iconos:** Sun, Moon, Monitor (lucide-react)

### Atajos de Teclado

| Atajo | Función | Contexto |
|-------|---------|----------|
| `F2` o `Ctrl+K` | Buscar producto | POS |
| `Enter` | Confirmar / Agregar al carrito | POS |
| `F4` | Abrir método de pago | POS |
| `F8` | Nueva venta | POS |
| `Escape` | Cerrar modal / Cancelar | Global |
| `Delete` | Eliminar ítem seleccionado | POS |
| `F6` | Aplicar descuento | POS |
| `?` o `F1` | Mostrar ayuda de atajos | Global |

## Archivos Creados/Modificados

### Creados
- `src/components/theme/ThemeProvider.tsx` - Contexto de tema con hook useTheme
- `src/components/theme/ThemeToggle.tsx` - Dropdown de selección de tema
- `src/components/shortcuts/ShortcutsModal.tsx` - Modal con lista de atajos

### Modificados
- `src/app/layout.tsx` - ThemeProvider wrapper
- `src/components/layout/Sidebar.tsx` - ThemeToggle y ShortcutsModal en footer

## Uso

### Cambiar tema
1. Click en el botón de tema (icono sol/luna) en el sidebar
2. Seleccionar: Claro, Oscuro o Sistema

### Ver atajos
1. Presionar `?` o `F1` en cualquier pantalla
2. O click en el botón de teclado en el sidebar

## Configuración Tailwind

```js
// tailwind.config.ts
darkMode: ["class"] // Ya configurado
```

## Integración con Tailwind

Todas las clases usan el patrón `dark:`:
```tsx
className="bg-white dark:bg-gray-800 text-black dark:text-white"
```

## Fecha de Implementación

- Completado: Enero 2025
- Módulo: S7 - Shortcuts Visibles + Dark Mode
