# ✅ CHECKLIST DE TESTING – MÓDULO 17.2: PRODUCTOS RÁPIDOS (QUICK SELL)

## 📋 INFORMACIÓN DEL MÓDULO
- **Nombre**: Productos Rápidos (Quick Sell POS)
- **Tipo**: Frontend + Admin + Backend ligero
- **Objetivo**: Reducir tiempo de venta mostrando botones de productos más vendidos

---

## 🧪 1. FUNCIONALIDAD PRINCIPAL (POS)

### Grid de Productos Rápidos
- [ ] Grid se muestra en POS debajo del buscador
- [ ] Muestra máximo 8 productos
- [ ] Diseño responsive (2-4 columnas según pantalla)
- [ ] Cada botón muestra:
  - [ ] Nombre del producto
  - [ ] Precio
  - [ ] Inicial o imagen (si existe)
- [ ] Click en botón agrega 1 unidad al carrito
- [ ] No se muestra si no hay productos configurados
- [ ] No se muestra si hay error al cargar

### Estados Visuales
- [ ] Producto con stock → botón activo, hover verde
- [ ] Sin stock → botón gris, disabled, badge "Sin stock"
- [ ] Stock bajo (≤5) → badge amarillo con cantidad
- [ ] Icono carrito en esquina al hacer hover
- [ ] Feedback inmediato al click (toast)

### Validaciones
- [ ] No permite agregar si no hay turno abierto
- [ ] Respeta validación de stock (no agrega si stock = 0)
- [ ] Respeta límite de items por venta
- [ ] No rompe promociones automáticas
- [ ] No rompe descuentos
- [ ] No interfiere con buscador

---

## 🛠️ 2. CONFIGURACIÓN ADMIN

### Acceso y Permisos
- [ ] Solo OWNER puede acceder a `/admin/quick-sell`
- [ ] CASHIER no puede ver la página
- [ ] Página carga sin errores

### Lista de Productos
- [ ] Muestra productos ordenados por ventas
- [ ] Muestra contador de ventas de cada producto
- [ ] Muestra precio y categoría
- [ ] Productos quick sell aparecen primero

### Toggle Productos
- [ ] Botón "Marcar" agrega a quick sell
- [ ] Botón "Remover" quita de quick sell
- [ ] No permite agregar más de 8 productos
- [ ] Muestra mensaje si se alcanza límite
- [ ] Estado se guarda correctamente en BD
- [ ] Toast confirma acción exitosa

### Reordenamiento (Drag & Drop)
- [ ] Solo productos marcados son ordenables
- [ ] Drag funciona correctamente
- [ ] Muestra feedback visual al arrastrar
- [ ] Orden se guarda automáticamente
- [ ] Números de orden se actualizan en vivo
- [ ] Toast confirma guardado exitoso

### UX
- [ ] Loading spinner mientras carga
- [ ] Loading spinner mientras guarda
- [ ] Mensajes de error claros
- [ ] UI responsive en móvil/tablet/desktop

---

## 🔌 3. INTEGRACIÓN CON POS

### Flujo de Agregado
- [ ] Click en Quick Sell → mismo flujo que "Agregar" normal
- [ ] Producto se agrega al carrito correctamente
- [ ] Cantidad inicial = 1
- [ ] Promociones se aplican automáticamente
- [ ] Descuentos se respetan
- [ ] Stock se valida antes de agregar

### Compatibilidad
- [ ] No interfiere con búsqueda manual
- [ ] No duplica productos en carrito
- [ ] Funciona con productos por unidad (UNIT)
- [ ] Funciona con productos por peso (KG)
- [ ] Funciona con productos con promociones
- [ ] Funciona con cupones aplicados

---

## 📊 4. API Y BACKEND

### Endpoint: GET /api/pos/quick-sell
- [ ] Requiere autenticación
- [ ] Devuelve productos del storeId del usuario
- [ ] Respeta límite `?limit=8`
- [ ] Devuelve productos configurados manualmente primero
- [ ] Completa con más vendidos si faltan
- [ ] Excluye productos sin stock
- [ ] Response correcto (200 OK)
- [ ] Error 401 si no autenticado

### Endpoint: GET /api/admin/quick-sell
- [ ] Solo OWNER puede acceder
- [ ] Devuelve todos los productos activos
- [ ] Incluye contador de ventas (`totalSold`)
- [ ] Incluye estado `isQuickSell`
- [ ] Incluye orden `quickSellOrder`
- [ ] Error 401 si no es OWNER

### Endpoint: PATCH /api/admin/quick-sell
- [ ] Solo OWNER puede actualizar
- [ ] Actualiza campo `isQuickSell`
- [ ] Actualiza campo `quickSellOrder`
- [ ] Valida datos de entrada
- [ ] Error 400 si datos inválidos
- [ ] Error 401 si no es OWNER

### Endpoint: POST /api/admin/quick-sell/order
- [ ] Solo OWNER puede actualizar
- [ ] Actualiza orden de múltiples productos
- [ ] Valida array de entrada
- [ ] Transacción atómica (todo o nada)
- [ ] Error 400 si datos inválidos

### Endpoint: GET /api/inventory?productId=xxx
- [ ] Busca producto individual por ID
- [ ] Devuelve array con 1 producto
- [ ] Error 404 si no existe
- [ ] Respeta permisos de tienda

---

## 🗄️ 5. BASE DE DATOS

### Campos en ProductMaster
- [ ] Campo `isQuickSell` existe (Boolean, default false)
- [ ] Campo `quickSellOrder` existe (Int, nullable)
- [ ] Migración aplicada correctamente
- [ ] Índices funcionan correctamente

### Queries
- [ ] Query de productos rápidos ordena por `quickSellOrder ASC`
- [ ] Query excluye productos con `isQuickSell = false`
- [ ] Join con StoreProduct funciona
- [ ] Count de SaleItems es correcto

---

## 🔐 6. SEGURIDAD

### Permisos
- [ ] Solo usuarios autenticados ven quick sell en POS
- [ ] Solo OWNER configura productos rápidos
- [ ] CASHIER no puede acceder a admin
- [ ] Validación de storeId en todas las queries

### Validaciones
- [ ] No permite agregar sin stock
- [ ] No permite exceder límite de items
- [ ] No permite SQL injection
- [ ] Sanitiza inputs del frontend

---

## 🚫 7. ERRORES Y EDGE CASES

### Escenarios de Error
- [ ] Sin productos configurados → no muestra grid
- [ ] API falla → oculta grid silenciosamente
- [ ] Producto sin stock → botón disabled
- [ ] Límite alcanzado → muestra mensaje claro
- [ ] Sin conexión → muestra error

### Casos Límite
- [ ] 0 productos rápidos configurados
- [ ] 8 productos rápidos (máximo)
- [ ] Producto con nombre muy largo (truncado)
- [ ] Producto sin imagen (muestra inicial)
- [ ] Producto con stock null (permitido)
- [ ] Reordenar 1 solo producto (no hace nada)

---

## 📱 8. RESPONSIVE Y UX

### Desktop
- [ ] Grid 4 columnas
- [ ] Botones tamaño adecuado
- [ ] Hover funciona correctamente
- [ ] Drag & drop fluido

### Tablet
- [ ] Grid 3 columnas
- [ ] Touch funciona correctamente
- [ ] Drag & drop táctil

### Móvil
- [ ] Grid 2 columnas
- [ ] Botones táctiles grandes
- [ ] Scroll suave
- [ ] No overflow horizontal

---

## ⚡ 9. RENDIMIENTO

### Carga Inicial
- [ ] Grid carga en <1 segundo
- [ ] No bloquea render del POS
- [ ] Usa SWR o cache si está disponible

### Interacción
- [ ] Click agrega producto en <500ms
- [ ] Toggle en admin es instantáneo (optimistic)
- [ ] Drag & drop no tiene lag

---

## 🧹 10. REGRESIÓN (NO ROMPER NADA)

### POS
- [ ] Buscador funciona igual que antes
- [ ] Carrito funciona igual que antes
- [ ] Checkout no se rompe
- [ ] Promociones se aplican correctamente
- [ ] Descuentos manuales funcionan
- [ ] Cupones funcionan
- [ ] FIADO funciona
- [ ] Turnos funcionan

### Admin
- [ ] Inventario no se afecta
- [ ] Usuarios no se afectan
- [ ] Reportes no se afectan
- [ ] Auditoría registra cambios

---

## 📝 11. DOCUMENTACIÓN

- [ ] README actualizado (si aplica)
- [ ] Comentarios en código clave
- [ ] Tipos TypeScript correctos
- [ ] No hay warnings de compilación
- [ ] No hay errores de linter

---

## 🎯 12. RESULTADO FINAL

### Objetivos Cumplidos
- [ ] Cajero puede agregar productos sin buscar
- [ ] Configuración es intuitiva para OWNER
- [ ] Tiempo de venta se reduce notablemente
- [ ] No rompe ninguna funcionalidad existente
- [ ] Módulo listo para producción

### Métrica de Éxito
- [ ] **Antes**: Buscar → Escribir → Enter → Click "Agregar" (~8 segundos)
- [ ] **Después**: 1 click en botón (~1 segundo)
- [ ] **Reducción**: ~87% menos tiempo

---

## ✅ APROBACIÓN FINAL

- [ ] **Frontend POS**: Funcional y profesional
- [ ] **Admin UI**: Intuitivo y sin errores
- [ ] **Backend**: APIs estables y seguras
- [ ] **Base de Datos**: Migración aplicada correctamente
- [ ] **Testing Manual**: Todos los casos probados
- [ ] **Regresión**: Nada se rompió
- [ ] **Documentación**: Completa y clara

---

**Fecha de Testing**: ___________  
**Responsable**: ___________  
**Estado**: ⬜ Pendiente | ⬜ En Progreso | ⬜ Completado  
**Aprobado para Producción**: ⬜ SÍ | ⬜ NO (especificar issues)
