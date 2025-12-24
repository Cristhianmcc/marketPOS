# CHECKLIST MANUAL - Módulo 6: Ticket Térmico 80mm

## ✅ Configuración Previa
- [ ] Servidor corriendo: `npm run dev`
- [ ] Usuario autenticado (OWNER o CASHIER)
- [ ] Turno abierto para realizar ventas
- [ ] Al menos 2 productos activos en inventario

---

## 🧾 1. PRUEBA DE TICKET COMPLETO

### 1.1 Realizar venta con CASH
- [ ] Ir a **Punto de Venta** (/)
- [ ] Buscar y agregar productos al carrito (ej: Sublimes, Huevos)
- [ ] Clic en "Finalizar Venta"
- [ ] **Modal aparece con:**
  - [ ] Total de la venta
  - [ ] Botón "Imprimir Ticket" (azul)
  - [ ] Botón "Nueva Venta" (gris)
- [ ] Clic en **"Imprimir Ticket"**
- [ ] **Nueva pestaña se abre** con `/receipt/[saleId]`

### 1.2 Verificar contenido del ticket
**Encabezado:**
- [ ] Nombre de la tienda
- [ ] RUC (si existe)
- [ ] Dirección (si existe)
- [ ] Teléfono (si existe)

**Datos de venta:**
- [ ] Fecha y hora correcta
- [ ] Número de ticket (ej: V-001)
- [ ] Nombre del cajero
- [ ] Turno (fecha de apertura)

**Detalle de items:**
- [ ] Para UNIT: cantidad entera + "und"
- [ ] Para KG: cantidad con 3 decimales + "kg"
- [ ] Nombre del producto + contenido
- [ ] Precio unitario
- [ ] Subtotal por item

**Totales:**
- [ ] Subtotal
- [ ] IGV (si aplica)
- [ ] TOTAL en negrita

**Pago:**
- [ ] Método: "Efectivo"
- [ ] Recibido: monto pagado
- [ ] Vuelto: cambio

**Footer:**
- [ ] "Gracias por su compra"

### 1.3 Probar impresión
- [ ] Clic en botón **"Imprimir"** (arriba a la derecha)
- [ ] **Diálogo de impresión del navegador se abre**
- [ ] Verificar que:
  - [ ] Ancho es 80mm (no página completa)
  - [ ] No aparecen botones de navegación
  - [ ] Ticket está limpio y centrado
- [ ] En "Destino", seleccionar impresora o "Guardar como PDF"
- [ ] Imprimir o guardar
- [ ] **Verificar que Sale.printedAt se actualizó** (ver en historial de ventas)

### 1.4 Probar descarga PDF
- [ ] Clic en botón **"Descargar PDF"** (arriba a la derecha)
- [ ] Alerta aparece: "En el diálogo de impresión, selecciona 'Guardar como PDF'"
- [ ] Diálogo de impresión se abre
- [ ] En "Destino", seleccionar **"Guardar como PDF"**
- [ ] Guardar archivo
- [ ] Abrir PDF y verificar formato 80mm

---

## 📋 2. PRUEBA DE HISTORIAL DE VENTAS

### 2.1 Acceder al historial
- [ ] Ir al menú de navegación
- [ ] Clic en **"Ventas"** (icono de documento)
- [ ] Página `/sales` carga correctamente

### 2.2 Ver lista de ventas
**Tabla muestra:**
- [ ] Número de ticket
- [ ] Fecha y hora
- [ ] Total
- [ ] Método de pago
- [ ] Nombre del cajero
- [ ] Estado (Impreso / Sin imprimir)
- [ ] Botón "Ver/Imprimir"

### 2.3 Buscar por número de ticket
- [ ] En campo "Buscar por N° de Ticket", ingresar: **V-001**
- [ ] Clic en **"Buscar"**
- [ ] Solo aparece la venta V-001
- [ ] Clic en **"Limpiar"**
- [ ] Vuelven todas las ventas

### 2.4 Filtrar por fecha
- [ ] Seleccionar fecha "Desde": hoy
- [ ] Seleccionar fecha "Hasta": hoy
- [ ] Clic en **"Buscar"**
- [ ] Solo aparecen ventas de hoy
- [ ] Clic en **"Limpiar"**

### 2.5 Reimprimir ticket
- [ ] Clic en **"Ver/Imprimir"** de cualquier venta
- [ ] Se abre `/receipt/[saleId]`
- [ ] Ticket muestra los mismos datos
- [ ] Clic en **"Imprimir"**
- [ ] Verificar que printedAt se actualiza (refrescar historial)

---

## 🔐 3. PRUEBA DE PERMISOS

### 3.1 Como CASHIER
- [ ] Login como CASHIER (ej: María López)
- [ ] Ir a **"Ventas"**
- [ ] **Solo aparecen ventas propias** (del usuario actual)
- [ ] No aparecen ventas de otros cajeros

### 3.2 Como OWNER
- [ ] Login como OWNER
- [ ] Ir a **"Ventas"**
- [ ] **Aparecen TODAS las ventas** de la tienda
- [ ] Puede reimprimir cualquier ticket

---

## 💳 4. PRUEBA CON DIFERENTES MÉTODOS DE PAGO

### 4.1 Venta con YAPE
- [ ] Realizar venta
- [ ] Modal post-venta aparece
- [ ] Imprimir ticket
- [ ] Verificar que:
  - [ ] Método de pago: "Yape"
  - [ ] **NO aparece** "Recibido" ni "Vuelto"

### 4.2 Venta con PLIN
- [ ] Realizar venta
- [ ] Imprimir ticket
- [ ] Verificar que:
  - [ ] Método de pago: "Plin"
  - [ ] **NO aparece** "Recibido" ni "Vuelto"

### 4.3 Venta con CARD
- [ ] Realizar venta
- [ ] Imprimir ticket
- [ ] Verificar que:
  - [ ] Método de pago: "Tarjeta"
  - [ ] **NO aparece** "Recibido" ni "Vuelto"

---

## 🧪 5. PRUEBAS DE FORMATO

### 5.1 Producto con KG
- [ ] Vender producto tipo KG (ej: Azúcar Rubia, Arroz)
- [ ] Imprimir ticket
- [ ] Verificar que cantidad muestra **3 decimales**: `0.750 kg`

### 5.2 Producto con UNIT
- [ ] Vender producto tipo UNIT (ej: Chizitos, Huevos)
- [ ] Imprimir ticket
- [ ] Verificar que cantidad es **entera**: `2 und`

### 5.3 Producto sin content
- [ ] Vender producto sin campo `content`
- [ ] Verificar que solo aparece el nombre (sin "null" o espacios extra)

### 5.4 Venta múltiple items
- [ ] Agregar 5 productos diferentes al carrito
- [ ] Finalizar venta
- [ ] Imprimir ticket
- [ ] Verificar que todos los items aparecen correctamente
- [ ] Verificar que el total suma correctamente

---

## 🎨 6. PRUEBAS DE DISEÑO

### 6.1 Ancho 80mm
- [ ] Abrir `/receipt/[saleId]`
- [ ] Inspeccionar elemento (F12)
- [ ] Verificar que `.receipt` tiene `width: 80mm`
- [ ] Imprimir y verificar que no se corta

### 6.2 Tipografía monospace
- [ ] Verificar que el ticket usa fuente `Courier New` o monospace
- [ ] Números alineados correctamente
- [ ] Separadores `====` ocupan todo el ancho

### 6.3 Sin elementos no imprimibles
- [ ] Hacer `Ctrl + P` (abrir vista previa de impresión)
- [ ] Verificar que **NO aparecen:**
  - [ ] Barra de navegación superior
  - [ ] Botones "Volver", "Descargar PDF", "Imprimir"
  - [ ] Márgenes de página del sitio
  - [ ] Fondo gris

---

## 📊 7. VALIDACIÓN EN BASE DE DATOS

### 7.1 Sale.printedAt
```sql
SELECT id, sale_number, printed_at, created_at 
FROM sales 
ORDER BY created_at DESC 
LIMIT 5;
```
- [ ] Primera vez que se imprime: `printed_at` es `NULL`
- [ ] Después de imprimir: `printed_at` tiene timestamp
- [ ] Reimprimir actualiza `printed_at` nuevamente

### 7.2 SaleItems con snapshot
```sql
SELECT si.id, si.product_name, si.product_content, si.unit_type, si.quantity, si.unit_price
FROM sale_items si
WHERE sale_id = 'SALE_ID_AQUI'
ORDER BY si.id;
```
- [ ] `product_name` tiene el nombre correcto
- [ ] `product_content` tiene el contenido (o NULL)
- [ ] `unit_type` es 'UNIT' o 'KG'
- [ ] `quantity` es Decimal con 3 decimales
- [ ] `unit_price` es Decimal con 2 decimales

---

## ⚠️ 8. CASOS DE ERROR

### 8.1 Venta no encontrada
- [ ] Ir a `/receipt/ID_INVALIDO`
- [ ] Debería mostrar: "Venta no encontrada"
- [ ] Redirecciona a `/pos` automáticamente

### 8.2 Sin permiso (CASHIER intenta ver venta de otro)
- [ ] Como CASHIER, obtener ID de venta de otro usuario
- [ ] Ir a `/receipt/[otroSaleId]`
- [ ] Debería mostrar: "No tienes permiso para ver esta venta"
- [ ] Status 403

---

## ✨ 9. FLUJO COMPLETO E2E

### Escenario: Venta completa con impresión
1. [ ] **Abrir turno** con S/ 100
2. [ ] **Agregar productos al carrito:**
   - 2x Chizitos (UNIT)
   - 0.500 kg Azúcar (KG)
3. [ ] **Finalizar venta**
4. [ ] **Modal post-venta aparece**
5. [ ] **Clic "Imprimir Ticket"**
6. [ ] **Nueva pestaña con ticket**
7. [ ] **Verificar todos los datos**
8. [ ] **Clic "Imprimir"**
9. [ ] **Guardar como PDF**
10. [ ] **Clic "Volver"**
11. [ ] **Va a /pos**
12. [ ] **Ir a "Ventas"**
13. [ ] **Ver venta en historial** (marca "Impreso")
14. [ ] **Reimprimir desde historial**
15. [ ] **Cerrar turno** con caja correcta

---

## 📝 CRITERIOS DE ÉXITO

### Obligatorios ✅
- [ ] Ticket se imprime en 80mm (no página completa)
- [ ] Tipografía monospace, separadores alineados
- [ ] @media print funciona (oculta botones, sin márgenes)
- [ ] Modal post-venta con botón "Imprimir Ticket"
- [ ] Historial de ventas funciona con filtros
- [ ] Reimpresión desde historial
- [ ] CASHIER ve solo sus ventas, OWNER ve todas
- [ ] Sale.printedAt se actualiza al imprimir
- [ ] CASH muestra recibido/vuelto, otros métodos NO
- [ ] Productos UNIT muestran cantidad entera
- [ ] Productos KG muestran 3 decimales

### Opcionales 🎁
- [ ] PDF generado server-side (v2, no implementado en v1)
- [ ] StoreSettings.ticketFooter personalizable (no implementado)
- [ ] Impresión automática post-venta (no recomendado por UX)

---

## 🐛 PROBLEMAS CONOCIDOS

1. **Limitación de window.print()**
   - `printedAt` se marca ANTES de que el usuario confirme impresión
   - Si el usuario cancela el diálogo, la venta queda marcada como impresa
   - **Solución v2**: Usar `onafterprint` event (no confiable en todos los navegadores)

2. **PDF Download v1**
   - Usa "Guardar como PDF" del navegador (no es descarga directa)
   - Usuario debe seleccionar manualmente en el diálogo de impresión
   - **Solución v2**: Generar PDF server-side con Playwright o pdfkit

3. **ticketFooter personalizable**
   - Actualmente hardcoded: "Gracias por su compra"
   - **Solución v2**: Agregar campo `ticketFooter` a StoreSettings

---

## 📁 ARCHIVOS CREADOS/MODIFICADOS

### Nuevos archivos:
- `src/app/api/sales/[id]/route.ts` - GET detalle de venta
- `src/app/api/sales/[id]/mark-printed/route.ts` - POST marcar impresa
- `src/app/receipt/[id]/page.tsx` - Vista del ticket 80mm
- `src/app/sales/page.tsx` - Historial de ventas

### Archivos modificados:
- `src/app/api/sales/route.ts` - Agregados filtros (query, from, to, role)
- `src/app/pos/page.tsx` - Modal post-venta con botón imprimir
- `src/components/AuthLayout.tsx` - Enlace "Ventas" en navegación
- `src/lib/money.ts` - formatMoney más robusto (maneja null/undefined)

---

## 🎉 FIN DEL CHECKLIST

**Si todos los tests pasan, el Módulo 6 está completo y listo para producción.**
