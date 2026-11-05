# Rubro Perfumería (perfumes de equivalencia): estudio y propuesta

Fecha: 05/11/2026. Fuente: revisión de https://perfumarte.pe (Shopify, catálogo
público `products.json`) y del código actual de MarketPOS (`feature/sunat-beta`).
Estado (05/11/2026): **fases 1 a 3 implementadas** en `feature/sunat-beta`, sin
commit. Probadas con `npm run test:perfumeria:isolated` (18 pasos, PostgreSQL
desechable); no probadas todavía en la app de escritorio, con impresora ni en
la nube del catálogo. Pendiente: fase 4 (transferencias de esencia entre
sedes) y confirmar con el dueño precios, ml por frasco y reglas de relleno.

Fase 2 y 3 (hecho):
- Extras en la misma línea (`PerfumeExtra`): feromonas (descuentan su
  producto) y gramos adicionales (descuentan ml de la misma fragancia).
- Packs (`PerfumePack`): tamaño + cantidad + precio cerrado + regalo; el color
  se elige por frasco al vender. Precio repartido por línea.
- Rellenos con compra previa: el cliente debe haber comprado (en la sede) una
  presentación que habilita relleno (por defecto 120 ml Black Stone). El dueño
  puede autorizar la excepción; queda marcada en la venta y en el reporte.
- Promo lleva/paga por presentación (2x1, 3x2), configurable en Perfumería.
- Reporte de consumo, margen y reposición con días de cobertura.
- Catálogo web con filtros por género, familia y temporada y precios por
  presentación.

Decisiones de la fase 2:
- La compra previa se busca solo en la sede (los clientes son por tienda).
  Si la cadena quiere que valga en cualquier local, hace falta un registro de
  clientes compartido.
- El 2x1 se reparte entre las líneas para que ninguna quede en S/ 0 en la
  boleta.
- Los packs no admiten extras ni descuento manual (ya tienen precio cerrado).

Decisiones del MVP:
- Una sede = una tienda. El catálogo se carga en cada sede con el importador o
  con el JSON exportado de otra sede.
- Stock de esencia en ml (la presentación dice cuántos ml consume; por defecto
  igual a su volumen). Ajustable por presentación si la esencia es concentrada.
- Precios de referencia tomados de la web (05/11/2026): 50 ml S/ 35.94,
  100 ml S/ 53.94, relleno 120 ml S/ 43.00, Black Stone S/ 59.90, Teens
  S/ 24.90. Confirmar con el dueño el precio real en tienda.
- Datos del catálogo web: F1378 y M1254 tienen el código cruzado en su
  descripción; la importación usa el SKU.

## 1. Cómo funciona el negocio (lo observado)

Vende perfumes "Inspirado en <perfume de marca>" al 25 % de concentración de
aceite. La venta real es la combinación de dos cosas:

1. **Fragancia (esencia):** código letra+número (`F754` J'adore, `M1141` Sauvage,
   `M1227` Born in Roma Intense). F = mujer, M = hombre. Se clasifica por género,
   familia olfativa (Florales Románticos, Amaderados Elegantes, Cítrico Marino,
   Gourmand, Acordes Cálidos…), aroma principal, temporada y ocasión.
   Unas 270 fragancias en la web.
2. **Envase / presentación**, que es lo que fija el precio:

| Presentación | SKU web | Precio | Precio lista |
| --- | --- | --- | --- |
| Relleno 120 ml (solo esencia, cliente trae envase) | BPR001 | 43.00 | — |
| 50 ml Perfumarte (Azul/Rojo/Gris/Transparente) | PAR5000x | 35.94 | 59.90 |
| 100 ml Perfumarte (4 colores) | PAR1000x | 53.94 | 89.90 |
| 120 ml Black Stone | P1018 | 59.90 | 99.90 |
| 60 ml Teens (4 colores) | P041x | 24.90 | 64.00 |
| 50 ml "Liqui" (liquidación) | — | 23.90 | 59.90 |

Packs a precio cerrado, el cliente elige N fragancias: 2x50 = 69.90,
3x50 = 99.90, 2x100 = 104.90, 3x100 = 149.90, 4x100 + atomizador = 179.90,
3x120 Black Stone = 179.90.

Extras que se suman a la línea: feromonas 10 g (dama/caballero) +20.00,
gramos adicionales de esencia (5 g +10.00, 10 g +20.00), atomizador de bolsillo
5 ml (regalo en packs).

Reglas comerciales: rellenos y 2x1 / 3x2 de rellenos **solo para clientes que
ya compraron un 120 ml** (lo verifican); cupón 10 %; descuentos 40 %/60 % sobre
precio de lista; boleta/factura electrónica; devoluciones en 48 h solo con
producto sellado y cambio por el mismo tamaño.

Lo que hoy hacen en Excel probablemente es: ventas del día, qué fragancia y qué
envase salió, y cuánta esencia queda.

## 2. Por qué no basta un producto por combinación

270 fragancias × ~15 presentaciones = 4 000 productos, y el stock real no está en
el frasco terminado: está en **litros de esencia** y **unidades de envase**. Un
100 ml descuenta un frasco de 100 ml del color elegido + la esencia de esa
fragancia. Por eso el módulo debe vender "fragancia + presentación" y descontar
por receta.

## 3. Diseño propuesto en MarketPOS

### 3.1 Perfil y flag

- Nuevo `BusinessProfile.PERFUMERIA` en `businessProfiles.ts` con flag propio
  `ENABLE_PERFUMERY` (mismo patrón que Lavandería: `getRubroFlagChanges`,
  `ensureProfileFlags`).
- Categorías sugeridas: Fragancias Mujer, Fragancias Hombre, Unisex, Envases,
  Rellenos, Feromonas, Accesorios.

### 3.2 Datos (reutilizando lo que existe)

- **Esencias = `StoreProduct` con unidad base ml (o g)** y stock decimal. Se
  aprovechan Unit/UnitConversion, compras a proveedor, movimientos y
  `stockMutations.ts` sin tocarlos. Campos nuevos en un modelo 1:1
  `FragranceProfile` (productId, código `F754`, género, familia, aroma, temporada,
  ocasión, marca/perfume de referencia, notas). Así el inventario y el catálogo
  siguen funcionando.
- **Envases, feromonas, atomizadores = `StoreProduct` normales** por unidad.
- **`PerfumePresentation`** (nuevo, por tienda): nombre ("100 ml Azul"),
  precio, precio de lista, ml de esencia que consume, envase que consume
  (StoreProduct, null en relleno), `requiresPriorPurchase` (relleno), activo.
- **`PerfumePack`** (nuevo): presentación, cantidad de fragancias (2/3/4), precio
  cerrado, regalo opcional (atomizador).
- **`PerfumeExtra`**: feromona / gramos adicionales → producto que descuenta y
  precio.

### 3.3 Venta en el POS

Pantalla propia (como `LaundryPos`), con "Venta directa" al POS normal:

1. Buscar fragancia por código o nombre (`F754`, "jadore") o filtros
   género/familia.
2. Elegir presentación (botones grandes con precio) y extras.
3. Agrega una línea: **"F754 Inspirado en J'adore – 100 ml Azul + Feromonas"**
   con precio = presentación + extras.
4. Packs: elegir pack y luego N fragancias; una línea con precio del pack.

En checkout, cada línea guarda snapshot (fragancia, presentación, extras) y
dentro de la misma transacción descuenta por receta: N ml de esencia + 1 envase
+ extras, con `consumeSaleInventory`/deltas condicionados. Si falta esencia o
envase, se rechaza como hoy con el stock. La anulación devuelve lo mismo.
SUNAT: una línea por perfume con unidad NIU; no cambia el emisor.

### 3.4 Cliente y rellenos

- Relleno exige cliente identificado (DNI/teléfono) con una compra previa de
  envase 120 ml (consulta sobre `SaleItem` + snapshot de presentación). El
  OWNER puede autorizar la excepción.
- 2x1 / 3x2 de rellenos con el motor existente de promociones N-ésima
  (`nthPromotions.ts`), limitado a la categoría Rellenos.
- Historial del cliente: "la última vez llevó M1141 100 ml" → venta en 2 clics.

### 3.5 Inventario y reportes

- Stock de esencias en ml con mínimo de reposición y alerta.
- Reporte de consumo: ml por fragancia, top fragancias, envases por color,
  margen por presentación (costo esencia × ml + costo envase).
- Ajuste por merma (derrames, pruebas de tester) como movimiento.
- Importador desde su Excel (fragancias y stock inicial), probado contra base
  aislada.

### 3.6 Catálogo web

Ya existe (`/c/[slug]`, paletas). Añadir filtros género/familia/temporada y
mostrar precios por presentación desde `PerfumePresentation`.

## 4. Fases

1. **MVP (lo que reemplaza el Excel):** perfil, FragranceProfile, presentaciones,
   POS de perfumería, descuento por receta, ticket/SUNAT, importación del Excel.
2. Rellenos con validación de compra previa, packs, extras, promos 2x1/3x2.
3. Reportes de consumo y reposición, catálogo web con filtros.
4. Multi-local (si aplica): transferencias de esencia entre tiendas.

## 5. Preguntas para el dueño antes de construir

- ¿Es un local independiente o una de las 24 tiendas de la cadena? (La cadena
  tiene web en Shopify; si es franquicia, puede que deban seguir precios y
  códigos centrales.)
- ¿Prepara los perfiles en el local (esencia + alcohol + fijador) o recibe el
  frasco ya lleno? Define si el stock es en ml de esencia o en frascos.
- ¿Cuánta esencia lleva cada tamaño (ml o gramos) y a qué costo compra el litro?
- ¿Cuántas fragancias maneja en tienda y cómo las codifica en su Excel?
- ¿Emite boleta/factura hoy? ¿Con qué sistema?
- Medios de pago (Yape, Plin, tarjeta) y si da crédito.
- ¿Controla testers/merma?

## 6. Nota

Mostrar el código propio (`F754`) como nombre principal en ticket y catálogo y
el perfume de referencia como dato descriptivo; es la práctica del rubro y evita
presentar el producto como de la marca original.
