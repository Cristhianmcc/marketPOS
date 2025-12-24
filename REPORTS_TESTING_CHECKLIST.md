# ✅ CHECKLIST DE PRUEBAS — MÓDULO 7: REPORTES + EXPORT

## 🎯 Objetivo
Verificar que el sistema de reportes funcione correctamente con datos precisos, exports funcionales y permisos por rol.

---

## 📊 1. PESTAÑA RESUMEN

### 1.1 Visualización de Cards
- [ ] El card "Total Ventas" muestra el monto correcto con formato S/ X.XX
- [ ] El card "Tickets" muestra la cantidad correcta de ventas
- [ ] El card "Ticket Promedio" = Total Ventas / Tickets
- [ ] Los números coinciden con los datos reales en la base de datos

### 1.2 Filtros de Fecha
- [ ] El filtro "Desde" funciona correctamente (default: hace 7 días)
- [ ] El filtro "Hasta" funciona correctamente (default: hoy)
- [ ] Al cambiar las fechas, los datos se actualizan automáticamente
- [ ] Las fechas abarcan todo el día (hasta las 23:59:59)

### 1.3 Métodos de Pago
- [ ] Se muestran todos los métodos de pago usados (CASH, YAPE, PLIN, CARD, TRANSFER)
- [ ] Cada método muestra el total correcto
- [ ] Cada método muestra la cantidad de tickets
- [ ] La suma de todos los métodos = Total Ventas

### 1.4 Top 5 Productos
- [ ] Se muestran los 5 productos más vendidos por monto
- [ ] Cada producto muestra nombre + contenido
- [ ] Se muestra la cantidad total vendida (con 3 decimales)
- [ ] Se muestra el monto total generado
- [ ] El orden es correcto (del mayor al menor monto)

---

## 📅 2. PESTAÑA VENTAS POR DÍA

### 2.1 Filtros
- [ ] El filtro "Desde" funciona (default: hace 7 días)
- [ ] El filtro "Hasta" funciona (default: hoy)
- [ ] Al cambiar fechas, la tabla se actualiza

### 2.2 Tabla de Ventas Diarias
- [ ] Se muestra una fila por cada día con ventas
- [ ] La columna "Fecha" tiene formato legible (DD/MM/YYYY)
- [ ] La columna "Tickets" muestra la cantidad correcta
- [ ] La columna "Total" = Efectivo + Otros
- [ ] La columna "Efectivo" incluye solo ventas CASH
- [ ] La columna "Otros" incluye YAPE, PLIN, CARD, TRANSFER
- [ ] Los días sin ventas no aparecen
- [ ] El orden es descendente (más reciente primero)

### 2.3 Validaciones
- [ ] Los totales coinciden con la suma de ventas de cada día
- [ ] No hay días duplicados

---

## 🕐 3. PESTAÑA TURNOS

### 3.1 Filtros
- [ ] Filtro "Desde" funciona (default: hace 7 días)
- [ ] Filtro "Hasta" funciona (default: hoy)
- [ ] Solo se muestran turnos CERRADOS (closedAt NOT NULL)

### 3.2 Tabla de Turnos
- [ ] Se muestra fecha/hora de apertura
- [ ] Se muestra fecha/hora de cierre
- [ ] Se muestra el nombre del cajero
- [ ] Columna "Caja Inicial" es correcta
- [ ] Columna "Efectivo Esperado" = Caja Inicial + Ventas en CASH del turno
- [ ] Columna "Caja Final" es lo que el cajero declaró
- [ ] Columna "Diferencia" = Caja Final - Efectivo Esperado
- [ ] Diferencia = 0 se muestra en VERDE
- [ ] Diferencia > 0 (sobrante) se muestra en AZUL
- [ ] Diferencia < 0 (faltante) se muestra en ROJO
- [ ] Columna "Ventas" muestra el total de ventas del turno
- [ ] Columna "Tickets" muestra la cantidad de ventas del turno

### 3.3 Validaciones
- [ ] Los turnos abiertos NO aparecen en el reporte
- [ ] Las ventas del turno coinciden con las ventas registradas en ese periodo

---

## 🏆 4. PESTAÑA TOP PRODUCTOS

### 4.1 Filtros
- [ ] Selector "Ordenar por" tiene opciones: Monto | Cantidad
- [ ] Selector "Límite" tiene opciones: Top 5, Top 10, Top 20, Top 50
- [ ] Filtro "Desde" funciona (default: hace 30 días)
- [ ] Filtro "Hasta" funciona (default: hoy)
- [ ] Al cambiar cualquier filtro, la tabla se actualiza

### 4.2 Tabla Top Productos
- [ ] Cada producto muestra su posición (#1, #2, #3...)
- [ ] Se muestra el nombre del producto
- [ ] Se muestra el contenido (si existe)
- [ ] Columna "Tipo" muestra UNIT o KG correctamente
- [ ] Columna "Cantidad Vendida" suma todas las cantidades (3 decimales)
- [ ] Columna "Monto Total" suma todos los subtotales
- [ ] El orden cambia según el filtro "Ordenar por":
  - Por Monto: orden descendente de "Monto Total"
  - Por Cantidad: orden descendente de "Cantidad Vendida"

### 4.3 Validaciones
- [ ] La cantidad de productos respeta el límite seleccionado
- [ ] Los productos con 0 ventas no aparecen
- [ ] Los totales coinciden con los saleItems de ese periodo

---

## 📥 5. PESTAÑA EXPORTAR

### 5.1 CSV: Ventas
- [ ] El botón "Descargar Ventas" descarga un archivo CSV
- [ ] El archivo tiene el nombre: `ventas_YYYY-MM-DD.csv`
- [ ] El archivo tiene los headers: Ticket, Fecha, Hora, Subtotal, Impuesto, Total, Metodo Pago, Monto Pagado, Vuelto, Cajero, Turno, Impreso
- [ ] Los datos están correctamente formateados
- [ ] Las comas dentro de campos están escapadas con comillas dobles
- [ ] El archivo se abre correctamente en Excel / Google Sheets
- [ ] Usa el rango de fechas del filtro de Resumen

### 5.2 CSV: Items
- [ ] El botón "Descargar Items" descarga un archivo CSV
- [ ] El archivo tiene el nombre: `items_YYYY-MM-DD.csv`
- [ ] El archivo tiene los headers: Ticket, Fecha, Producto, Contenido, Tipo, Cantidad, Precio Unit, Subtotal, Metodo Pago
- [ ] Cada fila corresponde a un item de venta
- [ ] Los números tienen formato correcto (cantidad con 3 decimales, precios con 2)
- [ ] El archivo se abre correctamente en Excel / Google Sheets
- [ ] Usa el rango de fechas del filtro de Resumen

### 5.3 CSV: Turnos
- [ ] El botón "Descargar Turnos" descarga un archivo CSV
- [ ] El archivo tiene el nombre: `turnos_YYYY-MM-DD.csv`
- [ ] El archivo tiene los headers: Fecha Apertura, Fecha Cierre, Abierto Por, Cerrado Por, Caja Inicial, Efectivo Esperado, Caja Final, Diferencia, Notas
- [ ] Solo incluye turnos cerrados
- [ ] Los montos tienen 2 decimales
- [ ] El archivo se abre correctamente en Excel / Google Sheets
- [ ] Usa el rango de fechas del filtro de Resumen

### 5.4 CSV: Inventario
- [ ] El botón "Descargar Inventario" descarga un archivo CSV
- [ ] El archivo tiene el nombre: `inventario_YYYY-MM-DD.csv`
- [ ] El archivo tiene los headers: Nombre, Marca, Contenido, Categoria, Codigo, Tipo, Precio, Stock, Stock Minimo, Estado
- [ ] Incluye todos los productos de la tienda
- [ ] El campo "Estado" muestra "Activo" o "Inactivo"
- [ ] El campo "Tipo" muestra "Unidad" o "KG"
- [ ] El archivo se abre correctamente en Excel / Google Sheets
- [ ] NO usa filtro de fechas (estado actual)

### 5.5 Nota Informativa
- [ ] Se muestra el mensaje azul explicando que Ventas/Items/Turnos usan el rango de fechas del Resumen
- [ ] El mensaje indica las fechas actuales configuradas

---

## 🔒 6. PERMISOS POR ROL

### 6.1 Rol OWNER (Propietario)
- [ ] Puede acceder a /reports
- [ ] Ve TODAS las ventas del store (sin filtro de usuario)
- [ ] Ve TODOS los turnos del store
- [ ] Los reportes incluyen ventas de todos los cajeros
- [ ] Los CSV incluyen datos de todos los cajeros

### 6.2 Rol CASHIER (Cajero)
- [ ] Puede acceder a /reports
- [ ] Ve SOLO SUS PROPIAS ventas
- [ ] Ve SOLO SUS PROPIOS turnos
- [ ] Los reportes filtran por su userId
- [ ] Los CSV solo incluyen sus propias ventas/turnos
- [ ] El inventario es el mismo (no se filtra por usuario)

### 6.3 Sin autenticación
- [ ] Al intentar acceder a /reports sin login, redirige a /login
- [ ] Los endpoints de API retornan 401 si no hay sesión

---

## 🧪 7. CASOS ESPECIALES

### 7.1 Sin Datos
- [ ] Si no hay ventas en el periodo, el Resumen muestra S/ 0.00
- [ ] Si no hay ventas diarias, la tabla muestra "No hay ventas en este periodo"
- [ ] Si no hay turnos, la tabla muestra "No hay turnos en este periodo"
- [ ] Si no hay productos vendidos, la tabla muestra "No hay datos en este periodo"

### 7.2 Cálculos con Decimales
- [ ] Los totales manejan correctamente productos en KG (3 decimales)
- [ ] Los precios siempre tienen 2 decimales (S/ X.XX)
- [ ] No hay errores de redondeo

### 7.3 Fechas Especiales
- [ ] Si "Desde" > "Hasta", el sistema no rompe (pero no retorna datos)
- [ ] Si se selecciona el mismo día en "Desde" y "Hasta", funciona correctamente
- [ ] Las fechas respetan la zona horaria (Perú)

### 7.4 Performance
- [ ] Los reportes con 100+ ventas cargan en menos de 3 segundos
- [ ] Los exports no bloquean la UI
- [ ] No hay errores 500 en consola de servidor

---

## 📝 8. VALIDACIÓN FINAL

### 8.1 Integridad de Datos
- [ ] Los totales del Resumen coinciden con la suma de ventas en la BD
- [ ] Las ventas diarias suman el total del periodo
- [ ] Los turnos reflejan correctamente las ventas en efectivo
- [ ] Top productos refleja realmente los más vendidos

### 8.2 UX/UI
- [ ] Las pestañas cambian correctamente sin errores
- [ ] Los loaders aparecen mientras carga
- [ ] Los colores están correctos (verde=exacto, azul=sobrante, rojo=faltante)
- [ ] Las tablas son responsivas
- [ ] Los botones de export tienen iconos y texto claro

### 8.3 Consistencia con Otros Módulos
- [ ] Los datos coinciden con los mostrados en /sales
- [ ] Los turnos coinciden con los mostrados en /shifts
- [ ] El inventario coincide con /inventory

---

## ✅ APROBACIÓN FINAL

- [ ] **Todos** los checkboxes anteriores están marcados
- [ ] Se probó con datos reales (mínimo 10 ventas, 3 turnos)
- [ ] Se probó con ROL OWNER y CASHIER
- [ ] Se descargaron y abrieron los 4 CSV en Excel
- [ ] No hay errores en consola del navegador
- [ ] No hay errores 500 en el servidor
- [ ] El módulo está listo para producción ✨

---

**Fecha de prueba:** _______________  
**Probado por:** _______________  
**Resultado:** ✅ APROBADO / ❌ REQUIERE AJUSTES
