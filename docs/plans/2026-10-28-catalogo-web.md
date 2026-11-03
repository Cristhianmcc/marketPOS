# Plan: rediseño del catálogo web

Fecha: 2026-10-28. Estado: fases 1 y 2 implementadas el 2026-11-02, sin cambios
de esquema ni de API. Fases 3 y 4 pendientes. El pie de página aún no muestra
dirección ni horario: dependen de la fase 3.

Referencia: diseño de tienda de abarrotes con portada (título, botón y foto del
producto), menú de categorías arriba, mosaico de categorías en colores pastel con
foto y pie de página. Hoy el catálogo (`/c/[slug]`) muestra encabezado, banner a
todo el ancho, chips de categoría con ícono y una grilla de productos.

## Qué cambia

1. **Portada (hero)**
   - Mitad izquierda: título grande, frase corta y botón "Ver productos" (baja a
     la grilla) y otro "Pedir por WhatsApp".
   - Mitad derecha: la foto del banner, recortada con bordes redondeados.
   - En celular se apila: texto arriba, foto abajo.
   - Textos editables en Configuración → Catálogo Web. Si están vacíos se usa
     el nombre de la tienda y "Pide por WhatsApp y recoge o recibe en casa".

2. **Barra superior**
   - Logo, nombre y las 3–4 categorías con más productos como enlaces.
   - Buscador con lupa (abre el campo de búsqueda) y carrito con contador.
   - Se mantiene fija al bajar.

3. **Mosaico de categorías**
   - Tarjetas grandes en una grilla de 4 columnas (2 en celular), cada una con
     color pastel propio y el nombre abajo a la izquierda.
   - Imagen de la tarjeta: la foto de un producto de esa categoría (la primera
     con foto). Si ninguna tiene foto, el ícono de la categoría en grande.
   - Al tocarla filtra la grilla. No se suben fotos de categoría aparte.

4. **Tarjetas de producto**
   - Sin foto: el ícono de su categoría sobre el mismo color pastel, en vez de
     "Sin imagen" (igual que en el POS).
   - Botón "+" que pasa a "− 1 +" al agregar, sin abrir el carrito.
   - Etiqueta "Oferta" cuando haya promoción vigente (fase posterior).

5. **Pie de página**
   - Enlaces: Cómo pedir, Contacto (WhatsApp), Redes, dirección y horario.
   - Botón "Escríbenos" verde.

6. **Color de la tienda**
   - Un color de acento elegible (verde por defecto) para botones y detalles.
   - Paleta pastel de categorías fija y legible, también en modo oscuro.

## Datos nuevos

Campos opcionales en `CatalogSettings` con migración aditiva:

- `heroTitle`
- `heroSubtitle`
- `accentColor`
- `businessHours`

Sin cambios en productos ni en categorías. El snapshot que se publica en la nube
debe incluir estos campos, y el respaldo exportarlos y restaurarlos.

## Archivos afectados

- `src/components/catalog/`:
  - `StoreHeader.tsx` (barra superior y portada).
  - `CategoryCard.tsx` y `CategoryFilter.tsx` (mosaico).
  - `ProductCard.tsx` (ícono, contador).
  - `CatalogPageClient.tsx` (orden de secciones, pie de página).
- `src/app/settings/catalog/page.tsx`: textos de portada, color y horario.
- Publicación en `src/app/api/desktop/publish-catalog/route.ts` y
  `src/app/api/catalog/publish/route.ts`, más el respaldo.
- `prisma/schema.prisma` + una migración nueva. En Render, ese deploy necesita
  `npx prisma db push --skip-generate` en el comando de build.

## Fases

1. **Portada, mosaico y tarjetas con ícono**: solo frontend y sin cambios de
   esquema. Se usan los textos por defecto.
2. **Barra fija, contador en tarjetas y pie de página.**
3. **Campos editables** (textos, color, horario) con migración, publicación y
   respaldo.
4. **Extras**:
   - productos destacados;
   - ofertas;
   - "Copiar enlace" del catálogo.

## Comprobaciones

- Ampliar `scripts/test-catalog-publish-isolated.ts`: los campos nuevos llegan
  a la nube y un catálogo sin ellos sigue publicando.
- Respaldo: ida y vuelta con los campos nuevos.
- Revisión visual en escritorio y celular (375 px), con y sin fotos, con 1 y
  con 12 categorías, y nombres largos.
- Las fotos de productos dependen de "Sincronizar imágenes". Hoy la tienda de
  prueba muestra "Sin imagen" en todos los productos, así que conviene subir
  algunas fotos para ver el mosaico con fotos reales.
