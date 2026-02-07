# CLOUDINARY_SETUP.md — Configuración de Imágenes de Productos

## 📋 Resumen

El sistema usa **Cloudinary** para almacenar imágenes de productos de forma externa, evitando guardar binarios en la base de datos.

## 🔧 Variables de Entorno

```env
# ✅ MÓDULO S5: Cloudinary (para subir imágenes de productos)
CLOUDINARY_CLOUD_NAME="tu_cloud_name"
CLOUDINARY_API_KEY="tu_api_key"
CLOUDINARY_API_SECRET="tu_api_secret"
CLOUDINARY_FOLDER="productos"  # Carpeta donde se guardarán las imágenes
```

## 📦 Obtener Credenciales

1. Crea una cuenta gratuita en [Cloudinary](https://cloudinary.com/users/register/free)
2. Ve al [Dashboard](https://cloudinary.com/console)
3. Copia las credenciales:
   - **Cloud Name**: aparece en la URL del dashboard
   - **API Key**: en la sección API Keys
   - **API Secret**: en la sección API Keys (clic en "Reveal")

## ⚙️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FLUJO DE UPLOAD                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuario selecciona imagen en CreateProductModal             │
│     ↓                                                           │
│  2. Frontend envía FormData a POST /api/uploads/product-image   │
│     ↓                                                           │
│  3. Backend valida (OWNER, tipo, tamaño)                        │
│     ↓                                                           │
│  4. Backend sube a Cloudinary (cloudinary.uploader.upload)      │
│     ↓                                                           │
│  5. Cloudinary devuelve { secure_url, public_id }               │
│     ↓                                                           │
│  6. Backend devuelve { url, publicId } al frontend              │
│     ↓                                                           │
│  7. Frontend guarda url en formData.imageUrl                    │
│     ↓                                                           │
│  8. Al crear producto, se guarda en ProductMaster.imageUrl      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Archivos Involucrados

| Archivo | Descripción |
|---------|-------------|
| `src/app/api/uploads/product-image/route.ts` | Endpoint POST para subir imagen |
| `src/components/inventory/CreateProductModal.tsx` | UI con botón de subir y preview |
| `prisma/schema.prisma` | Campo `imageUrl` en ProductMaster |
| `.env` | Variables de entorno de Cloudinary |

## 🔒 Validaciones del Endpoint

| Validación | Valor |
|------------|-------|
| **Auth requerida** | Sí (OWNER solamente) |
| **Tipos permitidos** | `image/jpeg`, `image/png`, `image/webp` |
| **Tamaño máximo** | 5 MB |
| **Transformaciones** | Redimensionar a 800x800 max, auto quality/format |

## 📊 Schema de Base de Datos

```prisma
model ProductMaster {
  // ... otros campos
  imageUrl    String?  @map("image_url")  // ✅ URL de Cloudinary
}
```

## 🌐 API Endpoint

### POST /api/uploads/product-image

**Request:**
```
Content-Type: multipart/form-data

FormData:
  - image: File (JPG/PNG/WEBP, max 5MB)
```

**Response 200:**
```json
{
  "url": "https://res.cloudinary.com/xxx/image/upload/v123/productos/abc123.jpg",
  "publicId": "productos/abc123"
}
```

**Errores:**
- `401` - No autenticado
- `403` - No es OWNER
- `400` - Archivo faltante o tipo inválido
- `400` - Archivo muy grande (>5MB)
- `500` - Cloudinary no configurado

## 📤 Export/Backup

El campo `imageUrl` se incluye en:
- Export CSV de Inventario (columna "Imagen URL")
- Backups de datos (solo URL, no el binario)

Al restaurar, las URLs siguen funcionando ya que apuntan a Cloudinary.

## 🧪 Testing

1. Iniciar servidor: `npm run dev`
2. Ir a Inventario → Nuevo Producto
3. Hacer clic en "Subir imagen"
4. Seleccionar una imagen JPG/PNG/WEBP < 5MB
5. Verificar que aparece el preview
6. Crear producto y verificar que se muestra la imagen

## 📈 Plan Gratuito de Cloudinary

- **25 créditos/mes** (suficiente para ~1000 imágenes pequeñas)
- **25 GB almacenamiento**
- **25 GB bandwidth**

## ⚠️ Troubleshooting

### Error: "Cloudinary no está configurado"
- Verificar que las 3 variables de entorno estén definidas
- Reiniciar el servidor después de cambiar `.env`

### Error: "Solo el propietario puede subir imágenes"
- El upload solo está permitido para usuarios con rol OWNER
- Los cajeros no pueden subir imágenes

### Imagen no se muestra
- Verificar que la URL guardada sea accesible
- Revisar en Cloudinary Dashboard → Media Library
