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

## Estado

- [x] Fase 0
- [ ] Fase 1
- [ ] Fase 2
- [ ] Fase 3
- [ ] Fase 4
- [ ] Fase 5
