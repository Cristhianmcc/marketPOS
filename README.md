# Market POS - Sistema de Inventarios y Ventas para Bodegas

Sistema POS multi-tienda diseñado específicamente para bodegas peruanas, con soporte para productos con y sin código de barras.

## Stack Tecnológico

- **Frontend**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Base de datos**: PostgreSQL (dev) / MySQL (desktop futuro)
- **ORM**: Prisma
- **Moneda**: Soles peruanos (S/)

## Arquitectura

El proyecto sigue una arquitectura en capas portable:

```
src/
├── domain/          # Lógica de negocio pura (sin dependencias)
├── repositories/    # Interfaces de repositorios
├── infra/
│   └── db/         # Implementaciones concretas (Prisma)
├── lib/            # Utilidades (money, utils)
└── app/            # Rutas Next.js
```

**Características clave:**
- Patrón Repository para portabilidad (Postgres → MySQL sin cambiar dominio)
- Separación estricta entre lógica de negocio e infraestructura
- Tipado fuerte con TypeScript strict
- Soporte para productos por unidad, kilogramo, con y sin código de barras

## Inicio Rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Levantar PostgreSQL

```bash
docker-compose up -d
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

El archivo `.env` debe contener:
```
DATABASE_URL="postgresql://market_user:market_pass@localhost:5432/market_pos_dev"
```

### 4. Ejecutar migraciones

```bash
npm run db:generate
npm run db:migrate
```

### 5. Cargar datos de prueba

```bash
npm run db:seed
```

Esto creará:
- 1 tienda (Bodega El Mercado)
- 2 usuarios (owner@bodega.com, cashier@bodega.com)
- 12 productos de ejemplo (incluye productos con/sin código y por peso)
- Store products con precios y stock

### 6. Ejecutar servidor de desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Scripts Disponibles

```bash
npm run dev          # Iniciar servidor de desarrollo
npm run build        # Compilar para producción
npm run start        # Iniciar servidor de producción
npm run lint         # Ejecutar ESLint

npm run db:generate  # Generar Prisma Client
npm run db:migrate   # Crear y aplicar migraciones
npm run db:studio    # Abrir Prisma Studio (GUI para DB)
npm run db:seed      # Cargar datos de prueba
npm run db:reset     # Resetear DB (⚠️ borra todos los datos)
```

## Rutas Disponibles

- `/` - Home con navegación
- `/pos` - Punto de venta (placeholder con buscador)
- `/inventory` - Inventario (listado de productos)

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/products?query=...` - Buscar productos por nombre/código (limit 20)
- `GET /api/products/scan/:barcode` - Buscar por código de barras

## Base de Datos

### Tablas principales:

- `stores` - Tiendas/bodegas
- `users` - Usuarios (OWNER/CASHIER)
- `products_master` - Catálogo compartido de productos
- `store_products` - Precio y stock por tienda
- `shifts` - Turnos de caja
- `sales` - Ventas (cabecera)
- `sale_items` - Detalle de ventas
- `movements` - Movimientos de inventario
- `store_settings` - Configuración por tienda

Ver `prisma/schema.prisma` para el esquema completo.

## Módulo Actual

**Módulo 1: Base & Arquitectura** ✅

- ✅ Estructura de capas portable
- ✅ Schema de base de datos completo
- ✅ Repositorios con interfaces
- ✅ Domain models (Cart, Money helpers)
- ✅ API mínima funcional
- ✅ UI placeholder para verificación

**Próximos módulos:**
- Módulo 2: Autenticación y roles
- Módulo 3: POS completo con checkout
- Módulo 4: Gestión de inventario
- Módulo 5: Reportes y cierre de caja

## Desarrollo

### Estructura de Datos

**Productos con código de barras:**
```typescript
{
  barcode: "7750243051234",
  internalSku: "SKU-001",
  name: "Inca Kola 500ml",
  brand: "Coca-Cola"
}
```

**Productos sin código:**
```typescript
{
  barcode: null,
  internalSku: "INT-001", // Generado automático
  name: "Pan Francés",
  unitType: "UNIT"
}
```

**Productos por peso:**
```typescript
{
  barcode: null,
  internalSku: "INT-003",
  name: "Papa Blanca",
  unitType: "KG",
  stock: null // No se controla stock unitario
}
```

### Money Helpers

```typescript
import { formatMoney, roundMoney } from '@/lib/money';

formatMoney(15.50); // "S/ 15.50"
roundMoney(15.4567); // 15.46
```

### Cart (Domain Logic)

```typescript
import { Cart } from '@/domain/cart';

const cart = new Cart();
cart.addItem(storeProduct, 2);
cart.getTotal(); // number
cart.getItems(); // CartItem[]
```

## Branding

**Colores:**
- Azul profundo: `#1F2A37` (header, títulos)
- Verde acción: `#16A34A` (botones venta)
- Gris claro: `#F3F4F6` (fondos)
- Gris medio: `#6B7280` (textos secundarios)

**Tipografía:**
- Inter (UI general)
- JetBrains Mono (precios - futuro)

**Filosofía:**
> "Escanear → Vender → Cobrar"

Sin fricción, sin pensar, nivel supermercado pero simple.

## Portabilidad

El sistema está diseñado para migrar a MySQL local (desktop offline) en fase 2:

1. Cambiar `provider = "mysql"` en `schema.prisma`
2. Crear nueva implementación `MySQLProductRepository`
3. Cero cambios en domain ni UI

## Troubleshooting

**Error: Cannot connect to database**
- Verificar que Docker esté corriendo: `docker ps`
- Verificar puerto 5432 disponible: `netstat -ano | findstr :5432`

**Error: Schema not in sync**
```bash
npm run db:generate
npm run db:migrate
```

**Ver datos en DB:**
```bash
npm run db:studio
```

## Licencia

Privado - En desarrollo

---

**Estado actual**: Módulo 1 completado ✅  
**Siguiente**: Módulo 2 - Autenticación y sesiones
