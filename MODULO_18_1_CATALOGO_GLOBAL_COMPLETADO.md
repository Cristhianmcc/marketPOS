# MÓDULO 18.1 — CATÁLOGO GLOBAL + OPT-IN ✅

## Objetivo

Implementar un **Catálogo Global** reutilizable entre tiendas con opt-in manual, permitiendo:

1. **Catálogo Global (ProductMaster)** compartido entre tiendas
2. **Importación selectiva**: cada tienda importa productos del catálogo con su precio/stock propio
3. **Opt-In**: los productos creados por una tienda NO se comparten automáticamente, solo si el OWNER lo decide
4. **Dedupe por barcode**: si un producto nuevo tiene un barcode existente, se reutiliza el ProductMaster

## Reglas Clave (NO NEGOCIABLES)

- ✅ **NUNCA** compartir precios/stock entre tiendas. Precio/stock siempre vive en `StoreProduct`.
- ✅ El catálogo global solo contiene datos "neutros": name, brand, content, category, unitType, barcode, imageUrl.
- ✅ Si barcode coincide → mismo ProductMaster (dedupe automático).
- ✅ Si barcode es null → NO dedupe automático (se permite duplicado); solo sugerencias por nombre.
- ✅ Todo respeta permisos: OWNER gestiona compartir/importar. CASHIER solo usa POS.

---

## A) CAMBIOS EN BASE DE DATOS (Prisma)

### Nuevos campos en `ProductMaster`

```prisma
model ProductMaster {
  // ... campos existentes ...
  
  // ✅ MÓDULO 18.1: Catálogo Global + Opt-In
  isGlobal         Boolean  @default(false) @map("is_global") // visible en catálogo global
  createdByStoreId String?  @map("created_by_store_id") // tienda que lo creó (auditoría)
  approvedAt       DateTime? @map("approved_at") // opcional: aprobación por SUPERADMIN
  approvedById     String?  @map("approved_by_id") // opcional
  
  // Relaciones
  createdByStore Store? @relation("ProductCreatedByStore", fields: [createdByStoreId], references: [id], onDelete: SetNull)
  approvedBy     User?  @relation("ProductApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  
  @@index([isGlobal])
  @@index([createdByStoreId])
}
```

### Migración aplicada

```bash
npx prisma migrate dev --name global_catalog_opt_in
```

**Fecha**: 2025-12-30
**Archivo**: `migrations/20251230204805_global_catalog_opt_in/migration.sql`

---

## B) APIs BACKEND

### 1. `GET /api/catalog/global`

**Autenticación**: OWNER  
**Descripción**: Lista productos del catálogo global (isGlobal = true)

**Query Params**:
- `q` (string): búsqueda por nombre
- `category` (string): filtrar por categoría
- `unitType` (UNIT | KG): filtrar por tipo de unidad
- `hasBarcode` (true | false): filtrar por presencia de barcode
- `limit` (number): resultados por página (default: 20)
- `cursor` (string): paginación

**Response**:
```json
{
  "products": [
    {
      "id": "...",
      "name": "Coca Cola 500ml",
      "barcode": "7750182004039",
      "category": "Bebidas",
      "unitType": "UNIT",
      "imageUrl": "https://...",
      "alreadyImported": false,
      "createdByStore": { "name": "Bodega Central" }
    }
  ],
  "nextCursor": "..."
}
```

### 2. `POST /api/catalog/import`

**Autenticación**: OWNER  
**Descripción**: Importa un producto del catálogo global a la tienda

**Body**:
```json
{
  "productMasterId": "clxxx...",
  "price": 2.50,
  "stock": 100,
  "minStock": 10,
  "active": true
}
```

**Response**:
```json
{
  "message": "Producto importado exitosamente",
  "storeProduct": { ... }
}
```

**Audit Log**: `CATALOG_IMPORT_SUCCESS` / `CATALOG_IMPORT_FAILED`

### 3. `POST /api/catalog/publish`

**Autenticación**: OWNER  
**Descripción**: Marca un producto como global (compartir al catálogo)

**Body**:
```json
{
  "productId": "clxxx..." // ProductMaster.id
}
```

**Response**:
```json
{
  "message": "Producto publicado exitosamente en el catálogo global",
  "product": { ... }
}
```

**Audit Log**: `CATALOG_PUBLISH_SUCCESS` / `CATALOG_PUBLISH_FAILED`

### 4. `GET /api/products/suggest`

**Autenticación**: OWNER  
**Descripción**: Sugiere productos existentes por barcode o nombre (para formulario de crear producto)

**Query Params**:
- `barcode` (string): búsqueda exacta por código de barras
- `name` (string): búsqueda por nombre (mínimo 3 caracteres)

**Response**:
```json
{
  "suggestions": [
    {
      "id": "...",
      "name": "Coca Cola 500ml",
      "barcode": "7750182004039",
      "alreadyInStore": false,
      "matchType": "exact_barcode"
    }
  ]
}
```

### 5. `POST /api/uploads/product-image`

**Autenticación**: OWNER  
**Descripción**: Sube una imagen de producto a Cloudinary

**Body**: `FormData` con field `image`

**Response**:
```json
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "market_pos/store_id/products/xxx"
}
```

**Validaciones**:
- Tipos permitidos: JPG, PNG, WEBP
- Tamaño máximo: 5MB
- Transformación automática: 800x800px, calidad auto

**Audit Log**: `PRODUCT_IMAGE_UPLOADED` / `PRODUCT_IMAGE_UPLOAD_FAILED`

---

## C) INTERFAZ DE USUARIO

### 1. Página: `/admin/catalog` (Catálogo Global)

**Acceso**: Solo OWNER

**Características**:
- Búsqueda y filtros (nombre, categoría, tipo, barcode)
- Tabla de productos globales con imagen thumbnail
- Badge "Ya importado" si el producto ya está en la tienda
- Botón "Importar" abre modal con formulario de precio/stock
- Muestra tienda que compartió el producto

**Componentes**:
- `ImportProductModal`: formulario para importar con precio/stock

### 2. Inventario: `/inventory` (Modificaciones)

**Nuevos elementos**:
- Botón **"Catálogo Global"** en header (color azul)
- Botón **"Compartir"** (Share2 icon) en cada producto no global
- Badge **Globe icon** para productos ya compartidos

**Flujo de compartir**:
1. Usuario hace clic en "Compartir"
2. Confirmación con mensaje: "¿Compartir al catálogo global? Otras tiendas podrán importar (solo info básica, no precio/stock)"
3. POST `/api/catalog/publish`
4. Producto marca `isGlobal = true`
5. Aparece en `/admin/catalog` para otras tiendas

### 3. Crear Producto: `CreateProductModal` (Modificaciones)

**Detección de duplicados**:
- Al escribir barcode (debounce 500ms), llama `/api/products/suggest?barcode=...`
- Si existe producto con ese barcode:
  - **Alerta visual** (azul) mostrando producto encontrado
  - Si NO está en tienda: mensaje "✓ Se reutilizará este producto..."
  - Si YA está en tienda: mensaje "⚠️ Ya existe en tu tienda"
- Al enviar formulario:
  - Si producto existe y NO está en tienda → solo crea `StoreProduct` (no crea nuevo `ProductMaster`)
  - Si producto NO existe → crea `ProductMaster` + `StoreProduct` (flujo normal)

---

## D) SEGURIDAD Y VALIDACIONES

### Permisos

- **OWNER**: puede importar, publicar, ver catálogo global
- **CASHIER**: sin acceso a catálogo global ni botones de compartir
- **SUPERADMIN**: puede ver todo el catálogo (futuro: moderación con `approvedAt`)

### Validaciones

1. **Importar**: verificar que `productMaster.isGlobal = true`
2. **Importar**: error 409 si producto ya existe en tienda (`@@unique(storeId, productId)`)
3. **Publicar**: verificar que tienda tiene el producto configurado (`StoreProduct` existe)
4. **Publicar**: error si producto ya está publicado (`isGlobal = true`)
5. **Subir imagen**: tipos permitidos (JPG/PNG/WEBP), máximo 5MB

### Audit Logs

Nuevas acciones registradas:
- `CATALOG_IMPORT_SUCCESS` / `CATALOG_IMPORT_FAILED`
- `CATALOG_PUBLISH_SUCCESS` / `CATALOG_PUBLISH_FAILED`
- `PRODUCT_IMAGE_UPLOADED` / `PRODUCT_IMAGE_UPLOAD_FAILED`

**Entity Type**: `CATALOG` (nuevo valor en enum `AuditEntityType`)

---

## E) CONFIGURACIÓN

### Variables de Entorno (Cloudinary)

Agregar a `.env`:

```env
# ✅ MÓDULO 18.1: Cloudinary (para subir imágenes de productos)
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
```

**Obtener credenciales**: https://cloudinary.com/console

### Dependencias

```bash
npm install cloudinary
```

**Versión instalada**: `cloudinary@^2.x`

---

## F) FLUJOS PRINCIPALES

### Flujo 1: Crear producto nuevo con barcode

1. Owner abre "Nuevo Producto" → pestaña "Con código de barras"
2. Escribe barcode → sistema busca en `/api/products/suggest`
3. **Caso A**: Barcode NO existe → crea nuevo ProductMaster + StoreProduct
4. **Caso B**: Barcode existe pero NO en tienda → reutiliza ProductMaster, solo crea StoreProduct
5. **Caso C**: Barcode existe y YA en tienda → error "Ya existe en tu tienda"

### Flujo 2: Compartir producto al catálogo global

1. Owner va a Inventario → clic en botón "Compartir" (Share2 icon)
2. Confirmación: "¿Compartir al catálogo global?"
3. POST `/api/catalog/publish` → marca `ProductMaster.isGlobal = true`
4. Producto aparece en `/admin/catalog` para otras tiendas
5. Badge Globe icon aparece en inventario

### Flujo 3: Importar producto del catálogo global

1. Owner va a `/admin/catalog`
2. Busca/filtra productos globales
3. Clic en "Importar" → abre modal `ImportProductModal`
4. Ingresa precio, stock (opcional), minStock (opcional)
5. POST `/api/catalog/import` → crea `StoreProduct` con precio/stock propio
6. Producto aparece en inventario de la tienda

### Flujo 4: Subir imagen de producto

1. Owner edita producto → botón "Subir imagen"
2. Selecciona archivo (JPG/PNG/WEBP, máx 5MB)
3. POST `/api/uploads/product-image` → sube a Cloudinary
4. Devuelve URL → actualiza `ProductMaster.imageUrl`
5. Imagen se muestra en inventario y catálogo global

---

## G) PRUEBAS REALIZADAS

### Test 1: Crear producto con barcode nuevo
✅ Crea ProductMaster + StoreProduct  
✅ SKU interno generado automáticamente

### Test 2: Crear producto con barcode existente
✅ Detecta duplicado y muestra alerta  
✅ Reutiliza ProductMaster existente  
✅ Solo crea StoreProduct con precio/stock propio

### Test 3: Compartir producto al catálogo
✅ Marca `isGlobal = true`  
✅ Aparece en `/admin/catalog`  
✅ Badge Globe icon visible en inventario

### Test 4: Importar producto de catálogo global
✅ Crea StoreProduct con precio/stock independiente  
✅ No duplica ProductMaster  
✅ Badge "Ya importado" actualizado

### Test 5: Verificar aislamiento de precios/stock
✅ Tienda A: Coca Cola → S/ 2.50  
✅ Tienda B importa: Coca Cola → S/ 3.00  
✅ Ambas ven su precio independiente en POS

---

## H) MEJORAS FUTURAS (No incluidas en v1)

1. **Moderación SUPERADMIN**: aprobar productos antes de publicar (`approvedAt` / `approvedById`)
2. **Reportes de popularidad**: productos más importados
3. **Sugerencias inteligentes**: machine learning para recomendar productos
4. **Imágenes múltiples**: galería de fotos por producto
5. **Categorías globales**: taxonomía estandarizada
6. **API pública**: permitir integración con proveedores

---

## I) ARCHIVOS MODIFICADOS/CREADOS

### Schema y Migraciones
- ✅ `prisma/schema.prisma`
- ✅ `prisma/migrations/20251230204805_global_catalog_opt_in/migration.sql`

### APIs Backend
- ✅ `src/app/api/catalog/global/route.ts` (nuevo)
- ✅ `src/app/api/catalog/import/route.ts` (nuevo)
- ✅ `src/app/api/catalog/publish/route.ts` (nuevo)
- ✅ `src/app/api/products/suggest/route.ts` (nuevo)
- ✅ `src/app/api/uploads/product-image/route.ts` (nuevo)

### Frontend
- ✅ `src/app/admin/catalog/page.tsx` (nuevo)
- ✅ `src/components/catalog/ImportProductModal.tsx` (nuevo)
- ✅ `src/app/inventory/page.tsx` (modificado)
- ✅ `src/components/inventory/CreateProductModal.tsx` (modificado)

### Repositorios y Tipos
- ✅ `src/infra/db/repositories/PrismaStoreProductRepository.ts` (modificado)
- ✅ `src/domain/types.ts` (modificado)

### Configuración
- ✅ `.env.example` (actualizado con Cloudinary)
- ✅ `package.json` (agregado cloudinary)

---

## J) NOTAS TÉCNICAS

### Dedupe por Barcode

**Lógica**:
```typescript
// Si barcode existe en ProductMaster
const existing = await prisma.productMaster.findUnique({ where: { barcode } });

if (existing) {
  // Reutilizar ProductMaster
  // Solo crear StoreProduct
} else {
  // Crear nuevo ProductMaster + StoreProduct
}
```

### Paginación

- API `/api/catalog/global` usa **cursor-based pagination**
- Más eficiente que offset para tablas grandes
- Devuelve `nextCursor` para siguiente página

### Cloudinary

- Transformación automática: `width: 800, height: 800, crop: 'limit'`
- Formato automático (WebP en navegadores compatibles)
- Carpeta organizada: `market_pos/{storeId}/products/`

---

## K) COMPATIBILIDAD

- ✅ **Módulos 1-17**: Sin regresiones
- ✅ **POS**: Sin cambios, sigue usando StoreProduct
- ✅ **Checkout**: Sin cambios, precios/stock siguen en StoreProduct
- ✅ **Reportes**: Sin cambios
- ✅ **Demo Mode**: Compatible (productos demo no se comparten globalmente)

---

## CONCLUSIÓN

El MÓDULO 18.1 está **100% implementado y funcional**, permitiendo:

✅ Catálogo global compartido entre tiendas  
✅ Opt-in manual (OWNER decide qué compartir)  
✅ Dedupe automático por barcode  
✅ Aislamiento total de precios/stock  
✅ Subida de imágenes con Cloudinary  
✅ Audit logs completos  
✅ Zero regresiones en módulos anteriores  

**Estado**: ✅ PRODUCTION READY
