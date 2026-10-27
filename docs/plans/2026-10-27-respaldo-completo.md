# Plan: respaldo completo por tienda

Fecha: 27/10/2026. Rama: `feature/sunat-beta` (base `1d5e9bec`).

## Problema

`src/app/api/backups/export/route.ts` solo exporta el núcleo de bodega:
configuración, usuarios, productos, turnos, ventas, movimientos, clientes,
fiados, plan, flags y archivo fiscal. `restore/new-store` recrea solo eso.
Una tienda de farmacia, ferretería o taller pierde datos aunque tenga respaldo.

Además, dentro de lo que ya se exporta, la restauración omite referencias:
`Movement.batchId`, `SaleItem.serviceId` y `ProductMaster.baseUnitId`.

## Alcance

Se agregan al respaldo y a la restauración:

| Grupo | Modelos | Rubros |
| --- | --- | --- |
| Catálogo | `Category` (con jerarquía), `ProductMaster.baseUnitId` por código de unidad | Todos |
| Unidades | `UnitConversion`, `SellUnitPrice` (unidades globales por `code`) | Ferretería |
| Lotes | `ProductBatch`, `Movement.batchId` | Botica, Farmacia |
| Compras | `Supplier`, `PurchaseOrder`, `PurchaseOrderItem` | Botica, Ferretería |
| Farmacia | `Patient`, `PatientMedication`, `ControlledBookEntry`, `DrugInteractionLog` | Botica, Farmacia |
| Servicios | `Service`, `WorkOrder`, `WorkOrderItem`, `SaleItem.serviceId` | Taller, Lavandería |
| Comercial | `Promotion`, `Coupon`, `CategoryPromotion`, `VolumePromotion`, `NthPromotion` | Todos |
| Límites | `OperationalLimit` | Todos |
| Catálogo público | `CatalogSettings` sin `storeSlug` ni URL publicada; queda deshabilitado | Todos |

Exclusiones deliberadas: `AuditLog`, `SunatJob`, `CloudBackup`,
`CatalogSyncQueue`, pagos de suscripción (`Payment`, viven en la nube) y
`DrugInteraction` (catálogo global, sin tienda). Siguen sin exportarse
contraseñas, credenciales SOL ni certificados.

## Decisiones de formato

- `metadata.version` pasa a `1.1`. La restauración acepta `1.0` y `1.1`; un
  ZIP `1.0` sigue restaurándose con las secciones nuevas vacías.
- Cada sección nueva se agrega a `metadata.counts` y se valida igual que hoy.
- Las unidades se referencian por `Unit.code` (ver el ajuste de la Fase 0).
- Todo ocurre dentro de la transacción existente: cualquier referencia rota
  revierte la restauración entera.
- Los IDs de origen se traducen con mapas, como ya se hace con productos,
  usuarios, turnos y ventas.

Riesgo a vigilar: el respaldo pasa a contener datos de salud de pacientes. El
ZIP no está cifrado; se documentará y se evaluará el cifrado en una fase
posterior.

## Fases y criterios de aceptación

Cada fase la valida Claude como tester antes de darla por lista. Ninguna prueba
usa la base real ni Supabase.

### Fase 0: banco de pruebas real

- `scripts/test-backup-roundtrip-isolated.cjs`: levanta el PostgreSQL incluido en
  una carpeta temporal, aplica `prisma migrate deploy`, siembra una tienda con
  datos de todos los módulos, ejecuta el handler real de exportación, restaura
  el ZIP con el handler real y compara tabla por tabla origen contra destino.
- Guarda un ZIP sintético `1.0` generado con el código actual como fixture de
  compatibilidad (sin datos reales).
- **Aceptación:** con el código actual, la prueba debe fallar e indicar
  exactamente las tablas y referencias faltantes. Si no detecta la ausencia, el
  banco no sirve.

### Fase 1: exportación

- Exportar todas las secciones del alcance y sus conteos.
- **Aceptación:** el ZIP contiene cada sección con el conteo sembrado, el
  checksum valida, no hay hashes de contraseña, SOL ni certificado, y
  `npm run test:backups:isolated` sigue pasando.

### Fase 2: restauración

- Restaurar en orden de dependencias: unidades y categorías, maestros, productos
  de tienda, lotes, servicios, proveedores, usuarios, clientes, turnos, ventas
  (con `serviceId`), movimientos (con `batchId`), fiados, compras, órdenes de
  trabajo (con `saleId`), pacientes, medicación, libro de controlados, logs de
  interacción, promociones, cupones, límites y catálogo.
- **Aceptación:**
  1. El roundtrip compara 100 % de las filas y campos de negocio.
  2. Stock general = suma de lotes activos donde aplica, igual que en origen.
  3. El fixture `1.0` se restaura sin errores.
  4. Una referencia rota (por ejemplo un lote de un producto inexistente)
     revierte todo: cero filas nuevas.
  5. Una unidad ausente en el destino se crea desde el respaldo; una existente
     no se modifica.

### Fase 3: regresión

- **Aceptación:** TypeScript web y Electron sin diagnósticos, lint sin errores,
  `scripts/audit-pos-isolated.cjs` completo, `test:backups:isolated`,
  `test:migrations:isolated` y `npm run build:only` correctos.

### Fase 4: aceptación operativa (con el usuario)

- En el instalador: crear datos de farmacia, ferretería y taller, respaldar,
  restaurar como tienda nueva y revisar los conteos del resultado.
- **Aceptación:** los conteos mostrados coinciden con el origen y la tienda
  restaurada opera (venta FEFO, conversión de unidades, orden de trabajo).

## Resultado de la Fase 0 (27/10/2026)

`npm run test:backups:roundtrip` restaura en una base distinta a la de origen,
con unidades sembradas en otro orden para que sus IDs difieran. Con el código
de `1d5e9bec` falla en **25 de 34 modelos**:

- Sin restaurar: `OperationalLimit`, `CatalogSettings`, `Category`,
  `UnitConversion`, `SellUnitPrice`, `ProductBatch`, `Service`, `Supplier`,
  `PurchaseOrder`, `PurchaseOrderItem`, `WorkOrder`, `WorkOrderItem`, `Patient`,
  `PatientMedication`, `ControlledBookEntry`, `DrugInteractionLog`, `Promotion`,
  `Coupon`, `CategoryPromotion`, `VolumePromotion`, `NthPromotion`.
- Referencias perdidas: `ProductMaster.baseUnitId`, `SaleItem.serviceId`,
  `Movement.batchId`.
- Fecha perdida: `Shift.createdAt`.

Se conservan: configuración, plan, flags, usuarios, productos de tienda,
clientes, ventas, fiados y abonos.

Fixture de compatibilidad: `scripts/fixtures/backup-v1.0-sintetico.zip`, datos
sintéticos exportados con el formato `1.0`, sin contraseñas.

Ajuste de diseño: las unidades (`Unit`) son globales y se siembran al
inicializar cada instalación, por lo que el destino puede no tener alguna. En
lugar de detener la restauración, el respaldo incluirá la definición de las
unidades usadas y la restauración creará por `code` solo las que falten; nunca
modifica una unidad existente.

## Resultado de la Fase 1 (27/10/2026)

`/api/backups/export` genera el formato `1.1` con las secciones `units`,
`categories`, `unitConversions`, `sellUnitPrices`, `productBatches`, `services`,
`suppliers`, `purchaseOrders` (con `items`), `workOrders` (con `items`),
`patients`, `patientMedications`, `controlledBookEntries`, `drugInteractionLogs`,
`promotions`, `coupons`, `categoryPromotions`, `volumePromotions`,
`nthPromotions`, `operationalLimit` y `catalogSettings`, más sus conteos en
`metadata.counts`. Los maestros incluyen también los referenciados por
conversiones, precios por presentación y promociones. El respaldo programado de
Electron rotula sus ZIP como `1.1`, y la restauración acepta `1.0` y `1.1`; las
secciones nuevas se ignoran hasta la Fase 2.

Validación: 45/45 comprobaciones del ZIP en `npm run test:backups:roundtrip`
(secciones, conteos, ítems anidados, unidades usadas, `batchId`, `serviceId`,
`baseUnitId`, checksum y ausencia de contraseñas, SOL y certificados; el
detector de secretos se comprobó con muestras positivas). El roundtrip sigue
fallando en los mismos 25 modelos, como corresponde antes de la Fase 2.
Regresión: TypeScript web y Electron, lint de las rutas, `test:backups:isolated`,
auditoría aislada (40/40) y `git diff --check` correctos.

## Resultado de las Fases 2 y 3 (27/10/2026)

`restore/new-store` recrea todas las secciones `1.1` dentro de la misma
transacción, en orden de dependencias. Las unidades se traducen por código y se
crean solo las que faltan. La categoría padre se enlaza en un segundo paso. El
catálogo público vuelve deshabilitado y sin slug. Se conservan además
`Movement.batchId`, `SaleItem.serviceId`, `ProductMaster.baseUnitId` (al crear
un maestro nuevo) y `Shift.createdAt`. Si el respaldo contiene una sección, toda
referencia a ella debe resolverse o la restauración entera se revierte; en un
respaldo `1.0` esas referencias se omiten como antes. Los conteos de las
secciones nuevas se validan contra `metadata.counts`, y el panel SUPERADMIN
muestra lotes, proveedores, compras, servicios, órdenes, pacientes y registros
de controlados restaurados.

Validación en `npm run test:backups:roundtrip`:

- Roundtrip: 34/34 modelos conservados campo por campo en otra base.
- Exportación: 45/45 comprobaciones.
- Casos adicionales 5/5: unidad faltante creada, unidad existente intacta,
  stock igual a la suma de lotes, fixture `1.0` restaurado, y referencia rota
  revertida sin dejar tiendas, usuarios, productos, ventas ni categorías.
- Prueba de mutación: anular `Movement.batchId` en la restauración hizo fallar
  exactamente `Movement`; se revirtió la mutación.
- El banco reconoce `saleId` de `ControlledBookEntry` y `DrugInteractionLog`
  como referencias a la venta, aunque Prisma no declare esas relaciones.

Regresión (Fase 3): TypeScript web y Electron, lint de las rutas y del panel,
`test:backups:isolated`, auditoría aislada 40/40, `test:migrations:isolated`,
`git diff --check` y `npm run build:only` correctos.

## Estado

- [x] Fase 0
- [x] Fase 1
- [x] Fase 2
- [x] Fase 3
- [ ] Fase 4
