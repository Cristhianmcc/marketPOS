# Monterrial POS: mapa técnico y estado verificado

Última revisión: **04/10/2026**, zona America/Lima. Base Git observada:
`2b182cfb` (22/03/2026, rama de trabajo con numerosos cambios sin confirmar).
Este documento describe el árbol de trabajo, no solamente el último commit.

## Cómo usar este documento

1. Leer este mapa y comprobar `git status --short`.
2. Localizar el flujo afectado en la tabla de módulos.
3. Leer los archivos concretos y sus diferencias recientes.
4. Consultar los hallazgos abiertos antes de cambiar comportamientos relacionados.
5. Verificar el cambio y actualizar este documento si el mapa dejó de ser válido.

No es una certificación de ausencia de errores. La auditoría fue estática, con
validación de tipos/esquema y dos reproducciones aisladas. No se probaron ventas
reales, impresión física, restauración ni emisiones SUNAT. El informe detallado
es `docs/audits/2026-09-26-pos.md`.

## Arquitectura y tecnologías

- Aplicación web: Next.js **15.1.0**, App Router, React **19**, TypeScript estricto.
- Interfaz: Tailwind CSS 3, lucide-react, sonner; páginas cliente grandes.
- Persistencia: PostgreSQL, Prisma **5.22**; 44 modelos en `prisma/schema.prisma`.
- Sesiones: iron-session en cookie `market_pos_session`; contraseñas con bcrypt.
- Escritorio: Electron 28, electron-builder/NSIS Windows x64, versión **0.1.0**.
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
| `src/lib` | Sesión, flags, límites, descuentos, unidades, SUNAT y utilidades |
| `src/modules/pos` | Tipos y cálculos extraídos del POS; comprobar uso real al modificar |
| `src/modules/catalog` | Capas de catálogo público, publicación y sincronización |
| `src/worker/sunatWorker.ts` | Worker separado que procesa trabajos fiscales |
| `prisma` | Esquema, semillas, SQL y migraciones |
| `desktop/src` | Proceso principal, preload, servidor, PostgreSQL, impresión y backups |
| `desktop/scripts` | Preparación de recursos y empaquetado |
| `print-service/src/server.ts` | Servidor de impresión en `127.0.0.1:12121` |
| `scripts` | Mantenimiento, semillas y pruebas ad hoc; muchos modifican datos |
| `public` | Assets y service worker PWA |
| `docs`, `*_TEST_CHECKLIST.md` | Documentación histórica; contrastar afirmaciones con implementación |
| `.next`, `desktop/dist`, `desktop/build-resources`, `desktop/dist-electron*` | Artefactos generados; no editar como fuente |
| `pgsql`, `desktop/vendor`, `node_modules` | Runtime/dependencias, fuera de cambios funcionales ordinarios |
| `backups`, `.env`, certificados, ZIP/XLSX locales | Datos/configuración sensibles; no publicar |

## Mapa por funcionalidad

| Cambio solicitado | Archivos/puntos de entrada |
| --- | --- |
| Login, sesión y cambio de tienda | `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/superadmin.ts`, `src/middleware.ts`, `src/app/api/auth/*`, `src/app/api/setup/*` |
| Pantalla de venta | `src/app/pos/page.tsx`, `src/components/pos/*`, `src/hooks/usePosShortcuts.ts`, `src/modules/pos/lib/*` |
| Cobro y validaciones finales | `src/app/api/sales/checkout/route.ts`, `src/lib/checkoutLock.ts`, `src/lib/idempotency.ts` |
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
- La anulación actual se identifica poniendo total/subtotal/impuesto a cero,
  sin un estado explícito de venta. Los reportes suelen excluir `total <= 0`.

## Flujos principales

### Autenticación y configuración

Login busca primero usuario local y valida activo/contraseña. Si no existe,
puede autenticar usando cloud o configuración de superadmin. Se guarda sesión
cifrada durante siete días. El middleware excluye `/api`: cada ruta necesita sus
propios controles. Provisioning permite crear la primera tienda cuando no hay
usuarios. `setup/switch-store` tiene un defecto crítico abierto; no reutilizarlo
como patrón de autorización.

### Checkout

`pos/page.tsx` construye carrito y previsualiza descuentos. El servidor comprueba
tienda/usuario, pago y turno, y dentro de una transacción carga productos,
normaliza unidades, valida stock, calcula promociones/cupones/descuentos, asigna
lotes FEFO, crea venta/items/movimientos, actualiza stock y registra fiado.
El lock por cajero y la caché de idempotencia son Map locales al proceso.
La información de pacientes/libro controlado se registra después y sin esperar;
no forma parte de la transacción de venta. El cliente también intenta registrar
medicación y emite el comprobante SUNAT en una petición posterior.

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

En esta rama, `/api/admin/stores` autoriza listar y crear tiendas cuando la sesión
firmada tiene rol `SUPERADMIN`, además de conservar `SUPERADMIN_EMAILS` como mecanismo
heredado. Esto permite que el administrador validado por el servicio cloud use el
panel sin empaquetar su correo ni otros secretos en el ejecutable.

En los builds desktop de esta rama, `next.config.ts` fija
`NEXT_PUBLIC_ENABLE_SUNAT=true` durante la compilación para mostrar la sección de
facturación electrónica en `/settings`. La disponibilidad efectiva y los permisos
siguen verificándose en los endpoints del servidor; esto no activa producción ni
incluye credenciales en el paquete.

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

### Estado SUNAT de la rama Beta (04/10/2026)

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
- Electron consulta la cola cada diez segundos. Sin conexión, el endpoint deja
  los trabajos intactos. En PROD, un reintento de factura o nota consulta primero
  `getStatusCdr`; si no puede reconciliar el intento anterior, no reenvía a
  ciegas. Los locks y las transacciones evitan que dos workers completen el mismo
  trabajo o reserven dos veces un resumen.
- Credenciales SOL y certificado de PROD se cargan exclusivamente desde
  `SunatSettings` de la tienda. BETA usa MODDATOS y puede generar un certificado
  de prueba. Volver desde una restauración deja SUNAT desactivado y obliga a
  revisar credenciales y certificado antes de emitir.
- Cada ZIP de backup desktop tiene un archivo hermano `.sunat-fiscal`, cifrado
  con `electron.safeStorage`. Contiene XML, CDR, respuestas, relaciones y
  correlativos, pero no contiene contraseña SOL, certificado, contraseña del
  certificado ni jobs. La sincronización cloud actual solo recoge `.zip`, por
  lo que no sube este archivo fiscal. Al restaurar, los correlativos conservan el
  máximo entre la base y el archivo y nunca se recrean trabajos de envío. El
  cifrado está ligado al usuario de Windows: sirve para recuperación local en el
  mismo perfil; una exportación portable a otro equipo requiere un mecanismo
  adicional con contraseña elegida por el propietario.

Comprobación local disponible: `npm run sunat:test:local`. Cubre generación,
firma y verificación de factura, boleta identificada, consumidor final, NC, ND,
Resumen Diario, Comunicación de Baja, nombres SUNAT y PDF con QR. No sustituye
una homologación ni una emisión controlada en PROD con certificado y SOL reales.
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
Esta variante no copia `.env` dentro de `build-resources` ni del paquete. Para
pruebas locales, la configuración externa debe suministrarse al proceso al
arrancar; `ENABLE_SUNAT=true` se fija en el servidor desktop BETA.

Límites comprobados: el cálculo actual solo representa operaciones gravadas al
18 % y precios finales con IGV. No hay clasificación persistida para exoneradas,
inafectas, gratuitas, ISC o bolsas. La prueba local cubre UBL, firma, ZIP y CDR,
pero aún falta una emisión controlada contra SUNAT BETA y validación con los XSD
oficiales antes de considerar lista la salida a producción.

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
| `node scripts/audit-pos-isolated.cjs` | Dos pruebas con dependencias simuladas; actualmente falla en ambos controles de autorización |
| `npm run build:only` | Genera cliente Prisma y compila web sin `db push`; pasó en `feature/sunat-beta` |
| `npm run sunat:test:local` | Prueba aislada: certificado BETA, UBL, firma/verificación, ZIP y CDR; no usa base ni red |
| `npm run build` | **Modifica esquema con `prisma db push`** antes de compilar |
| `npm run desktop:build` | Standalone + preparación + tsc + empaquetado Windows |
| `npm run desktop:portable` | Empaquetado en directorio (`--dir`), no instalador portable de un solo EXE |
| `npm run db:migrate:deploy` | No considerar suficiente para base vacía: baseline actual vacío |

No existe script `test` principal. Hay listas manuales y scripts de integración
que pueden crear/modificar datos o comunicarse con SUNAT. Leerlos antes de usarlos.
No ejecutar `db:reset`, `force-reset`, semillas, importaciones o restauración en
una base real como comprobación rutinaria.

## Estado y prioridades pendientes

1. Resolver cambio de identidad/tienda y retirar secretos de distribuciones.
2. Restablecer backups verificables y migraciones sin aceptación automática de
   pérdida de datos.
3. Corregir anulaciones/lotes, abonos concurrentes, aislamiento en compras y
   trazabilidad farmacéutica.
4. Recuperar controles de tipos/lint; `next.config.ts` hoy omite ambos en build.
5. Verificar CORS/entrada de impresión, sesión, reportes, idempotencia y turnos.

Los detalles, condiciones y límites de evidencia están en el informe de auditoría.
No hay correcciones funcionales realizadas en esta revisión.

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
