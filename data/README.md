# 📁 /data - Archivos de Datos

Esta carpeta contiene los archivos JSON utilizados para semillas (seeds) y gestión de imágenes del catálogo global.

---

## 📦 Catálogo Global - Seeds

### `catalog_seed_pe_v2.json` ✅ **RECOMENDADO**
- **50 productos curados** para Perú
- **SIN códigos de barras fake** (los owners deben agregar los reales al importar)
- **CON URLs de imágenes** para productos populares (Inca Kola, Coca-Cola, Gloria)
- Formato:
```json
[
  {
    "name": "Inca Kola 1L",
    "brand": "Coca-Cola",
    "content": "1 L",
    "unitType": "UNIDAD",
    "category": "Bebidas",
    "imageUrl": "https://plazavea.vteximg.com.br/..."
  }
]
```

**Uso**:
```bash
# Editar scripts/seedCatalog.ts línea 33 para usar V2
npm run db:seed:catalog
```

---

### `catalog_seed_pe.json` 🟡 **LEGACY - DEPRECADO**
- ~~169 productos con códigos de barras ficticios~~
- **NO recomendado**: Los códigos fake confunden a los usuarios
- Solo mantener para referencia/tests antiguos

---

## 🖼️ Gestión de Imágenes

### `product_images.example.json`
**Ejemplo** de JSON para actualizar imágenes desde URLs.

**Formato**:
```json
[
  {
    "name": "Inca Kola 1L",
    "brand": "Coca-Cola",
    "imageUrl": "https://plazavea.vteximg.com.br/..."
  }
]
```

**Uso**:
```bash
# 1. Copia el ejemplo y crea tu archivo
cp data/product_images.example.json data/my_images.json

# 2. Edita my_images.json con tus productos y URLs

# 3. Ejecuta el script
npm run images:update data/my_images.json
```

**Características**:
- Busca productos por nombre (case-insensitive)
- Filtro opcional por marca
- Omite productos que ya tienen imagen
- Reporta: updated/notFound/skipped

---

### `mapping.example.json`
**Ejemplo** de mapping para subir imágenes locales a Cloudinary.

**Formato**:
```json
[
  {
    "filename": "inca-kola-1l.jpg",
    "productName": "Inca Kola 1L",
    "brand": "Coca-Cola"
  }
]
```

**Uso**:
```bash
# 1. Crea una carpeta con tus imágenes
mkdir images/products
cd images/products

# 2. Copia tus imágenes (JPG, PNG, WEBP)
# - inca-kola-1l.jpg
# - coca-cola-500ml.jpg
# etc.

# 3. Crea mapping.json basado en el ejemplo
cp ../../data/mapping.example.json mapping.json
# Edita mapping.json con tus productos

# 4. Verifica que .env tenga las credenciales de Cloudinary:
# CLOUDINARY_CLOUD_NAME=...
# CLOUDINARY_API_KEY=...
# CLOUDINARY_API_SECRET=...
# CLOUDINARY_FOLDER=productos

# 5. Ejecuta el script desde la raíz del proyecto
npm run images:upload ./images/products
```

**Características**:
- Sube imágenes a Cloudinary (folder configurable)
- Busca productos por nombre y marca (opcional)
- Actualiza ProductMaster con `imageUrl` (secure_url de Cloudinary)
- Reporta: uploaded/updated/failed

---

## 🚀 Scripts NPM Disponibles

```bash
# Seed del catálogo global (V2 recomendado)
npm run db:seed:catalog

# Actualizar imágenes desde URLs
npm run images:update data/product_images.json

# Subir imágenes locales a Cloudinary
npm run images:upload ./images/products
```

---

## 📋 Checklist: Agregar Nuevos Productos al Seed

1. [ ] Agregar objeto al array en `catalog_seed_pe_v2.json`
2. [ ] Incluir: name, brand, content, unitType, category
3. [ ] (Opcional) Agregar `imageUrl` si tienes URL pública
4. [ ] NO agregar `barcode` (los owners lo agregarán)
5. [ ] Ejecutar: `npm run db:seed:catalog`
6. [ ] Verificar en Prisma Studio: `npm run db:studio`

---

## 🔍 Validación de Datos

### Campos requeridos:
- `name`: String (ej: "Inca Kola 1L")
- `brand`: String | null (ej: "Coca-Cola")
- `content`: String | null (ej: "1 L", "500 ml")
- `unitType`: "UNIDAD" | "KILOGRAMO" | "METRO"
- `category`: String (ej: "Bebidas", "Lácteos")

### Campos opcionales:
- `barcode`: String | null (dejar null si no tienes código real)
- `imageUrl`: String | null (URL pública de imagen)

### Validaciones automáticas:
- `normalizedName`: Se genera automáticamente (lowercase, sin tildes)
- `fingerprint`: Hash único `normalizedName|brand|content`
- `isGlobal`: Siempre `true` para productos del seed

---

## 📚 Ver También

- [GUIA_CATALOGO_GLOBAL_OWNER.md](../GUIA_CATALOGO_GLOBAL_OWNER.md) - Guía para usuarios finales
- [MODULO_18_2_CATALOGO_GLOBAL_SEED_FUZZY_COMPLETADO.md](../MODULO_18_2_CATALOGO_GLOBAL_SEED_FUZZY_COMPLETADO.md) - Documentación técnica

---

**Happy cataloging! 🎉**
