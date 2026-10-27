# Plan: exonerados, inafectos e ICBPER

Fecha: 27/10/2026. Rama: `feature/sunat-beta`.

## Problema

Todo producto se trata como gravado al 18 % con precio final que incluye IGV.
Checkout guarda `Sale.tax = 0` y SUNAT separa la base dividiendo entre 1.18.
Cada línea UBL lleva siempre `TaxExemptionReasonCode = 10` y el Resumen Diario
asume todo gravado. No hay forma de vender:

- **Exonerados** (código 20, tributo 9997 EXO): por ejemplo ciertos medicamentos
  o productos de la Amazonía.
- **Inafectos** (código 30, tributo 9998 INA).
- **Bolsas plásticas con ICBPER** (tributo 7152): monto fijo por bolsa, aparte
  del IGV. Tarifa vigente: S/ 0.50 por bolsa.

Una botica con medicamentos exonerados o cualquier tienda que cobre bolsas
emitiría hoy comprobantes con impuestos equivocados.

## Decisiones de diseño (propuestas)

1. El tipo de afectación se elige **por producto en el inventario**:
   Gravado (por defecto), Exonerado o Inafecto. Los productos existentes quedan
   como Gravado, sin cambiar su comportamiento.
2. El precio que se escribe sigue siendo el **precio final** que paga el cliente.
   Para un gravado incluye IGV; para un exonerado o inafecto no hay IGV.
3. Un producto puede marcarse **"Bolsa plástica (ICBPER)"**. Al venderlo, el
   impuesto de S/ 0.50 por unidad se **suma aparte** al total, como en los
   supermercados ("BOLSA 0.00 + ICBPER 0.50"). La tarifa queda en una tabla por
   año para actualizarla sin tocar el cobro.
4. La venta guarda un snapshot por línea: afectación, base, IGV e ICBPER. Así un
   cambio posterior en el producto no altera comprobantes ya emitidos.

## Fases y criterios de aceptación

Cada fase la valida Claude como tester; ninguna prueba usa base real ni red.

### Fase 0: banco de pruebas

- Ampliar `npm run sunat:test:local` con una boleta y una factura mixtas
  (gravado + exonerado + inafecto + bolsa) y su Resumen Diario.
- Ampliar el banco de checkout con esas ventas.
- **Aceptación:** con el código actual debe fallar en afectaciones, totales por
  tipo y tributos, indicando cada diferencia.

### Fase 1: modelo y migración

- `StoreProduct`: afectación IGV y marca ICBPER. `SaleItem`: snapshot de
  afectación, base, IGV, cantidad y monto ICBPER. `Sale`: total ICBPER.
- Migración versionada aditiva (columnas con valor por defecto), sin pérdida.
- Respaldo y restauración incluyen los campos nuevos.
- **Aceptación:** `test:migrations:isolated` aplica la migración sobre la base;
  roundtrip del respaldo sigue 34/34 con los campos nuevos.

### Fase 2: cobro

- Checkout calcula por línea: gravado (base = precio / 1.18), exonerado e
  inafecto (base = precio, IGV 0) e ICBPER (cantidad × tarifa, sumado al total).
- **Aceptación:** banco de checkout con totales, bases, IGV e ICBPER exactos y
  redondeo a 2 decimales; ventas solo gravadas sin cambios.

### Fase 3: XML SUNAT

- Factura, boleta, nota de crédito y nota de débito: categoría y código por
  línea (S/10, E/20, O/30), subtotales por tributo (1000, 9997, 9998, 7152) y
  totales (gravada, exonerada, inafecta, ICBPER).
- Resumen Diario: importes por tipo de operación e ICBPER.
- **Aceptación:** XSD de los seis formatos y coherencia de importes; después,
  envío real a SUNAT BETA de una boleta, una factura y un resumen mixtos
  (prueba con el usuario).

### Fase 4: pantallas e impresión

- Inventario: selector de afectación y casilla ICBPER.
- POS: total con ICBPER aparte.
- Ticket, recibo y PDF: OP. GRAVADA, OP. EXONERADA, OP. INAFECTA, IGV, ICBPER.
- **Aceptación:** pruebas del ticket en 80 y 58 mm con venta mixta.

### Fase 5: regresión y portable

- TypeScript, lint, auditoría, respaldo, ferretería, ticket, SUNAT local,
  migraciones y compilación. Un portable para probar todo lo acumulado.

## Resultado de la Fase 0 (27/10/2026)

Decisión confirmada: el ICBPER se suma aparte al total.

`npm run test:sunat:taxes` genera, firma y valida con XSD una boleta, una
factura, una nota de crédito y un Resumen Diario de una venta mixta: arroz
gravado S/ 10, paracetamol exonerado 2 × S/ 2.50, libro inafecto S/ 20 y 2
bolsas gravadas de S/ 0.10 con ICBPER 2 × S/ 0.50. Total esperado S/ 36.20:
gravada 8.64, IGV 1.56, exonerada 5.00, inafecta 20.00, ICBPER 1.00.

El contrato del payload queda definido en la cabecera del script
(`igvAffectation`, `icbper*` por línea; `exempt`, `unaffected`, `icbper` en
totales y en las líneas del resumen).

Con el código actual pasan 20 de 50 comprobaciones. Fallan, en los cuatro
documentos: códigos 20/30, tributos 9997/9998/7152, categorías E/O, ICBPER por
unidad, subtotales de cabecera, total de impuestos y valor de venta; en el
resumen, los importes 02/03 y el ICBPER. Los cuatro XML **pasan el XSD** aun con
esos errores: la validación estructural no detecta impuestos mal calculados.
Hallazgo adicional: la nota de crédito informa como valor de venta solo la
primera línea (8.47).

Los casos de cobro se escriben en la Fase 2, cuando existan los campos del
modelo; antes no se puede sembrar un producto exonerado.

## Resultado de la Fase 1 (27/10/2026)

- Esquema: enum `IgvAffectation` (GRAVADO, EXONERADO, INAFECTO);
  `StoreProduct.igvAffectation` e `icbper`; `Sale.icbperTotal`;
  `SaleItem.igvAffectation`, `taxableAmount`, `igvAmount`, `icbperQuantity`,
  `icbperAmount`; `ElectronicDocument.exempt`, `unaffected`, `icbper`.
- Migración `20261027000000_tax_affectations`: solo `CREATE TYPE` y
  `ADD COLUMN` con valores por defecto; los datos existentes quedan gravados.
- Hallazgo corregido: la adopción de bases antiguas comparaba contra el esquema
  actual, por lo que cualquier migración nueva habría impedido arrancar a una
  instalación anterior. Ahora compara contra `prisma/baseline/schema.prisma`
  (copia exacta del datamodel de la línea base) y después aplica las
  migraciones pendientes.
- Respaldo: exportación sin cambios (exporta todas las columnas); la
  restauración y el archivo fiscal conservan los campos nuevos y usan
  gravado/0 para respaldos anteriores.

Validación: `test:migrations:isolated` (instalación limpia con 2 migraciones,
adopción de una base antigua con un producto que conserva precio y stock y
queda gravado, rechazo de deriva); roundtrip del respaldo 34/34 con productos
exonerado/inafecto/ICBPER y una mutación detectada; auditoría 40/40 con H04
actualizado (primera migración = línea base, posteriores solo aditivas; una
migración de prueba con `DROP COLUMN` fue rechazada); ferretería 13/13,
SUNAT local, ticket 7/7, respaldo programado y TypeScript/lint correctos. La
prueba de impuestos sigue en 20/50 hasta la Fase 3.

Nota de despliegue: el servicio web en Render necesita aplicar el esquema en su
próximo despliegue (`prisma db push` temporal, como la vez anterior).

## Resultado de la Fase 2 (27/10/2026)

- `src/lib/sales/lineTaxes.ts`: `computeLineTaxes` calcula por línea la base y
  el IGV desde el importe final (gravado: ÷ 1.18; exonerado e inafecto: sin IGV)
  y el ICBPER = cantidad base × tarifa del año (`icbperRateFor`, S/ 0.50 desde
  2023).
- Checkout guarda el snapshot por línea y `Sale.icbperTotal`, y suma el ICBPER
  al total después del cupón y del descuento global: el ICBPER no es
  descontable. Efectivo, pago mixto, vuelto y fiado usan ese total.
- Servicios y ventas libres conservan el comportamiento anterior (gravados).

Validación: `npm run test:checkout:taxes` cobra 7 casos contra PostgreSQL real
(venta mixta en efectivo con vuelto, efectivo y pago mixto insuficientes por el
ICBPER, venta solo gravada sin cambios, descuento global que no reduce el
ICBPER, fiado con la deuda incluyendo el ICBPER, pago mixto suficiente): 7/7.
Mutación: no sumar el ICBPER al total hizo fallar 6 de 7 casos.
Regresión: ferretería 13/13, respaldo 34/34, auditoría 40/40, SUNAT local,
TypeScript y lint correctos. La prueba XML sigue en 20/50 hasta la Fase 3.

Restricción hasta la Fase 4: el POS todavía calcula el total sin ICBPER y no
hay pantalla para marcar productos exonerados o bolsas, de modo que estos
casos no son alcanzables desde la interfaz. Las Fases 3 y 4 deben salir juntas
antes de habilitarlos para un cliente.

## Resultado de la Fase 3 (27/10/2026)

- `src/lib/sunat/ubl/taxes.ts`: tributos de línea (S/10/1000, E/20/9997,
  O/30/9998 e ICBPER 7152 con `BaseUnitMeasure` y `PerUnitAmount`) y de cabecera
  (un subtotal por tributo presente). Factura, boleta y notas lo comparten; el
  valor de venta es gravada + exonerada + inafecta y el total incluye ICBPER.
  Las notas de crédito y débito ahora informan también valor de venta e importe
  con impuestos en la cabecera.
- Resumen Diario: importes 02 (exonerado) y 03 (inafecto) y un `TaxTotal` 7152.
- `src/lib/sunat/saleTaxLines.ts`: único cálculo de líneas (descuentos de
  cabecera repartidos, afectación por línea, ICBPER) usado por la emisión, la
  re-firma y la nota de crédito total. Antes, `buildPayloadFromDocument` armaba
  las líneas con el subtotal previo a descuentos, de modo que una nota total de
  una venta con descuento podía no cuadrar con el comprobante original.
- La nota parcial toma la afectación del comprobante si este no tiene operación
  gravada. Limitación: en un comprobante mixto, una nota parcial se informa como
  gravada.
- Emisión, notas y resumen guardan `exempt`, `unaffected` e `icbper`.

Corrección del informe de la Fase 0: la nota de crédito no calculaba mal el
valor de venta; no lo incluía en la cabecera y la prueba leyó el de la primera
línea. Ahora se incluye.

Validación: `test:sunat:taxes` 50/50 (XSD de boleta, factura, nota y resumen);
`test:checkout:taxes` 7/7 cobros más dos ventas mixtas convertidas en boleta y
nota de crédito total con XSD válido e importes exactos (36.20 y 9.60, con
descuento global); mutación "todo gravado" detectada (IGV 5.37 en vez de 1.56).
Regresión: SUNAT local, ferretería 13/13, ticket 7/7, respaldo 34/34,
auditoría 40/40, TypeScript y lint correctos.

Pendiente de la fase: envío controlado a SUNAT BETA de una boleta, una factura,
una nota y un resumen mixtos. Requiere las pantallas de la Fase 4 para crear los
productos.

## Resultado de la Fase 4 (27/10/2026)

- Inventario: el modal de edición permite elegir el tipo de IGV y marcar
  "Bolsa plástica (ICBPER)"; `PUT /api/store-products/[id]` valida ambos y el
  repositorio de productos los devuelve al inventario y al POS. Los productos
  nuevos se crean gravados y sin ICBPER; se ajustan editándolos.
- POS: `getCartIcbper` usa la misma tarifa que el servidor y `getCartTotal`
  suma el ICBPER, así el total mostrado, el efectivo recibido y el vuelto
  coinciden con el cobro. Panel, carrito móvil y modal de pago muestran la
  línea "ICBPER bolsas".
- Ticket térmico, recibo y PDF: OP. GRAVADA (se omite si es cero y hay otra
  operación), OP. EXONERADA, OP. INAFECTA, IGV e ICBPER. El ticket sin
  comprobante muestra "ICBPER BOLSAS".

Validación: `test:ticket:isolated` 12/12 (ticket mixto en 80 y 58 mm, ticket
solo exonerado, ticket sin comprobante con ICBPER y total del POS igual al del
servidor para el mismo caso, S/ 9.60; tarifa 2022 de S/ 0.40). Mutación: quitar
el ICBPER del total del POS fue detectada (9.10 ≠ 9.60). Regresión completa y
`build:only` correctos. Las pantallas no se probaron en navegador (el servidor
de desarrollo usaría la base configurada); se revisan en el portable.

## Estado

- [x] Fase 0
- [x] Fase 1
- [x] Fase 2
- [x] Fase 3 (salvo envío a SUNAT BETA)
- [x] Fase 4 (salvo revisión visual en el portable)
- [ ] Fase 5
