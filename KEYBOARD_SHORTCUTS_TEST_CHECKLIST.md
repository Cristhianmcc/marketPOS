# ✅ MÓDULO 17.1: ATAJOS DE TECLADO - Checklist de Pruebas

## 📋 Contexto
Este checklist valida la implementación de los atajos de teclado para el POS, permitiendo operación completa sin usar el mouse.

**Objetivo:** Reducir el tiempo de venta operando completamente con teclado.

**Roles:** OWNER y CASHIER (ambos pueden usar atajos)

**Ubicación:** Solo activos en `/pos`

---

## 🧪 Pruebas del Sistema

### 1️⃣ Búsqueda de Productos

**Objetivo:** Validar que los atajos de búsqueda funcionan correctamente.

**Pasos:**
1. Abrir `/pos`
2. **Presionar F1**
   - Verificar que el input de búsqueda se enfoca automáticamente
3. Escribir nombre de producto (ej: "coca")
4. Click en "Buscar" o Enter
5. **Con resultados visibles, presionar Enter**
   - Verificar que el primer producto se agrega al carrito automáticamente
   - Verificar que los resultados se limpian
   - Verificar que el input se limpia
6. **Repetir con código de barras**
   - F1 → escribir código → Enter
   - Verificar que funciona igual

**Resultado esperado:**
- ✅ F1 enfoca input instantáneamente
- ✅ Enter agrega primer resultado al carrito
- ✅ No rompe la búsqueda manual (click en Buscar)
- ✅ Funciona con productos por UNIT y KG

**Casos edge:**
- Sin resultados: Enter no hace nada (OK)
- Input ya enfocado: F1 no hace nada (OK)

---

### 2️⃣ Carrito - Incrementar Cantidad

**Objetivo:** Validar que + / - modifican la cantidad del ítem seleccionado.

**Pasos:**
1. Agregar 2 productos al carrito (A y B)
2. **El último agregado (B) es el seleccionado por defecto (index 0)**
3. **Presionar +**
   - Verificar que la cantidad del producto B aumenta de 1 a 2
   - Verificar toast de confirmación (opcional)
4. **Presionar + varias veces**
   - Verificar que la cantidad sigue aumentando
5. **Validar stock:**
   - Si producto tiene stock limitado (ej: 5 unidades)
   - Presionar + hasta exceder stock
   - Verificar que muestra error: "Stock insuficiente"
6. **Validar productos por KG:**
   - Agregar producto con unitType = KG
   - Presionar +
   - Verificar que incrementa en 1.0 kg

**Resultado esperado:**
- ✅ + incrementa cantidad en 1
- ✅ Respeta validación de stock
- ✅ Funciona para UNIT y KG
- ✅ Recalcula promociones automáticamente
- ✅ NO se dispara si un input está enfocado

**Casos edge:**
- Stock = 0: no permite incrementar (OK)
- Límite de items por venta: muestra error (OK)

---

### 3️⃣ Carrito - Decrementar Cantidad

**Objetivo:** Validar que - reduce la cantidad correctamente.

**Pasos:**
1. Agregar producto con cantidad = 3
2. **Presionar -**
   - Verificar que la cantidad baja de 3 a 2
3. **Presionar - hasta llegar a cantidad = 1**
4. **Presionar - una vez más (cantidad = 0)**
   - Verificar que el producto se elimina del carrito
   - Verificar que no queda ítem fantasma
5. **Con producto KG:**
   - Cantidad = 2.5 kg
   - Presionar -
   - Verificar que baja a 1.5 kg

**Resultado esperado:**
- ✅ - decrementa cantidad en 1
- ✅ Al llegar a 0, elimina el ítem del carrito
- ✅ Recalcula subtotales y promociones
- ✅ NO se dispara si un input está enfocado

---

### 4️⃣ Carrito - Eliminar Ítem

**Objetivo:** Validar que Delete elimina el ítem seleccionado.

**Pasos:**
1. Agregar 3 productos al carrito (A, B, C)
2. **Presionar Delete**
   - Verificar que el último ítem agregado (C) se elimina
3. **Volver a presionar Delete**
   - Verificar que B se elimina
4. **Presionar Delete hasta vaciar el carrito**
   - Verificar que el carrito queda vacío
   - Verificar mensaje "Carrito vacío"
5. **Con carrito vacío, presionar Delete**
   - Verificar que no rompe (no hace nada)

**Resultado esperado:**
- ✅ Delete elimina ítem seleccionado
- ✅ Ajusta el índice de selección automáticamente
- ✅ Limpia promociones del ítem eliminado
- ✅ Con carrito vacío no rompe
- ✅ NO se dispara si un input está enfocado

---

### 5️⃣ Carrito - Enfocar (F2)

**Objetivo:** Validar que F2 selecciona el primer ítem del carrito.

**Pasos:**
1. Agregar 3 productos al carrito
2. **Presionar F2**
   - Verificar toast: "Ítem seleccionado: [Nombre del producto]"
   - Verificar que el primer ítem está marcado visualmente (opcional: borde azul)
3. **Presionar + después de F2**
   - Verificar que modifica la cantidad del ítem seleccionado
4. **Con carrito vacío, presionar F2**
   - Verificar que no hace nada (no rompe)

**Resultado esperado:**
- ✅ F2 selecciona primer ítem
- ✅ Toast muestra nombre del producto
- ✅ + / - / Delete funcionan sobre el ítem seleccionado
- ✅ Con carrito vacío no rompe

**Nota:** Por ahora no hay UI visual de "ítem seleccionado" (border azul), solo el toast. Esto es opcional para futuras versiones.

---

### 6️⃣ Checkout - Abrir Modal (F4)

**Objetivo:** Validar que F4 abre el modal de pago.

**Pasos:**
1. **Sin turno abierto:**
   - Agregar productos al carrito
   - Presionar F4
   - Verificar que NO abre el modal (requiere turno)
2. **Abrir turno**
3. **Con carrito vacío:**
   - Presionar F4
   - Verificar que muestra toast: "El carrito está vacío"
4. **Con carrito lleno:**
   - Agregar 2 productos
   - Presionar F4
   - Verificar que abre el modal de pago
   - Verificar que muestra el total correcto
5. **Presionar F4 desde dentro de un input**
   - Enfocar input de búsqueda (F1)
   - Escribir texto
   - Presionar F4
   - Verificar que NO abre el modal (input tiene prioridad)

**Resultado esperado:**
- ✅ F4 abre modal solo con turno abierto + carrito lleno
- ✅ Sin turno: no hace nada
- ✅ Carrito vacío: muestra error
- ✅ NO se dispara si un input está enfocado

---

### 7️⃣ Checkout - Cerrar Modal (Esc)

**Objetivo:** Validar que Esc cierra cualquier modal abierto.

**Pasos:**
1. **Modal de pago:**
   - Abrir modal con F4
   - Presionar Esc
   - Verificar que el modal se cierra
   - Verificar que el carrito permanece intacto
2. **Modal de descuento:**
   - Click en "Aplicar descuento" de un ítem
   - Presionar Esc
   - Verificar que cierra el modal
3. **Modal de cliente (FIADO):**
   - Seleccionar método FIADO
   - Click "Buscar cliente"
   - Presionar Esc
   - Verificar que cierra el modal
4. **Modal de cupón:**
   - (Si tienes modal de cupón)
   - Presionar Esc
   - Verificar que cierra

**Resultado esperado:**
- ✅ Esc cierra modal de pago
- ✅ Esc cierra modal de descuento
- ✅ Esc cierra modal de cliente
- ✅ Esc cierra cualquier modal activo
- ✅ No afecta el carrito ni los datos ingresados

---

### 8️⃣ Métodos de Pago - Atajos (F5-F8)

**Objetivo:** Validar que F5-F8 seleccionan métodos de pago dentro del modal.

**Pasos:**
1. Agregar productos y abrir checkout (F4)
2. **Presionar F5**
   - Verificar que selecciona "CASH" (Efectivo)
   - Verificar que el botón se marca con borde azul
3. **Presionar F6**
   - Verificar que selecciona "YAPE"
4. **Presionar F7**
   - Verificar que selecciona "PLIN"
5. **Presionar F8**
   - Verificar que selecciona "CARD" (Tarjeta)
6. **Presionar F5 estando en CASH**
   - Verificar que no cambia (ya está seleccionado)
7. **Con CASH seleccionado:**
   - Ingresar monto pagado
   - Presionar Enter o click "Confirmar"
   - Verificar que completa la venta
8. **Cerrar modal (Esc)**
   - Abrir nuevamente (F4)
   - Verificar que vuelve al método por defecto (CASH)

**Resultado esperado:**
- ✅ F5 → CASH
- ✅ F6 → YAPE
- ✅ F7 → PLIN
- ✅ F8 → CARD
- ✅ Solo funcionan dentro del modal de pago
- ✅ Fuera del modal no hacen nada (no rompen)

---

### 9️⃣ Validación - NO interferir con Inputs

**Objetivo:** Validar que los atajos NO se disparan al escribir en inputs.

**Pasos:**
1. **Input de búsqueda:**
   - Enfocar input (F1)
   - Escribir: "producto-1+2-3" (texto con + y -)
   - Verificar que NO incrementa/decrementa cantidad del carrito
   - Verificar que el texto se escribe normalmente
2. **Input de monto pagado:**
   - Abrir checkout (F4)
   - Enfocar input "Monto pagado"
   - Escribir: "100+" (incluye un +)
   - Verificar que NO incrementa carrito
3. **Input de cupón:**
   - Enfocar input de código de cupón
   - Escribir: "DELETE2024" (código con palabra Delete)
   - Verificar que NO elimina ítem del carrito
4. **Textarea (si existe):**
   - Si hay textarea (ej: notas)
   - Escribir texto con + - Delete F1 F4
   - Verificar que NO se disparan atajos

**Resultado esperado:**
- ✅ Atajos NO se disparan en inputs
- ✅ Atajos NO se disparan en textareas
- ✅ Atajos NO se disparan en elementos editables
- ✅ Solo Enter en búsqueda agrega primer resultado

---

### 🔟 Validación - Promociones y Lógica de Negocio

**Objetivo:** Validar que los atajos NO rompen promociones, cupones, ni fiado.

**Pasos:**
1. **Promoción automática (2x1):**
   - Agregar producto con promo activa
   - Usar + para llegar a cantidad = 2
   - Verificar que aplica descuento de promoción
   - Usar - para bajar a cantidad = 1
   - Verificar que elimina el descuento
2. **Promoción por categoría:**
   - Agregar producto de categoría con promo
   - Usar + / -
   - Verificar que recalcula descuento correctamente
3. **Promoción por volumen (Pack):**
   - Agregar 3 unidades del mismo producto (promo 3x S/5)
   - Usar + para llegar a 3
   - Verificar que aplica descuento de pack
4. **Cupón aplicado:**
   - Aplicar cupón de descuento global
   - Usar + / - en items del carrito
   - Verificar que el cupón sigue aplicado
   - Verificar que el descuento se recalcula
5. **Fiado:**
   - Seleccionar método FIADO
   - Completar venta usando atajos
   - Verificar que la deuda se registra correctamente

**Resultado esperado:**
- ✅ Promociones se recalculan al cambiar cantidad
- ✅ Cupones permanecen aplicados
- ✅ Descuentos manuales no se pierden
- ✅ Fiado funciona normalmente
- ✅ NO hay errores en consola
- ✅ Audit logs se crean correctamente

---

### 1️⃣1️⃣ Performance y Estabilidad

**Objetivo:** Validar que los atajos no afectan el rendimiento.

**Pasos:**
1. **Spam de atajos:**
   - Presionar + 20 veces rápidamente
   - Verificar que no hay lag
   - Verificar que la cantidad se incrementa correctamente
2. **Cambio rápido de métodos de pago:**
   - Abrir checkout
   - Presionar F5 F6 F7 F8 rápidamente
   - Verificar que no rompe la UI
3. **Navegación rápida:**
   - F1 → buscar → Enter → F4 → F5 → Enter (venta completa)
   - Cronometrar: debe tomar < 10 segundos
4. **Múltiples ventas consecutivas:**
   - Hacer 5 ventas usando solo teclado
   - Verificar que no hay memory leaks
   - Verificar que todos los event listeners se limpian

**Resultado esperado:**
- ✅ No hay lag al usar atajos
- ✅ Venta completa en < 10 segundos
- ✅ No hay errores en consola
- ✅ No hay memory leaks

---

### 1️⃣2️⃣ Seguridad y Audit Logs

**Objetivo:** Validar que los atajos no bypassean seguridad ni audit logs.

**Pasos:**
1. **Venta con atajos:**
   - Completar venta usando solo teclado (F1, +, F4, F5)
   - Verificar en base de datos:
     - Venta se creó correctamente
     - Stock se descontó
     - Audit log con acción "SALE_COMPLETED"
2. **Límites operativos:**
   - Configurar límite: max 10 items por venta
   - Agregar 1 producto, presionar + hasta llegar a 11
   - Verificar que muestra error: "No puedes agregar más items"
3. **Sin turno abierto:**
   - Cerrar turno
   - Intentar vender con F4
   - Verificar que NO permite (requiere turno)

**Resultado esperado:**
- ✅ Audit logs se crean normalmente
- ✅ Stock se descuenta correctamente
- ✅ Límites operativos se respetan
- ✅ Validaciones de turno funcionan
- ✅ NO hay bypass de seguridad

---

## 🎯 Criterio de Éxito

✅ **12/12 pruebas pasadas**: Los atajos de teclado están completamente funcionales.

---

## 🔧 Troubleshooting

### Problema: Atajos no funcionan
- **Causa:** Event listener no se registró
- **Solución:** Verificar que estás en `/pos`, recargar página

### Problema: Atajos se disparan en inputs
- **Causa:** Validación de activeElement falla
- **Solución:** Verificar que el input tiene focus correctamente

### Problema: F5-F8 no funcionan fuera del modal
- **Causa:** Comportamiento esperado (solo en checkout)
- **Solución:** Es correcto, no es un bug

### Problema: + / - modifican el ítem incorrecto
- **Causa:** selectedCartItemIndex no se actualiza
- **Solución:** Usar F2 para seleccionar el ítem correcto

### Problema: Promociones no se recalculan
- **Causa:** updateQuantity no llama a checkAndApplyPromotion
- **Solución:** Verificar que la función recalcula promos

---

## 📊 Métricas de UX

**Tiempo de venta (sin atajos):**
- Búsqueda: click input → escribir → click buscar → click agregar = ~10 segundos
- Checkout: click finalizar → click método → click confirmar = ~8 segundos
- **Total: ~18 segundos por venta**

**Tiempo de venta (con atajos):**
- Búsqueda: F1 → escribir → Enter = ~4 segundos
- Checkout: F4 → F5 → Enter = ~3 segundos
- **Total: ~7 segundos por venta**

**Mejora: 61% más rápido** 🚀

---

## ✨ Conclusión

Los atajos de teclado permiten operar el POS completamente sin mouse, reduciendo el tiempo de venta significativamente. Ideal para cajeros experimentados que buscan velocidad.

**Beneficios:**
- ✅ Venta completa sin soltar el teclado
- ✅ Reducción de 61% en tiempo por venta
- ✅ No rompe funcionalidad existente
- ✅ Compatible con promociones, cupones y fiado
- ✅ Hints visuales guían al usuario

**No afecta:**
- ❌ Backend (0 cambios)
- ❌ Base de datos (0 cambios)
- ❌ Lógica de negocio (0 cambios)
- ❌ Seguridad (0 cambios)
