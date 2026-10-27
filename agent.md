# Monterrial POS: mapa técnico y estado verificado

Última revisión: **23/10/2026**, zona America/Lima. Base Git observada:
`2b182cfb` (22/03/2026, rama de trabajo con numerosos cambios sin confirmar).
Este documento describe el árbol de trabajo, no solamente el último commit.

## Cómo usar este documento

1. Leer este mapa y comprobar `git status --short`.
2. Localizar el flujo afectado en la tabla de módulos.
3. Leer los archivos concretos y sus diferencias recientes.
4. Consultar los hallazgos abiertos antes de cambiar comportamientos relacionados.
5. Verificar el cambio y actualizar este documento si el mapa dejó de ser válido.

No es una certificación de ausencia de errores. La auditoría inicial fue estática,
con validación de tipos/esquema y dos reproducciones aisladas. Desde entonces se
probaron en la rama Beta ventas y emisiones SUNAT BETA, además de una restauración
transaccional real del respaldo indicado abajo. No se probó impresión física. El informe detallado
es `docs/audits/2026-09-26-pos.md`.

## Arquitectura y tecnologías

- Aplicación web: Next.js **15.1.0**, App Router, React **19**, TypeScript estricto.
- Interfaz: Tailwind CSS 3, lucide-react, sonner; páginas cliente grandes.
- Persistencia: PostgreSQL, Prisma **5.22**; 44 modelos en `prisma/schema.prisma`.
- Sesiones: iron-session en cookie `market_pos_session`; contraseñas con bcrypt.
- Escritorio: Electron 28, electron-builder/NSIS Windows x64, versión **0.2.0**.
- Impresión: ESC/POS USB/red/Bluetooth, raster/HTML; servicio local adicional.
- Integraciones: SUNAT SOAP/XML/ZIP, Cloudinary, respaldos S3, catálogo remoto,
  licencias y conexión opcional a base de datos cloud.
- Inventario de `src`: 403 archivos TS/TSX, 50 páginas y 197 archivos `route.ts`.
  Estos conteos excluyen dependencias y distribuciones; no equivalen a cobertura
  exhaustiva de ejecución de cada ruta.

## Directorios: fuente frente a artefactos

| Ruta | Responsabilidad |
| --- | --- |
| `src/app` | Páginas y endpoints HTTP; mucha lógica de negocio reside en rutas |
| `src/components` | POS, inventario, catálogo, permisos visuales, layouts |
| `src/domain`, `src/repositories` | Tipos, esquemas y contratos; no concentran toda la lógica |
| `src/infra/db` | Cliente Prisma y repositorios de usuarios, productos, stock y turnos |
| `src/lib` | Sesión, flags, límites, descuentos, unidades, SUNAT y utilidades; `inventory/stockMutations.ts` concentra mutaciones atómicas de stock |
| `src/modules/pos` | Tipos y cálculos extraídos del POS; comprobar uso real al modificar |
| `src/modules/catalog` | Capas de catálogo público, publicación y sincronización |
| `src/worker/sunatWorker.ts` | Worker separado que procesa trabajos fiscales |
| `prisma` | Esquema, semillas, SQL y migraciones |
| `desktop/src` | Proceso principal, preload, servidor, PostgreSQL, impresión y backups |
| `desktop/scripts` | Preparación de recursos y empaquetado |
| `print-service/src/server.ts`, `print-service/src/security.ts` | Servidor de impresión en `127.0.0.1:12121`, emparejamiento local, CORS y validación |
| `scripts` | Mantenimiento, semillas y pruebas ad hoc; muchos modifican datos |
| `public` | Assets y service worker PWA |
| `landing` | Página de venta estática (Three.js + Lenis, sin build); independiente de la app, ver `landing/README.md` |
| `docs`, `*_TEST_CHECKLIST.md` | Documentación histórica; contrastar afirmaciones con implementación |
| `.next`, `desktop/dist`, `desktop/build-resources`, `desktop/dist-electron*` | Artefactos generados; no editar como fuente |
| `pgsql`, `desktop/vendor`, `node_modules` | Runtime/dependencias, fuera de cambios funcionales ordinarios |
| `backups`, `.env`, certificados, ZIP/XLSX locales | Datos/configuración sensibles; no publicar |

## Mapa por funcionalidad

| Cambio solicitado | Archivos/puntos de entrada |
| --- | --- |
| Login, sesión y cambio de tienda | `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/superadmin.ts`, `src/middleware.ts`, `src/app/api/auth/*`, `src/app/api/setup/*` |
| Pantalla de venta | `src/app/pos/page.tsx`, `src/components/pos/*`, `src/hooks/usePosShortcuts.ts`, `src/modules/pos/lib/*` |
| Cobro y validaciones finales | `src/app/api/sales/checkout/route.ts`, `src/lib/checkoutLock.ts`, `src/lib/sales/checkoutIdempotency.ts` |
| Anulación | `src/app/api/sales/[id]/cancel/route.ts` |
| Inventario/productos/precios | `src/app/inventory/page.tsx`, `src/components/inventory/*`, `src/app/api/products/*`, `inventory/*`, `store-products/*`, repositorios Prisma |
| Unidades y presentaciones | `src/lib/units/*`, `src/app/api/units/*`, `src/app/api/pos/units/*`, modelos Unit/UnitConversion/SellUnitPrice |
| Descuentos y promociones | `src/lib/promotions.ts`, `categoryPromotions.ts`, `volumePromotions.ts`, `nthPromotions.ts`, `coupons.ts`; rutas homónimas |
| Turnos/caja | `src/app/api/shifts/*`, `PrismaShiftRepository.ts`, `src/app/shifts/page.tsx` |
| Fiado/clientes | `src/app/api/customers/*`, `src/app/api/receivables/*`, checkout |
| Reportes/exportación | `src/app/api/reports/*`, `src/app/reports/page.tsx`, ExcelJS/CSV/ZIP |
| Farmacia | `batches`, `expiry-alerts`, `patients`, `controlled-book`, `rx-audit`, `drug-interactions`, `reports/pharma`; checkout y snapshots de SaleItem |
| Compras/proveedores | `src/app/api/purchase-orders/*`, `src/app/api/suppliers/*`, páginas homónimas |
| Servicios/órdenes de trabajo | `src/app/api/services/*`, `src/app/api/work-orders/*`, conversión a venta |
| Perfiles, licencias y funciones | `src/lib/businessProfiles.ts`, `featureFlags.ts`, `planCapabilities.ts`, `subscriptionStatus.ts`, `operationalLimits.ts`, administración |
| Comprobantes electrónicos | `src/domain/sunat/*`, `src/lib/sunat/*`, `src/app/api/sunat/*`, `src/worker/sunatWorker.ts` |
| Ticket/impresión | `src/app/receipt/[id]/page.tsx`, `src/app/api/print/sale/[saleId]/route.ts`, `desktop/src/printing/*`, `print-service` |
| Catálogo público | `/c/[slug]`, `src/modules/catalog/*`, `src/app/api/catalog/*`, rutas desktop de publicación |
| Backups | `desktop/src/backupScheduler.ts`, `desktop/src/sync/cloudBackupSync.ts`, `src/app/api/cloud-backups/*`, `src/lib/s3Client.ts` |
| Arranque/instalador | `desktop/src/main.ts`, `server.ts`, `runtime/postgres/*`, `updater/*`, `desktop/scripts/*`, ambos package.json |

## Modelo de datos e invariantes

- `Store` es el límite de aislamiento. Identificadores recibidos del cliente no
  prueban pertenencia: verificar `storeId` en cada entidad relacionada.
- `User` pertenece a tienda; el dominio de sesión contempla SUPERADMIN y una
  tienda nula para configuración. No pasar ese null directamente a consultas de
  un flujo que requiere tienda. La autorización superadmin también usa email en
  `SUPERADMIN_EMAILS`; hay caminos con políticas distintas.
- `ProductMaster` contiene descripción/globalización; `StoreProduct` contiene
  precio, costo, stock y configuración por tienda. No confundir sus IDs.
- `Sale`/`SaleItem` conservan snapshots de nombre, precio, costo, unidades,
  descuentos, datos farmacéuticos y lotes. `quantity` de producto vendido se
  guarda en unidad base; la presentación puede conservarse en `quantityOriginal`.
- `Movement` registra entradas/salidas/ajustes; `ProductBatch` mantiene existencias
  por lote. Stock general, lotes y movimientos deben variar coherentemente.
- Turnos: `Shift`; fiado: `Customer`, `Receivable`, `ReceivablePayment`.
- Compras: `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`.
- Farmacia: `Patient`, `PatientMedication`, `ControlledBookEntry`,
  `DrugInteraction`, `DrugInteractionLog`.
- Fiscal: `SunatSettings`, `ElectronicDocument`, `SunatJob`.
- El esquema usa Decimal, pero muchos cálculos pasan por `number`. Revisar
  redondeo y descuento global al cambiar dinero o reportes.
- `Sale` tiene correlativo único por tienda; checkout reintenta colisiones.
  No confundir este mecanismo con un bloqueo general de inventario.
- Las salidas de inventario no deben volver a escribirse como valores absolutos
  calculados desde una lectura anterior. Checkout y ajustes manuales comparten
  `src/lib/inventory/stockMutations.ts`, que aplica deltas condicionados por
  tienda, estado activo y existencia suficiente.
- El stock general y los lotes FEFO se consumen dentro de la transacción del
  checkout. Un conflicto revierte venta, items, movimientos y stock. El ajuste
  manual también registra su `Movement` dentro de la misma transacción.
- `stock = null` identifica productos sin control de existencias y debe
  conservarse; no convertirlo implícitamente en cero durante una venta.
- La anulación actual se identifica poniendo total/subtotal/impuesto a cero,
  sin un estado explícito de venta. Los reportes suelen excluir `total <= 0`.

## Flujos principales

### Autenticación y configuración

Login busca primero usuario local y valida activo/contraseña. Si no existe,
puede autenticar usando cloud o configuración de superadmin. Se guarda sesión
cifrada durante siete días. El middleware excluye `/api`: cada ruta necesita sus
propios controles. Provisioning permite crear la primera tienda cuando no hay
usuarios. En `feature/sunat-beta`, `setup/switch-store` exige SUPERADMIN, tienda
activa y OWNER activo perteneciente a esa tienda. La prueba aislada H01 cubre
los roles y cruces de tienda que deben seguir rechazándose.

### Checkout

`pos/page.tsx` construye carrito y previsualiza descuentos. El servidor comprueba
tienda/usuario, pago y turno, y dentro de una transacción carga productos,
normaliza unidades, valida stock, calcula promociones/cupones/descuentos, asigna
lotes FEFO, crea venta/items/movimientos, actualiza stock y registra fiado.
El lock por cajero evita dos ejecuciones simultáneas dentro del proceso. Además,
cada intento conserva una clave estable y deriva un `Sale.id` determinista por
tienda, usuario y clave; el hash canónico del cuerpo queda en `paymentDetails`.
La restricción primaria de la venta resuelve de forma atómica reintentos entre
procesos o después de reiniciar: el mismo cuerpo recupera la venta y un cuerpo
distinto con la misma clave responde conflicto. El replay ocurre solo después de
revalidar sesión, tienda, usuario y rol.
Con unidad de venta distinta de la base (caja, rollo, centímetro), el POS envía
la cantidad en esa unidad y el precio base. Checkout valida decimales con la
unidad elegida (una caja no se fracciona aunque el metro admita decimales) y
deja el control de existencias al descuento ya convertido. Con precio por
presentación, `unitSunatCodeUsed` guarda la unidad vendida y
`src/lib/sunat/saleLineQuantity.ts` informa a SUNAT `1 rollo × S/200` en vez de
`100 m × precio base`; ticket y recibo muestran lo mismo. Ver
`npm run test:ferreteria:isolated`, que cobra 13 casos contra PostgreSQL real.
La información de pacientes y libro controlado se crea desde los `SaleItem`
persistidos dentro de la misma transacción. El comprobante SUNAT se solicita en
una petición posterior a la venta.

### Fiscal

Construcción de payload -> XML UBL -> firma -> ZIP -> job -> SOAP -> CDR/estado.
En la rama `feature/sunat-beta`, Electron inicia `desktop/src/sunatProcessor.ts`,
que consulta cada diez segundos el endpoint local
`/api/sunat/jobs/process-pending`. El endpoint exige un token aleatorio generado
al arrancar el servidor local, procesa hasta tres trabajos por ciclo de tipo
`SEND_CPE`, `SEND_SUMMARY`, `QUERY_TICKET` o `LOCAL_CANCEL`, tanto BETA como PROD,
y usa el lock/reintentos de `processSunatJob.ts`.

La representación impresa de facturas y boletas se genera bajo demanda en
`/api/sunat/documents/[id]/download?type=pdf`. Usa el snapshot del documento y
de la venta, incorpora el QR fiscal, hash, estado y una marca visible cuando el
ambiente es BETA. El texto QR se persiste al firmar nuevas emisiones; para los
documentos anteriores se reconstruye al descargar sin reservar otro correlativo.
El listado de ventas expone PDF junto a XML y CDR.

El ticket de la venta también es la representación impresa cuando existe boleta o
factura vigente. `src/lib/sunat/printedTicket.ts` arma `fiscalTicket` (emisor
desde `SunatSettings`, comprobante, cliente, operación gravada, IGV, total, importe
en letras, QR, hash, leyenda y marca BETA) y `/api/sales/[id]` lo devuelve. Lo
consumen el formateador ESC/POS de Electron (`desktop/src/printing/escpos`) y
`/receipt/[id]`. Las notas y los comprobantes rechazados, con error o anulados no
se imprimen como comprobante. `npm run test:ticket:isolated` valida 80 y 58 mm.
El ticket fiscal usa diseño compacto (interlineado 26, QR de módulo 3 y sin hash
aparte: el QR ya lo contiene). El formateador del `print-service` web todavía no
incluye este bloque.

Las boletas pueden emitirse a un cliente identificado o a `CLIENTES VARIOS`. En
el segundo caso se usa el tipo de documento SUNAT `0` y el número `-`; si el
importe supera S/ 700, el servidor exige identificar al cliente. El selector de
la caja y la emisión posterior desde Ventas comparten estas reglas. Los números
de DNI/RUC se normalizan como dígitos y los documentos alfanuméricos, como carnet
de extranjería o pasaporte, conservan sus letras.

La emisión principal reserva el correlativo mediante `SunatSettings`, genera UBL,
firma XMLDSig RSA-SHA256, verifica la firma y crea el job en una transacción. BETA
usa las credenciales oficiales de prueba y puede generar un PFX autofirmado por
tienda; al activar PROD se exige un certificado real y se rechaza el certificado
autofirmado de prueba. Los WSDL locales se copian al servidor standalone durante
`desktop/scripts/prepare-build.js`.

El instalador de esta rama usa `com.monterrial.pos.sunatbeta`, el nombre
`Monterrial POS SUNAT Beta`. Para las pruebas ejecutadas dentro del entorno aislado, mantiene
una base descartable propia en `.sunat-beta-runtime`; la base Beta anterior de
`Documents/MonterrialPOS-SUNAT-Beta` no se mueve ni se elimina. También usa
nombres propios para el servicio y la tarea de PostgreSQL. Puede convivir con la
aplicación principal sin reemplazar su acceso directo, `userData`, base embebida,
imágenes ni respaldos locales.

El paquete desktop no contiene credenciales de Supabase. `prepare-build.js` genera
un `.env` público con solamente `CLOUD_URL`; cuando un usuario no existe en la base
local, el login valida OWNER/SUPERADMIN contra `/api/auth/login` por HTTPS. No volver
a empaquetar `CLOUD_DATABASE_URL`, `LICENSE_API_KEY` ni el `.env` completo.

Los backups desktop nuevos incluyen `fiscalArchive` dentro de `data.json`, cubierto
por el checksum general del ZIP. Contiene documentos, XML firmado, CDR, estados y
correlativos, pero excluye credenciales SOL y certificado privado. Esto permite que
el archivo fiscal acompañe tanto al respaldo local como a su copia en la nube y se
recupere en otra instalación. La restauración conserva el mayor correlativo entre
el destino y el respaldo y deja SUNAT desactivado. Se mantiene lectura compatible
del sidecar `.sunat-fiscal` cifrado usado por builds Beta anteriores.

### Respaldo completo por tienda (formato 1.1, 2026-10-27)

- `/api/backups/export` genera `metadata.version = '1.1'` y agrega a `data.json`
  `units`, `categories`, `unitConversions`, `sellUnitPrices`, `productBatches`,
  `services`, `suppliers`, `purchaseOrders` e `items`, `workOrders` e `items`,
  `patients`, `patientMedications`, `controlledBookEntries`,
  `drugInteractionLogs`, `promotions`, `coupons`, `categoryPromotions`,
  `volumePromotions`, `nthPromotions`, `operationalLimit` y `catalogSettings`.
  El respaldo programado de Electron rotula sus ZIP con la misma versión.
- `restore/new-store` acepta `1.0` y `1.1`. Traduce unidades por `code` y crea
  solo las ausentes, sin modificar las existentes. Toda referencia a una sección
  presente debe resolverse o se revierte la transacción completa. El catálogo
  público vuelve deshabilitado y sin `storeSlug`.
- Al agregar un modelo con `storeId`, incluirlo en exportación, restauración y
  `scripts/test-backup-roundtrip-isolated.ts`. `npm run test:backups:roundtrip`
  usa PostgreSQL desechable con dos bases y compara 34 modelos campo por campo;
  `scripts/fixtures/backup-v1.0-sintetico.zip` cubre la compatibilidad `1.0`.
- El ZIP contiene datos sanitarios de pacientes y no está cifrado; tratarlo
  como información sensible. Exclusiones deliberadas: auditoría, jobs SUNAT,
  colas de catálogo, pagos de suscripción e interacciones globales.
- `.gitignore` contiene `backups`, que también coincide con
  `src/app/api/backups`. Esos archivos están versionados: usar `git add -f`.

El panel `/admin/stores` permite a SUPERADMIN seleccionar un ZIP y restaurarlo
mediante `/api/backups/restore/new-store`. El endpoint valida extensión/tamaño,
estructura, versión, checksum general y conteos antes de abrir una transacción.
Recrea configuración, usuarios con claves temporales nuevas, productos, stock,
clientes, turnos, ventas con sus snapshots, movimientos, fiados/pagos y el archivo
fiscal. Si falta una relación requerida, revierte toda la importación. La tienda
resultante queda `ARCHIVED` y SUNAT desactivado; las claves temporales se muestran
una sola vez para que el administrador las guarde antes de cerrar el resultado.
El respaldo de Valky del 10/10/2026 pasó auditoría de ZIP/XML/CDR/correlativos y
una ejecución exacta del endpoint con Prisma simulado: 224 productos, 16 ventas,
16 detalles, 18 movimientos, un cliente, un fiado y 12 documentos fiscales.

Los respaldos generados desde el 11/10/2026 incluyen también la suscripción y
los `FeatureFlag` de la tienda. Al restaurarlos se conservan el plan y sus
permisos, mientras que los ZIP anteriores siguen siendo compatibles y quedan sin
plan hasta que un SUPERADMIN lo asigne desde `/admin/billing`. Esto evita conceder
funciones comerciales por inferencia al recuperar un respaldo antiguo.

La restauración permite tres intentos por minuto por SUPERADMIN autenticado e IP;
no debe volver a bloquear el segundo intento después de un fallo aislado. La
transacción admite hasta 120 segundos para respaldos grandes. Al reutilizar el
catálogo maestro compara tanto código de barras como SKU interno y detiene toda la
transacción si ambos identificadores apuntan a productos distintos. `Store.name`
no es único, por lo que una tienda activa con el mismo nombre original no causa
por sí sola un fallo de restauración.

Estado verificado al 10/10/2026: el ZIP de Valky completó una restauración en la
base PostgreSQL Beta real como tienda archivada, sin modificar las tiendas activas.
La interfaz confirmó 224 productos, 16 ventas y 12 comprobantes fiscales, y creó
credenciales temporales de un solo uso para el OWNER restaurado. El diagnóstico
previo había ubicado el fallo en `Request.formData()` del servidor standalone,
antes de leer el ZIP. El panel desktop envía ahora el archivo como cuerpo binario
`application/zip`; la ruta conserva compatibilidad con pantallas anteriores mediante
un lector multipart binario propio, sin invocar el parser inestable del runtime, y
separa las fases de transporte, apertura del ZIP, manifiestos, JSON, estructura y
checksum. La prueba aislada pasó con el mismo ZIP tanto en transporte binario como
en `multipart/form-data`. Los fallos iniciados
por un SUPERADMIN de nube se auditan con `userId` nulo cuando ese identificador no
existe en la base local; así se evita violar la FK de `AuditLog`. La resolución
de ese usuario es tolerante y no puede convertir un `COMMIT` correcto en un error
de restauración por una falla secundaria de auditoría. La prueba real confirmó el
flujo completo desde el panel SUPERADMIN y la aparición de la copia archivada.
La acción `Ver tienda archivada` cierra el resultado de restauración, desplaza la
tabla hasta la copia creada y la resalta temporalmente.

En esta rama, `/api/admin/stores` y las acciones de archivar/reactivar autorizan al
administrador cuando la sesión firmada tiene rol `SUPERADMIN`, además de conservar
`SUPERADMIN_EMAILS` como mecanismo heredado. Esto permite que el administrador
validado por el servicio cloud use todo el panel sin empaquetar su correo ni otros
secretos en el ejecutable. El botón superior del panel cierra la sesión y vuelve al
login; navegar simplemente a `/` devolvería al SUPERADMIN al mismo panel porque no
tiene una tienda operativa asignada.

Cada restauración crea usuarios nuevos con correos únicos; las credenciales del
OWNER original siguen apuntando a la tienda original, incluso después de archivarla.
El panel muestra el correo OWNER de cada fila y ofrece `Acceso OWNER`, que regenera
una contraseña temporal para la tienda seleccionada y la enseña una sola vez. Las
rutas de administración del OWNER aceptan la sesión firmada con rol `SUPERADMIN`.
El login local verifica el estado de la tienda después de validar la contraseña y
rechaza una cuenta vinculada a una tienda `ARCHIVED`, eliminando cualquier sesión
anterior. La pantalla SUNAT archivada permite cerrar sesión de forma directa.

En los builds desktop de esta rama, `next.config.ts` fija
`NEXT_PUBLIC_ENABLE_SUNAT=true` durante la compilación para mostrar la sección de
facturación electrónica en `/settings`. La disponibilidad efectiva y los permisos
siguen verificándose en los endpoints del servidor; esto no activa producción ni
incluye credenciales en el paquete.

La activación SUNAT exige una suscripción cuyo plan incluya `ENABLE_SUNAT`
(`DEMO` o `BUSINESS`). Si el plan lo permite, la operación actualiza
`SunatSettings` y reconstruye el `FeatureFlag` dentro de la misma transacción;
después invalida la caché de permisos. El panel de tiendas muestra el plan o
`Sin plan`, con acceso a `/admin/billing`, y su tabla usa anchos controlados y
desplazamiento horizontal para conservar las acciones en ventanas estrechas.
Las rutas de planes, suscripciones y pagos aceptan tanto la lista administrativa
local como una sesión autenticada con rol de nube `SUPERADMIN`. El estado del
asistente muestra SUNAT activo solo cuando también existe un plan compatible y
vuelve a consultar el servidor después de una activación rechazada.

Los módulos nativos `usb` y `@serialport` deben permanecer en `asarUnpack`; Electron
no puede cargar sus archivos `.node` directamente desde `app.asar`.

En Windows afectado por `STATUS_BREAKPOINT (0x80000003)`, la Beta se inicia mediante
`Abrir Monterrial POS SUNAT Beta.cmd`. El lanzador autorizado usa `--no-sandbox`,
desactiva GPU, asigna el perfil aislado
`.sunat-beta-runtime/electron-profile` dentro del worktree aislado y pasa
`--sunat-beta-isolated` para poder probar junto al POS instalado. El arranque normal mantiene
el bloqueo de instancia única. `extraFiles` lo incluye junto al
ejecutable; esta excepción no debe aplicarse al producto principal.

La base y el log de esta ejecución Beta usan `.sunat-beta-runtime` dentro del worktree aislado;
la carpeta está ignorada por Git y hereda los permisos de baja integridad requeridos por el
entorno de prueba. Es una base
vacía y descartable para pruebas; no debe tratarse como almacenamiento definitivo ni incluir
datos reales de clientes.

### Estado SUNAT de la rama Beta (12/10/2026)

- Facturas, boletas, notas de crédito y notas de débito generan UBL, se firman,
  se verifican localmente y se encolan sin bloquear la venta. La representación
  impresa PDF incluye QR, hash, datos del cliente, referencia de notas y marca
  BETA cuando corresponde. Se descarga desde Ventas o `/sunat/documents`.
- Las boletas aceptan DNI, CE, pasaporte o consumidor final (`OTHER`, número
  `-`, nombre `CLIENTES VARIOS`). Por encima de S/ 700 se exige identificación.
- `src/app/api/sunat/notes/route.ts` crea NC/ND contra un comprobante aceptado.
  Una NC total puede programar `LOCAL_CANCEL`; solo después del CDR aceptado se
  revierte la venta, el cupón, el fiado, el stock general y los lotes FEFO.
  La cancelación local directa rechaza ventas que ya tienen un comprobante
  fiscal vigente.
- El Resumen Diario se crea desde `/sunat/documents`, reserva exactamente sus
  boletas y usa `SEND_SUMMARY` seguido de `QUERY_TICKET`. La Comunicación de Baja
  usa el mismo flujo para facturas y notas; las boletas se corrigen mediante
  Resumen Diario o nota de crédito según el caso.
- Los nombres e IDs de lotes usan los prefijos fijos exigidos por SUNAT: `RC`
  para Resumen Diario y `RA` para Comunicación de Baja. El worker reconstruye
  y vuelve a firmar lotes antiguos `RC01`/`RA01` solo cuando no existe ticket,
  conservando fecha, correlativo y documentos de origen.
- El worker también repara NC/ND antiguas que no incluyen `AddressTypeCode`, pero
  únicamente si pertenecen a una tienda activa y todavía no tienen CDR ni ticket.
  Conserva fecha y correlativo, vuelve a firmar el XML y reinicia el intento. Los
  endpoints de cola y reintento rechazan documentos de tiendas archivadas.
- Electron consulta la cola cada diez segundos. Sin conexión, el endpoint deja
  los trabajos intactos. En PROD, un reintento de factura o nota consulta primero
  `getStatusCdr`; si no puede reconciliar el intento anterior, no reenvía a
  ciegas. Los locks y las transacciones evitan que dos workers completen el mismo
  trabajo o reserven dos veces un resumen.
- Credenciales SOL y certificado de PROD se cargan exclusivamente desde
  `SunatSettings` de la tienda. BETA usa MODDATOS y puede generar un certificado
  de prueba. Volver desde una restauración deja SUNAT desactivado y obliga a
  revisar credenciales y certificado antes de emitir.
- El cambio a PRODUCCIÓN pasa por un control único reutilizado por onboarding y
  `/api/sunat/settings/environment`. Exige RUC peruano con dígito verificador,
  razón social y dirección, credenciales SOL propias (rechaza `MODDATOS`), PFX
  vigente no autofirmado, clave RSA de al menos 2048 bits, clave privada
  coincidente, RUC del certificado igual al de la tienda y una prueba de firma
  completada con el certificado actual. También exige escribir
  `ACTIVAR PRODUCCION`; SUPERADMIN no omite estos controles.
- Cada ZIP nuevo incluye `fiscalArchive` dentro de `data.json` y lo protege el
  checksum general del respaldo, por lo que también viaja con la copia cloud.
  Contiene XML, CDR, respuestas, relaciones y correlativos, pero no contiene
  contraseña SOL, certificado privado, contraseña del certificado ni jobs. Al
  restaurar como nueva tienda, los documentos se enlazan por número de venta,
  los correlativos conservan el máximo y SUNAT queda desactivado. El desktop
  mantiene lectura de los sidecars `.sunat-fiscal` de builds Beta anteriores.

Comprobación local disponible: `npm run sunat:test:local`. Cubre generación,
firma y verificación de factura, boleta identificada, consumidor final, NC, ND,
Resumen Diario, Comunicación de Baja, nombres SUNAT, PDF con QR y el rechazo en
PROD de `MODDATOS` y del certificado autofirmado BETA. No sustituye
una homologación ni una emisión controlada en PROD con certificado y SOL reales.

### Criterio para pasar de BETA a PRODUCCIÓN

El circuito BETA está funcional, pero no debe describirse como listo para uso
fiscal real solamente por reemplazar los datos de prueba. Antes de habilitar una
tienda en PRODUCCIÓN deben completarse y comprobarse todos estos puntos:

1. Registrar el RUC, razón social y dirección fiscal reales de la empresa.
2. Cargar el certificado digital real `.pfx` o `.p12` y su contraseña. Debe estar
   vigente, contener clave privada, coincidir con el RUC y no ser autofirmado.
3. Configurar un usuario SOL secundario autorizado para emisión electrónica y su
   clave. No usar `MODDATOS`, credenciales BETA ni la cuenta personal principal.
4. Completar `Test Firma`, seleccionar PRODUCCIÓN y escribir la confirmación
   explícita exigida por la interfaz. Los controles también se repiten en servidor.
5. Emitir primero comprobantes controlados de importe pequeño: una factura y una
   boleta; después emitir una nota de crédito asociada. No hacer una emisión masiva.
6. Confirmar en cada caso estado `ACEPTADO`, respuesta código `0`, XML descargable,
   CDR guardado y representación PDF con QR. Revisar también el efecto local de la
   nota sobre venta, inventario, cupón y fiado cuando corresponda.
7. Verificar que la validación XSD local continúe pasando para factura, boleta,
   nota de crédito, nota de débito, Resumen Diario y Comunicación de Baja. Desde
   el 18/10/2026 el worker falla antes de comprimir o enviar cuando el XML firmado
   no satisface los esquemas empaquetados.
8. Hacer un respaldo posterior y verificar que conserva documentos, CDR y
   correlativos sin incluir certificado privado, claves SOL ni contraseñas.

Los documentos aceptados en BETA demuestran el flujo técnico, pero no tienen valor
fiscal de PRODUCCIÓN. Desde el 27/10/2026 (plan
`docs/plans/2026-10-27-impuestos-exonerados-icbper.md`) el modelo cubre operaciones
gravadas al 18 %, exoneradas (20/9997), inafectas (30/9998) e ICBPER por bolsa
(7152) en checkout, factura, boleta, notas y Resumen Diario; el cálculo de líneas
vive en `src/lib/sunat/saleTaxLines.ts` y los tributos UBL en
`src/lib/sunat/ubl/taxes.ts`. Siguen fuera de alcance operaciones gratuitas, ISC
y exportación. Las afectaciones nuevas requieren todavía su envío controlado a
SUNAT BETA. Si la tienda trabaja exclusivamente con productos gravados al 18 %, la
validación XSD ya está cubierta; la salida puede considerarse lista después de
superar la prueba controlada real descrita arriba.

Nunca copiar a este archivo, commits, capturas o logs el certificado, sus
contraseñas, el usuario/clave SOL ni otros secretos de la empresa.

El archivo temporal `--pwfile` de `initdb` también se crea dentro de `logs` en ese runtime y se
elimina en `finally`; no usa `%TEMP%`, que está bloqueado para el proceso de baja integridad.

El inicio de PostgreSQL ejecuta `pg_ctl` con `stdio: ignore`: en Windows, canalizar su salida
puede dejar a Electron esperando indefinidamente porque el proceso `postgres` hereda los handles,
aunque la base ya esté lista. Los detalles del servidor se conservan en el archivo indicado por
`pg_ctl -l`. La limpieza previa solo termina el PID registrado por este clúster y no debe usar
`taskkill /IM postgres.exe`, pues podría cerrar otras instalaciones PostgreSQL del equipo.

Para equipos donde Windows no ejecuta `.cmd` o `.lnk`, `desktop/launcher/SunatBetaLauncher.cs`
genera `Iniciar Monterrial POS SUNAT Beta.exe`, un lanzador gráfico que aplica los mismos
argumentos sin depender de asociaciones de scripts. `prepare-build.js` lo compila con el
compilador C# de Windows y `extraFiles` lo coloca junto a la aplicación. Desde el Escritorio,
el lanzador selecciona la salida `dist-electron*` más reciente para soportar el directorio de
reintento que genera el empaquetador cuando una versión anterior sigue abierta.
El perfil aislado conserva un bloqueo de instancia propio: puede ejecutarse junto al POS
instalado, pero un segundo clic sobre el lanzador BETA enfoca la ventana existente en vez de
arrancar otro renderer y otro servidor sobre la misma base portable. Los errores graves del
renderer de esa variante se guardan, sin consola general ni datos de negocio, en
`renderer-errors.log` dentro de su `userData` aislado.
El proceso principal aplica ese `userData` con `app.setPath` antes de solicitar el bloqueo;
el argumento Chromium `--user-data-dir` por sí solo no aísla de forma fiable el bloqueo de
Electron. Si una segunda ejecución termina con código 0, el lanzador lo considera un cierre
normal y no muestra un error falso.
La variante empaquetada genera un `.env` público dentro de `resources` con una
sola clave: `CLOUD_URL`. No copia URLs de base de datos, claves API, certificados
ni credenciales. `ENABLE_SUNAT=true` se fija en el servidor desktop BETA.

Límites comprobados: los precios son finales; gravado incluye IGV, exonerado e
inafecto no, y el ICBPER se suma aparte. No hay soporte para operaciones
gratuitas ni ISC. La prueba local cubre UBL, firma, ZIP y CDR,
y ya se verificaron emisiones controladas contra SUNAT BETA de facturas, boletas,
notas y resúmenes. Los seis formatos se validan además con XSD antes de salir a la
red. Antes de producción todavía se requiere una prueba controlada con certificado
y credenciales SOL reales.

### Escritorio y persistencia

Electron inicia/asegura PostgreSQL, aplica esquema, arranca Next standalone en
`127.0.0.1` con puerto libre entre 43110 y 43200 y expone funciones por preload/IPC.
Recursos de aplicación y datos persistentes son cosas diferentes. Se usan
`app.getPath('userData')` y `Documents/MonterrialPOS`; revisar `pgPaths.ts` y
`ensurePostgres.ts` para el directorio exacto según instalación. No borrar datos
al limpiar distribuciones. El proceso Next se lanza detached.

La preparación copia `.next/standalone`, estáticos, public, Prisma y actualmente
también `.env`. Esto último es un hallazgo crítico. PostgreSQL empaquetado no
convierte el PWA web en un POS offline: `public/sw.js` no almacena llamadas API.

## Comandos y comprobaciones

| Comando | Uso y precaución |
| --- | --- |
| `npm run dev` | Servidor web de desarrollo |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | Tipos web; actualmente falla con 349 diagnósticos |
| `npm run lint` | Actualmente falla por configuración de reglas y problemas de código |
| `node node_modules/prisma/build/index.js validate` | Valida esquema sin migrar datos; pasó |
| `node node_modules/typescript/bin/tsc -p desktop/tsconfig.json --noEmit --incremental false` | Tipos Electron; pasó |
| `node node_modules/typescript/bin/tsc -p print-service/tsconfig.json --noEmit --incremental false` | Tipos impresión; pasó |
| `node scripts/audit-pos-isolated.cjs` | Pruebas aisladas H01, H03, H06/H07, H08, H09, H10, H11 y H14-H18 con dependencias simuladas; pasaron el 20/10/2026 |
| `npm run test:backups:isolated` | Prueba el ciclo programado de todas las tiendas activas, autenticación interna, ZIP, checksum, archivo fiscal, persistencia tras reinicio y fallo visible; no usa base real |
| `npm run build:only` | Genera cliente Prisma y compila web sin `db push`; pasó con 207 páginas en `feature/sunat-beta` el 20/10/2026 |
| `node scripts/test-backup-restore-isolated.cjs <zip> [--multipart]` | Ejecuta el endpoint de restauración contra Prisma simulado en transporte ZIP crudo o multipart; no escribe una base real |
| `npm run sunat:test:local` | Prueba aislada: certificado BETA, UBL, firma/verificación, ZIP y CDR; no usa base ni red |
| `npm run build` | Delega a `build:only`; compila sin desplegar ni modificar el esquema |
| `npm run desktop:build` | Standalone + preparación + tsc + empaquetado Windows |
| `npm run desktop:portable` | Empaquetado en directorio (`--dir`), no instalador portable de un solo EXE |
| `npm run db:migrate:deploy` | Aplica migraciones versionadas; una base legada exige primero la adopción verificada descrita en H04 |

No existe script `test` principal. Hay listas manuales y scripts de integración
que pueden crear/modificar datos o comunicarse con SUNAT. Leerlos antes de usarlos.
No ejecutar `db:reset`, `force-reset`, semillas, importaciones o restauración en
una base real como comprobación rutinaria.

## Estado y prioridades pendientes

### Validación XSD y empaquetado SUNAT (2026-10-18)

- `src/lib/sunat/validation/xsdValidation.ts` valida el XML ya firmado antes de
  crear el ZIP o abrir una conexión. Cubre `FACTURA`, `BOLETA`, `NOTA_CREDITO`,
  `NOTA_DEBITO`, `SUMMARY` y `VOIDED`; un formato desconocido o un fallo interno
  del validador bloquea el envío y deja evidencia en el job.
- Los esquemas están versionados en `src/lib/sunat/xsd`: UBL 2.1 de OASIS para
  facturas y notas, y los esquemas UBL/SUNAT 2.0 requeridos por Resumen Diario y
  Comunicación de Baja. Su procedencia y límites están en
  `src/lib/sunat/xsd/README.md`.
- `xmllint-wasm` se conserva como paquete Node externo porque abre
  `xmllint-node.js` como worker y carga `xmllint.wasm` en tiempo de ejecución.
  `desktop/scripts/prepare-build.js` copia el paquete completo y los 34 XSD al
  servidor del portable; no dependerá de internet para validar.
- `npm run sunat:test:local` pasó el 18/10/2026 e incluye los seis formatos y un
  XML inválido que debe ser rechazado. `npm run build:only` también pasó; no se
  ejecutó `prisma db push` ni se modificó una base real.
- Portable de validación generado en
  `desktop/dist-electron/win-unpacked/Iniciar Monterrial POS SUNAT Beta.exe`,
  Build ID `2026-10-19T02:43:00.665Z`. Se comprobó que contiene los 34 XSD, el
  binario `xmllint.wasm`, el worker Node y solamente `CLOUD_URL` como clave del
  entorno público. Esta salida reemplaza al portable del 12/10/2026 para las
  pruebas de la rama Beta.
- Los descargadores, la prueba de autenticación y los actualizadores auxiliares
  ya no contienen credenciales incrustadas: exigen `SUNAT_RUC`,
  `SUNAT_SOL_USER` y `SUNAT_SOL_PASS` en el entorno. Si alguna credencial válida
  estuvo versionada antes de esta corrección, debe rotarse aunque ya no aparezca
  en los archivos actuales.
- La validación estructural no comprueba importes: un XML con impuestos mal
  calculados pasa el XSD. `npm run test:sunat:taxes` y `test:checkout:taxes`
  verifican el contenido. Siguen fuera de alcance operaciones gratuitas e ISC.
- Para cerrar la salida a PRODUCCIÓN falta la emisión controlada con RUC, SOL y
  certificado reales: factura, boleta y nota asociada aceptadas, con CDR y PDF.

### Recepción segura de órdenes de compra (2026-10-19)

- La recepción valida que cada producto activo pertenezca a la tienda y que cada
  item pertenezca a la orden. Rechaza cantidades no positivas, con más de dos
  decimales o superiores a la cantidad pendiente.
- El lote se resuelve dentro de cada item. Un item sin lote ya no puede heredar
  el lote creado para otro producto de la misma recepción.
- La transición se ejecuta en una transacción serializable y reclama la versión
  observada de la orden antes de modificar stock. Dos recepciones simultáneas no
  pueden aplicar dos veces la misma cantidad pendiente.
- Cada intento de la interfaz conserva una clave de idempotencia. Los movimientos
  usan identificadores deterministas vinculados a esa clave; repetir exactamente
  una recepción confirmada devuelve el resultado previo sin duplicar existencias.
- `scripts/audit-pos-isolated.cjs` verifica tres casos: reintento exacto sin stock
  duplicado y sin fuga de lote, carrera concurrente con un solo ganador, y rechazo
  de sobre-recepción sin cambios parciales. Las pruebas pasaron el 19/10/2026.

### Trazabilidad farmacéutica transaccional (2026-10-19)

- El checkout crea `PatientMedication` y `ControlledBookEntry` dentro de la misma
  transacción que confirma la venta y modifica inventario. Un fallo de validación
  o escritura revierte el conjunto completo.
- Paciente y dispensador deben estar activos y pertenecer a la tienda de la venta.
  Cuando el libro de control está habilitado, cada producto controlado exige un
  paciente y un número de receta antes de iniciar las escrituras.
- Los registros se derivan de los `SaleItem` persistidos y usan identificadores
  deterministas por item. Un reintento exacto no duplica historial ni libro.
- Se eliminaron la tarea posterior sin `await` y el fallback duplicado del POS.
  La ruta heredada de medicación queda solo para compatibilidad y vuelve a validar
  tenant, paciente y venta usando los items persistidos.
- `scripts/audit-pos-isolated.cjs` cubre rechazo de paciente ajeno, receta ausente,
  creación correcta y repetición idempotente. La auditoría y `build:only` pasaron
  el 19/10/2026 sin ejecutar migraciones ni escribir una base real.

### Mutaciones atómicas de inventario (2026-10-19)

- Checkout ya no vuelve a escribir el stock general ni los lotes FEFO con un
  valor absoluto calculado desde una lectura anterior. Usa decrementos
  condicionales dentro de la transacción y rechaza el checkout completo si otra
  operación dejó existencias insuficientes.
- La ruta de ajuste manual aplica el delta de stock y crea el movimiento dentro
  de una misma transacción. Una venta o un segundo ajuste concurrente no puede
  ser sobrescrito por una asignación obsoleta.
- `scripts/audit-pos-isolated.cjs` cubre cinco invariantes H14: conservar una
  recepción concurrente, impedir dos ventas sobre el mismo saldo, preservar un
  ajuste concurrente con una venta, impedir sobreconsumo de lote y no tocar
  productos sin control de stock. Todas pasaron el 19/10/2026.
- `npx next build` compiló esta implementación y generó 206 páginas. H05 cerró
  posteriormente los diagnósticos TypeScript y volvió a activar tipos y lint
  como controles obligatorios de `build:only`.

### Resumen de reportes consistente (2026-10-19)

- `src/app/api/reports/summary/route.ts` obtiene promociones generales, de
  categoría, de volumen y n-ésimo desde el mismo conjunto de ventas. Ese conjunto
  siempre pertenece a la tienda activa, excluye ventas anuladas y usa el mismo
  rango inclusivo de fechas.
- Para un `CASHIER`, todos esos totales se limitan a sus propias ventas. Para un
  `OWNER`, el resumen conserva el alcance de toda la tienda. Una sesión sin tienda
  recibe `STORE_REQUIRED` y no puede ejecutar accidentalmente un reporte global.
- La prueba aislada H15 verifica ambos roles, los límites de fecha, la exclusión
  de ventas con total cero y los tres descuentos especializados. Pasó el
  19/10/2026 junto con el resto de invariantes del script de auditoría.

### Secreto de sesión por instalación (2026-10-19)

- Web, middleware y las rutas heredadas de turnos usan
  `src/lib/sessionConfig.ts`; no existe una contraseña pública de reserva. Un
  proceso web sin `SESSION_SECRET` de al menos 32 caracteres falla cerrado.
- En el desktop empaquetado, `desktop/src/main.ts` genera un secreto aleatorio y
  lo persiste en `userData/app-secrets.json`. `desktop/src/server.ts` conserva ese
  valor después de cargar el entorno del paquete, de modo que el `.env` público
  no puede reemplazarlo. Un fallo al persistirlo detiene el arranque.
- Las rutas de turnos rechazan sesiones sin tienda con `STORE_REQUIRED` antes de
  consultar o modificar caja. Rotar el secreto invalida las sesiones existentes
  y obliga a iniciar sesión nuevamente.
- La prueba aislada H16, TypeScript de Electron y la comprobación TypeScript
  dirigida de los archivos web afectados pasaron el 19/10/2026.

### Autenticación interna y diagnóstico desktop (2026-10-20)

- `src/lib/desktopInternalAuth.ts` centraliza la validación de
  `x-desktop-internal-token`. Requiere el token efímero que Electron genera para
  cada arranque del servidor local y lo compara en tiempo constante.
- `/api/desktop/license`, `/api/sync/push` y el procesamiento interno de trabajos
  SUNAT ya no confían en `x-desktop-app: true`. El token se propaga por arranque
  normal, estado rápido, rearranque del servidor, licencia, sincronización cloud
  y `desktop/src/taskQueue.ts`; nunca se entrega al renderer.
- `/api/debug/catalog` queda inaccesible en producción. En desarrollo exige una
  sesión SUPERADMIN y sus fallos devuelven un mensaje genérico, sin stack ni
  detalles de base de datos.
- `scripts/audit-pos-isolated.cjs` prueba el rechazo del header anterior, la
  aceptación del token correcto, todos los caminos desktop anteriores y el
  cierre del diagnóstico. La suite aislada y TypeScript de Electron pasaron sin
  usar base real ni red.
- H17 quedó cerrado en la rama aislada y guardado en el commit `f8403d2b`.

### Apertura atómica y valores cero de turnos (2026-10-20)

- `PrismaShiftRepository.createIfNone` abre una transacción y obtiene un
  `pg_advisory_xact_lock` derivado de tienda y cajero antes de comprobar y crear
  el turno. Dos solicitudes simultáneas para el mismo cajero quedan serializadas:
  una crea el turno y la otra recibe conflicto, sin exigir una migración.
- La ruta `POST /api/shifts/open` usa esa única operación atómica. Ya no separa
  `hasOpenShift` de `create`, que era el intervalo donde podían crearse dos turnos.
- El mapeo de cierre e historial usa `?? null`; por ello caja de cierre,
  efectivo esperado y diferencia iguales a `0` se conservan como cero.
- La prueba H18 ejecuta dos aperturas concurrentes y comprueba un solo registro,
  respuesta `201/409`, caja inicial cero, cierre exacto e historial con ceros.
  Pasó junto con la suite aislada el 20/10/2026, sin base real ni red.
- H18 quedó cerrado en la rama aislada y guardado en el commit `7d769b25`.

### Navegación segura de Electron (2026-10-20)

- `desktop/src/security/navigationPolicy.ts` compara URL y servidor por origen
  completo: protocolo, host y puerto. Esto acepta el `127.0.0.1` y puerto
  dinámico que devuelve el servidor embebido, sin confiar en prefijos de texto.
- La navegación principal permite login, logout y redirecciones solo dentro del
  origen del servidor actualmente iniciado. Otro puerto, otro nombre de host o
  una URL inválida se bloquean.
- Las ventanas nuevas del mismo origen se permiten para la representación del
  ticket. Los enlaces HTTP(S) y `mailto:` externos se abren con el sistema; los
  protocolos restantes, incluidos `javascript:`, `data:` y `file:`, se bloquean.
- La prueba H19 cubre rutas internas, ticket, puerto diferente, `localhost`
  diferente del origen activo, un host de prefijo engañoso, URL inválida y
  protocolos externos o bloqueados. Pasó junto con toda la suite aislada y
  TypeScript de Electron el 20/10/2026, sin base real ni red.
- H19 queda cerrado y verificado. H20 también quedó cerrado el 20/10/2026.

### Migraciones reproducibles y adopción segura (2026-10-20)

- H04 quedó cerrado en la rama aislada. `prisma/migrations/20261020000000_baseline`
  contiene el esquema PostgreSQL completo y `migration_lock.toml` fija el
  proveedor. Una instalación vacía usa exclusivamente `prisma migrate deploy`.
- El inicio desktop ya no ejecuta los parches SQL heredados ni cae a
  `prisma db push --accept-data-loss`. Si faltan migraciones versionadas, se
  detiene antes de modificar la base.
- Una instalación antigua sin historial solo puede adoptar la migración base
  después de que `prisma migrate diff --exit-code` confirme que su esquema
  coincide exactamente. Si existe cualquier diferencia, no se marca la
  migración y se exige respaldo y una migración de compatibilidad explícita.
- La comparación usa `prisma/baseline/schema.prisma`, copia fija del datamodel
  de la línea base; luego `migrate deploy` aplica las migraciones posteriores.
  No editar esa copia. Todo cambio de esquema va en `prisma/schema.prisma` con
  una migración nueva generada con `prisma migrate diff`, solo aditiva
  (auditoría H04 rechaza `DROP`, `RENAME`, cambios de tipo y borrados). Primera
  migración posterior: `20261027000000_tax_affectations` (afectación IGV e
  ICBPER).
- `npm run build` ahora delega a `build:only`; compilar no despliega ni cambia el
  esquema de la base configurada.
- `npm run test:migrations:isolated` inicia el PostgreSQL incluido en una carpeta
  temporal y verificó: instalación limpia de 45 tablas, adopción exacta de una
  base legada y rechazo de una base con deriva. La prueba elimina su entorno al
  finalizar y no usa Supabase ni una base del usuario.
- El auditor general comprueba estáticamente que no reaparezcan `db push`,
  `--accept-data-loss` o la ejecución de los parches heredados. H03 quedó
  cerrado después de este punto; el siguiente frente de código es H05.

### Respaldo automático programado y visible (2026-10-20)

- H03 quedó cerrado en la rama aislada. Electron obtiene todas las tiendas
  activas desde `/api/desktop/backup-context` y autentica esa consulta y cada
  exportación con el token efímero del servidor local. El flujo web conserva
  sesión, rol y límite de solicitudes.
- El ciclo diario respalda cada tienda activa, evita dos ejecuciones programadas
  simultáneas y reintenta después de un fallo. El ZIP debe contener el archivo
  fiscal y mantiene el checksum que valida el restaurador.
- `backup-status.json`, dentro de `userData`, conserva último intento, último
  éxito, próxima ejecución, archivos y error aun después de reiniciar Electron.
  Configuración > Respaldos presenta ese estado, permite ejecutar el ciclo en el
  momento y abre la carpeta de copias.
- `npm run test:backups:isolated` verificó dos tiendas, autenticación, ZIP,
  checksum, archivo fiscal, reinicio y error visible. El restaurador se probó
  aparte por ZIP directo y multipart con Prisma transaccional simulado; no se
  conectó a una base real.
- La auditoría aislada, TypeScript de Electron, `git diff --check` y
  `npm run build:only` pasaron; la compilación segura generó 207 páginas. Antes
  de distribuir, queda observar la ejecución por intervalo en un paquete y
  restaurar una copia en una instalación desechable.

### Controles de calidad y sesión tipada por tienda (2026-10-23)

- Punto de reanudación de H05: commit `7ecfa76c` (`fix: restore enforced
  quality gates`). H12/H13 se implementaron después sobre la misma rama aislada;
  la migración de sesiones no requiere repetirse.
- H05 quedó cerrado en `feature/sunat-beta`. `StoreSessionData`,
  `getCurrentStoreUser` y `getStoreSessionOrThrow` garantizan `storeId: string`
  dentro de rutas tenant. Los endpoints globales de SUPERADMIN mantienen la
  sesión nullable porque operan sin una tienda seleccionada.
- La migración se limitó a endpoints que consultan o modifican datos de tienda.
  También corrigió firmas `params` de Next 15 y desajustes reales entre rutas y
  tipos Prisma; no se ejecutaron migraciones, semillas ni escrituras contra una
  base real.
### Impresión local e idempotencia de checkout (cerrado 2026-10-25)

- H12 quedó corregido en la rama aislada. El servicio de impresión rechaza
  orígenes no autorizados, refleja únicamente el origen permitido, exige un token
  local para configuración, detección e impresión y valida cada campo del parche
  de configuración. El token se genera aleatoriamente y se guarda con permisos
  restringidos en el perfil local; POS y recibo lo obtienen desde `/status`.
- Los nombres y puertos de impresora ya no se interpolan en `cmd.exe` ni en texto
  de PowerShell. Se valida el puerto y se invoca PowerShell mediante argumentos
  separados y una variable de entorno. La aceptación con impresora térmica real
  sigue siendo una comprobación operativa pendiente.
- H13 quedó corregido sin cambiar el esquema Prisma. Cada intento usa una clave
  estable en la interfaz, un ID de venta determinista con ámbito tienda/usuario y
  un hash canónico persistido en `paymentDetails`. Un reintento igual recupera la
  venta; reutilizar la clave con otro cuerpo responde 409. La colisión de clave
  primaria cubre reinicios y procesos concurrentes.
- `scripts/audit-pos-isolated.cjs` comprueba rechazo de orígenes y puertos
  maliciosos, token, ausencia de interpolación, orden de autorización/replay,
  estabilidad del hash y aislamiento entre tiendas y usuarios. TypeScript web y
  Electron, la compilación del servicio de impresión y la auditoría aislada
  pasaron. `npm run lint` terminó sin errores y `npm run build:only` compiló la
  aplicación completa con los controles activos; permanecen únicamente las
  advertencias históricas ya inventariadas.
- Punto de reanudación: H12/H13 están cerrados en código. El siguiente trabajo es
  la aceptación integral en una instalación desechable, con impresora térmica
  real y simulación de pérdida de respuesta y reinicio; no hace falta volver a
  migrar rutas tenant ni reabrir H05.
- Commit funcional H12/H13: `92c2e867` (`fix: secure printing and persist
  checkout retries`). La rama original `CristhianM` no recibió estos cambios.

### Entorno público del paquete desktop (H02, 2026-10-25)

- El standalone de Next podía heredar una copia anidada `server/.env`, incluso
  cuando el `.env` principal ya se reducía a `CLOUD_URL`. Ese era el último
  riesgo de código abierto de H02.
- `desktop/scripts/public-desktop-env.js` elimina cualquier `.env*` heredado de
  `build-resources`, valida que `CLOUD_URL` sea HTTPS y crea un único archivo
  público con esa clave. El build falla si queda otra copia o clave.
- `npm run test:desktop-env:isolated` y la comprobación H02 de la auditoría
  reproducen el caso sin leer secretos ni crear una distribución real.
- Commit funcional H02: `c6a9b52f` (`fix: sanitize desktop package
  environment`). La rama original `CristhianM` no recibió estos cambios.
- Los paquetes históricos permanecen como artefactos antiguos y no deben
  redistribuirse. Antes de producción deben rotarse las credenciales que alguna
  vez hayan sido incluidas en esos paquetes.
- Controles cerrados en este punto: TypeScript web y Electron, prueba aislada
  H02, auditoría aislada completa, `git diff --check` y `npm run build:only`
  (207 rutas) correctos. El build conserva advertencias históricas, sin errores.
- Próximo punto de reanudación: aceptación operativa en una instalación
  desechable: impresora térmica real, respuesta perdida/reinicio sin venta
  duplicada, respaldo/restauración y arranque automático del worker SUNAT. No
  reabrir H02, H05, H12 ni H13 salvo que una prueba operativa aporte evidencia
  nueva.

- `.eslintrc.json` carga `@typescript-eslint/parser` y el plugin correspondiente.
  `next.config.ts` ya no contiene `ignoreBuildErrors` ni `ignoreDuringBuilds`, por
  lo que una distribución vuelve a fallar ante errores de tipos o lint.
- Evidencia del cierre: TypeScript web y Electron sin diagnósticos;
  `npm run lint` con 0 errores y 707 advertencias históricas; `build:only` con
  controles activos y 207 páginas; auditoría aislada H01/H03/H04/H06-H11/H14-H20
  completa; `git diff --check` sin errores de whitespace.
- H08 usa en su prueba la misma sesión tipada que la ruta de abonos y confirma
  saldo 40, dos pagos e idempotencia. H09 exige respuesta 400 después de una
  consulta de pertenencia y confirma que un producto de otra tienda no crea la
  orden.

### Entregas desktop trazables y actualizaciones controladas (2026-10-20)

- La versión de la aplicación y del paquete Electron está sincronizada en
  **0.2.0**. Para una entrega nueva se usa `npm run desktop:version -- X.Y.Z`.
- `desktop/scripts/prepare-build.js` valida la política de entrega y genera
  `build-id.txt` y `release-manifest.json` con versión, commit, fecha UTC y estado
  limpio/sucio. Al terminar, `artifact-manifest.json` registra tamaño y SHA-256
  de cada ejecutable o instalador.
- El origen de actualizaciones se fija al compilar con
  `MONTERIAL_UPDATE_FEED_URL`. Debe ser HTTPS, queda incorporado en el manifiesto
  y no puede modificarse desde el renderer. Sin ese valor, el actualizador queda
  deshabilitado de forma explícita.
- Los alias antiguos `electron:*` delegan al flujo `desktop:*`, que usa
  `build:only`; el `.bat` de compatibilidad ya no contiene la versión manual.
- El certificado privado que estaba seguido por Git fue retirado del árbol sin
  abrirlo. `.pfx`, `.p12`, `.pem` y `.key` no deben entrar al repositorio; si una
  clave real estuvo en el historial, debe reemplazarse antes de producción.
- La guía operativa está en `docs/DESKTOP_RELEASE.md`. La prueba H20 valida esta
  política y comprueba el hash de un artefacto aislado sin usar base ni red.

### Punto de reanudacion SUNAT Beta (2026-10-12)

- El Resumen Diario valida `YYYY-MM-DD` y lo interpreta como fecha civil de Peru
  (UTC-05:00). No usar `new Date('YYYY-MM-DD')` en filtros fiscales: en Lima
  desplaza la medianoche al dia anterior y omite las boletas del dia elegido.
- Rama aislada: `feature/sunat-beta`. El proyecto principal no recibe estos
  cambios mientras no se integre expresamente esta rama.
- El panel de Documentos Electrónicos quedó verificado visualmente con 20
  documentos aceptados, cero pendientes y cero errores. Es evidencia del flujo
  BETA de esta tienda; no equivale a habilitación de PRODUCCIÓN.
- La protección de PRODUCCIÓN valida datos fiscales, SOL, certificado y prueba de
  firma tanto en interfaz como en servidor. La compilación segura `build:only` y
  `sunat:test:local` pasaron el 12/10/2026. Sigue pendiente una emisión controlada
  con el certificado y las credenciales reales de la empresa.
- El 12/10/2026 se reparó y reenvió en BETA la única NC legada elegible de la
  tienda restaurada activa: SUNAT respondió código `0`, se guardó el CDR, el job
  terminó `DONE` y la reversión local de venta e inventario también terminó. Dos
  copias archivadas con el mismo correlativo quedaron intactas.
- Los respaldos antiguos podian restaurar una tienda sin mover su suscripcion:
  la tienda nueva quedaba sin plan y la licencia `BUSINESS` seguia asociada a la
  tienda original archivada. El panel SUPERADMIN ahora detecta ese caso y ofrece
  `Recuperar BUSINESS` en la tienda restaurada activa.
- La deteccion exige simultaneamente: nombre con sufijo `(Restaurado fecha)`,
  mismo nombre base, mismo RUC valido de 11 digitos, origen archivado con plan y
  un unico candidato. Si hay ambiguedad no mueve nada. La recuperacion transfiere
  la suscripcion y sus pagos a la nueva tienda dentro de una transaccion; despues
  sincroniza los permisos del plan. Reactivar una restauracion archivada aplica
  la misma recuperacion cuando corresponde.
- El listado de tiendas usa tarjetas adaptables en ventanas menores a `xl` y la
  tabla completa en pantallas amplias; correos largos ya no desbordan las acciones.
- Portable actualizado en
  `desktop/dist-electron-20261012-151436/win-unpacked/Monterrial POS SUNAT Beta.exe`;
  el lanzador `Iniciar Monterrial POS SUNAT Beta.exe` está en el mismo directorio.
  Build ID: `2026-10-12T20:13:56.374Z`. Incluye la recuperación de planes, la
  corrección de fecha civil peruana, la reparación segura de notas legadas y el
  control completo que impide activar PRODUCCIÓN con datos, SOL o certificado
  de prueba. El paquete fue verificado con `CLOUD_URL` como única clave pública.
- Prueba esperada del Resumen Diario: cerrar el BETA anterior, abrir este
  portable, entrar como OWNER, abrir Documentos Electronicos, elegir la fecha
  local de las boletas pendientes y pulsar `Resumen de boletas`. Una boleta del
  11/10/2026 debe encontrarse dentro del rango
  `2026-10-11T05:00:00.000Z` a `2026-10-12T04:59:59.999Z`.

1. Retirar secretos de distribuciones. El cambio de identidad/tienda H01 quedó
   corregido y cubierto por pruebas aisladas el 18/10/2026.
2. Cerrado el 27/10/2026: el formato de backup `1.1` cubre todos los módulos por
   rubro (ver «Respaldo completo por tienda»). Las migraciones sin pérdida de
   datos quedaron resueltas en H04.
3. H14 quedó corregido junto con las anulaciones H06/H07, los abonos concurrentes
   H08, el aislamiento H09, la recepción atómica/idempotente H10 y la trazabilidad
   farmacéutica transaccional H11. Mantener esas invariantes al modificar ventas,
   fiados, lotes, compras, ajustes o farmacia.
4. Recuperar controles de tipos/lint; `next.config.ts` hoy omite ambos en build.
5. H12/H13 quedaron corregidos y cubiertos por la auditoría aislada: el servicio
   de impresión valida origen, token, configuración y argumentos; checkout usa
   identidad persistente por intento y recupera reintentos tras reinicios. Falta
   aceptación operativa con impresora y pérdida de respuesta en una instalación
   desechable. H15-H20 también quedaron corregidos y cubiertos por pruebas
   aisladas.
6. H20 quedó corregido: cada entrega queda identificada por versión, commit y
   manifiestos, sin destinos de actualización de ejemplo.
7. H03, H04, H05, H12 y H13 quedaron corregidos y verificados en
   `feature/sunat-beta`. La línea base H05 fue de 326 errores TypeScript; ahora
   web y Electron pasan, lint tiene 0 errores y el build ejecuta ambos controles.
   El siguiente frente es la aceptación integral y operativa de los cambios ya
   implementados antes de preparar una distribución.

Los detalles, condiciones y límites de evidencia están en el informe de auditoría.

## Último instalador encontrado

- Archivo: `desktop/dist-electron-20260401-193140/Monterrial POS-Setup-0.1.0.exe`.
- Versión: 0.1.0; tamaño: **480145736 bytes** (~457.90 MiB).
- EXE: última escritura **01/04/2026 19:45:07** en hora local observada.
- `latest.yml`: `2026-04-02T00:45:36.526Z`, equivalente a
  **01/04/2026 19:45:36.526 en Lima**.
- `build-log-desktop.txt` muestra fallo en carpeta bloqueada, reintento en ese
  directorio, creación NSIS y blockmap; no confundir el primer fallo con el
  resultado del reintento.
- `desktop/dist-electron/` contiene otro EXE con fecha 27/03/2026, no el más nuevo.
- El schema del paquete más reciente coincide por SHA256 con el actual, pero
  eso no demuestra que todo el código de la distribución sea idéntico.
- Fecha identificada dentro de este workspace; no prueba cuándo fue instalado
  en una tienda ni descarta instaladores almacenados en otra ubicación.

### Licenciamiento remoto seguro del desktop (2026-10-26)

- El paquete desktop conserva **solamente `CLOUD_URL`** como configuración
  pública. No se debe volver a incluir `LICENSE_API_KEY`, la contraseña del
  SUPERADMIN, `SESSION_SECRET` ni otra credencial global reutilizable.
- Electron crea un `SESSION_SECRET` aleatorio distinto por instalación, lo
  guarda dentro del perfil local y lo pasa al servidor Next local. Este secreto
  protege la sesión local; no autoriza operaciones en la nube.
- Al iniciar sesión como SUPERADMIN en el desktop, el servidor local envía las
  credenciales directamente a `CLOUD_URL`. Si son correctas, la nube devuelve
  una autorización de registro firmada y temporal, con vigencia de cuatro horas.
  La contraseña no se persiste en el instalador ni se transforma en una clave
  compartida.
- Al crear una tienda, o al usar **Registrar licencia/Renovar licencia** en el
  panel SUPERADMIN, el servidor local registra el `storeId` exacto en
  `/api/license/register-store`. La nube devuelve una credencial limitada a
  consultar la licencia de esa misma tienda. Una credencial de una tienda no
  sirve para consultar otra.
- El registro solo existe en el servidor local del desktop
  (`isCloudLicenseRegistrationAvailable`, por `DESKTOP_INTERNAL_TOKEN` o
  `MONTERRIAL_DATA_DIR`). En la web cloud, crear una tienda devuelve
  `not_required`, el botón de licencia no se muestra y la ruta responde 400.
- Las credenciales por tienda se guardan mediante escritura atómica en
  `MONTERRIAL_DATA_DIR/config/license-credentials.json`. El listado SUPERADMIN
  indica qué tiendas ya están vinculadas y permite renovar el vínculo después
  de volver a iniciar sesión.
- `/api/license/verify` acepta la credencial limitada de la tienda y mantiene
  temporalmente `LICENSE_API_KEY` solo como compatibilidad del servidor con
  instalaciones antiguas. La validación desktop selecciona la tienda activa por
  su `storeId`; no usa la primera tienda de la base por accidente.
- Una tienda vinculada conserva siete días de caché válida y tres días de
  gracia adicional sin Internet. Después exige reconexión con estado
  `VERIFICATION_REQUIRED`; `SUSPENDED` y `CANCELLED` bloquean la operación. Una
  instalación anterior que aún no tenga credencial por tienda conserva su
  comportamiento local hasta que el SUPERADMIN la vincule, para no interrumpir
  negocios ya instalados.
- El panel remoto de Billing sigue siendo la fuente de verdad para plan,
  vencimiento, extensión y suspensión. Registrar de nuevo una tienda existente
  renueva su credencial limitada y no sobrescribe el estado de pago remoto.
- Prueba aislada: `npm run test:licenses:isolated` comprueba firma y alteración
  de autorizaciones, aislamiento entre tiendas, persistencia concurrente y el
  registro por Bearer sin conectarse a una base real. Antes de distribuir hay
  que desplegar estas mismas rutas en el servidor de `CLOUD_URL`; un desktop
  nuevo no puede usar el protocolo hasta que la nube también lo soporte.
- Cierre verificado en `feature/sunat-beta`: pasan la prueba aislada de
  licencias, la validación del entorno desktop, TypeScript web y Electron, la
  auditoría integral H01-H20, lint sin errores y `npm run build:only`. Esta
  compilación no ejecuta `prisma db push` ni modifica una base real.
- Punto de reanudación: desplegar primero las rutas de esta rama en el servidor
  de `CLOUD_URL` y después generar el nuevo paquete desktop. La aceptación debe
  comprobar inicio SUPERADMIN, registro o renovación de la tienda exacta,
  suspensión remota, vencimiento y recuperación dentro de la tolerancia sin
  conexión.

### Compilación limpia en Render (2026-10-26)

- El `tsconfig.json` raíz incluye `print-service/src/server.ts` en la
  comprobación de tipos de `next build`. Por eso las dependencias usadas por
  ese módulo también deben estar declaradas en el `package.json` raíz, aunque
  `print-service/package.json` las declare para su ejecución independiente.
- `iconv-lite` quedó declarado como dependencia directa de la raíz para que una
  instalación limpia con `npm install && npm run build:only`, como la de
  Render, pueda resolver el módulo y sus tipos.
- El aviso de reglas ESLint de Next.js no fue la causa del fallo observado; el
  error bloqueante era la resolución de `iconv-lite` durante TypeScript.
