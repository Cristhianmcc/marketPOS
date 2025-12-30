# GUÍA COMPLETA: CATÁLOGO GLOBAL - OWNER

## 📚 ¿Qué es el Catálogo Global?

El **Catálogo Global** es una biblioteca compartida de productos que permite a las tiendas:
- ✅ Importar productos comunes sin crearlos desde cero
- ✅ Evitar duplicados con sugerencias inteligentes
- ✅ Ahorrar tiempo en la gestión de inventario
- ✅ Tener imágenes y datos consistentes

---

## 🎯 FLUJO 1: Importar Producto Desde Catálogo Global

### Paso 1: Acceder al Catálogo
1. Ir a **Inventario** (menú principal)
2. Click en **"📦 Catálogo Global"** (botón superior derecho)

### Paso 2: Buscar Producto
- **Por nombre**: Escribe "inca kola" en el buscador
- **Por categoría**: Selecciona "Bebidas" en el filtro
- **Por tipo**: Filtra "Unidad" o "Kilogramo"

### Paso 3: Importar
1. Click en botón azul **"Importar"** del producto deseado
2. Ingresa **TU precio de venta** (ej: S/ 3.50)
3. Ingresa **TU stock inicial** (ej: 100 unidades)
4. (Opcional) Ingresa stock mínimo para alertas
5. Click en **"Importar Producto"**

### ✅ Resultado:
- El producto aparece en tu inventario
- Con TU precio y stock
- Con la imagen y datos del catálogo
- **NO** se crea duplicado en el catálogo

---

## 🎯 FLUJO 2: Crear Producto CON Código de Barras

### Paso 1: Abrir Modal
1. Ir a **Inventario**
2. Click en **"Nuevo Producto"**
3. Seleccionar pestaña **"Con código de barras"**

### Paso 2: Escanear/Escribir Código
1. Usa pistola escáner o escribe manualmente
2. **Espera 1 segundo** (el sistema busca automáticamente)

### Caso A: Código NO existe en catálogo
```
✅ El código no existe, puedes crear el producto nuevo
```
- Completa: nombre, marca, contenido, categoría, precio, stock
- Click "Crear Producto"

### Caso B: Código YA existe en catálogo
```
💡 Producto encontrado en el catálogo
Inca Kola 1L
🏷️ Coca-Cola

✓ Se reutilizará este producto. Solo configura tu precio y stock.
```
- El sistema autocompletará nombre, marca, categoría
- Solo ingresa TU precio y stock
- Click "Crear Producto"
- **NO** se crea duplicado

---

## 🎯 FLUJO 3: Crear Producto SIN Código de Barras (FUZZY)

### Paso 1: Abrir Modal
1. Ir a **Inventario**
2. Click en **"Nuevo Producto"**
3. Seleccionar pestaña **"Sin código"**

### Paso 2: Escribir Nombre
Empieza a escribir el nombre (ej: "inca kola")

### Caso A: Hay sugerencias similares (FUZZY)
```
💡 Productos similares encontrados en el catálogo:

Inca Kola 1L
🏷️ Coca-Cola  📦 1 L  85% similar
[Usar]

Inca Kola 500ml
🏷️ Coca-Cola  📦 500 ml  78% similar
[Usar]

O continúa creando uno nuevo si ninguno coincide
```

**Opciones**:
1. **Click "Usar"** → importa ese producto (solo ingresas precio/stock)
2. **Ignorar sugerencias** → continúa creando producto nuevo

### Caso B: No hay sugerencias
- No aparece panel de sugerencias
- Continúa normal: nombre, categoría, precio, stock
- Click "Crear Producto"

---

## 🖼️ AGREGAR IMÁGENES A PRODUCTOS

### Opción 1: Al crear/editar producto
1. En el modal "Nuevo Producto" o "Editar"
2. Click en **"Subir imagen"**
3. Selecciona JPG, PNG o WEBP (máx 5MB)
4. Se sube automáticamente a Cloudinary

### Opción 2: Editar producto existente
1. En Inventario → Click en producto
2. Click en **"Editar"**
3. Sección "Imagen del producto"
4. Click "Subir imagen" o "Cambiar imagen"

---

## 🔍 ¿CÓMO SABER SI UN PRODUCTO YA ESTÁ EN EL CATÁLOGO?

### Método 1: Buscar en Catálogo Global
Antes de crear un producto nuevo:
1. Ir a **Catálogo Global**
2. Buscar por nombre o categoría
3. Si existe → **Importar**
4. Si no existe → Crear nuevo

### Método 2: Escanear Código (automático)
Al crear con código de barras:
- Si existe → aparece advertencia azul automáticamente
- Si no existe → puedes crear nuevo

### Método 3: Escribir Nombre (automático)
Al crear sin código:
- El sistema busca similares automáticamente
- Muestra sugerencias con % de similitud
- Tú decides: usar o crear nuevo

---

## ⚠️ IMPORTANTE: Códigos de Barras del Seed

Los productos del catálogo global inicial **NO tienen códigos de barras** porque:
- Son productos genéricos/ejemplo
- Los códigos varían por marca y presentación
- Cada tienda debe agregar SUS códigos reales

**Recomendación**:
1. Al importar un producto → agrega TU código real
2. Edita el producto → sección "Código de barras"
3. Escanea con pistola o escribe manualmente

---

## 🎨 HERRAMIENTAS PARA SUPERADMIN

### Script 1: Actualizar imágenes masivamente (URLs)
```bash
# 1. Crear archivo JSON con URLs
[
  { "name": "Inca Kola 1L", "imageUrl": "https://..." },
  { "name": "Coca Cola 500ml", "imageUrl": "https://..." }
]

# 2. Ejecutar script
tsx scripts/updateProductImages.ts data/product_images.json
```

### Script 2: Subir imágenes locales a Cloudinary
```bash
# 1. Organizar imágenes en carpeta
/images/products/
  inca-kola-1l.jpg
  coca-cola-500ml.jpg
  mapping.json

# 2. Crear mapping.json
[
  { "filename": "inca-kola-1l.jpg", "productName": "Inca Kola 1L" },
  { "filename": "coca-cola-500ml.jpg", "productName": "Coca Cola 500ml" }
]

# 3. Ejecutar script
tsx scripts/uploadImagesToCloudinary.ts ./images/products
```

### Script 3: Seed del catálogo (V2 limpia)
```bash
# Usar versión V2 (sin códigos falsos, con imágenes reales)
# Editar scripts/seedCatalog.ts línea 33:
const filePath = path.join(process.cwd(), "data", "catalog_seed_pe_v2.json");

# Ejecutar
npm run db:seed:catalog
```

---

## 🚫 ERRORES COMUNES Y SOLUCIONES

### Error: "Este producto ya existe en tu tienda"
**Causa**: Ya tienes ese producto importado
**Solución**: 
- Ir a Inventario → Buscar el producto
- Editar precio/stock si necesitas ajustar

### Error: "No se puede importar producto sin precio"
**Causa**: No ingresaste precio de venta
**Solución**: Ingresa un precio > 0 (ej: S/ 2.50)

### No aparecen sugerencias fuzzy
**Causa**: 
- Nombre muy corto (< 3 letras)
- No hay productos similares en catálogo
**Solución**: Continúa creando producto nuevo normalmente

### Imagen no se sube
**Causa**: Archivo muy grande o formato inválido
**Solución**: 
- Máximo 5MB
- Solo JPG, PNG o WEBP
- Comprimir imagen si es necesario

---

## 📊 ESTADÍSTICAS (SUPERADMIN)

Para ver estadísticas del catálogo:
```sql
-- Productos globales
SELECT COUNT(*) FROM products_master WHERE is_global = true;

-- Productos más importados
SELECT pm.name, pm.brand, COUNT(sp.id) as store_count
FROM products_master pm
JOIN store_products sp ON sp.product_id = pm.id
WHERE pm.is_global = true
GROUP BY pm.id, pm.name, pm.brand
ORDER BY store_count DESC
LIMIT 10;

-- Productos sin imagen
SELECT name, brand, category
FROM products_master
WHERE is_global = true AND image_url IS NULL
ORDER BY name;
```

---

## ✅ CHECKLIST: Configurar tu Tienda

- [ ] Explorar Catálogo Global
- [ ] Importar 5-10 productos comunes
- [ ] Configurar tus precios para cada producto
- [ ] Agregar stock inicial
- [ ] Probar fuzzy suggestions (crear sin código)
- [ ] Subir imágenes personalizadas (opcional)
- [ ] Agregar códigos de barras reales a productos importados

---

## 🆘 SOPORTE

¿Dudas o problemas?
- Ver logs en consola del navegador (F12)
- Verificar AuditLog en Prisma Studio
- Contactar a soporte técnico

**Happy cataloging! 🎉**
