# Guía de Instalación y Ejecución

## ⚠️ Requisitos Previos

1. **Docker Desktop** debe estar instalado y corriendo
   - Descargar: https://www.docker.com/products/docker-desktop/
   - Después de instalar, asegúrate que Docker Desktop esté ejecutándose (ícono en la bandeja del sistema)

2. **Node.js 18+** (ya instalado ✅)

---

## 🚀 Pasos de Instalación

### 1. Dependencias ya instaladas ✅

```bash
npm install
```

### 2. Iniciar Docker Desktop

**IMPORTANTE**: Antes de continuar, abre Docker Desktop y espera que se inicie completamente.

Para verificar que está corriendo:

```bash
docker ps
```

Debería mostrar una tabla (aunque esté vacía).

### 3. Levantar PostgreSQL

```bash
docker-compose up -d
```

Verificar que esté corriendo:

```bash
docker ps
```

Deberías ver un contenedor llamado `market-pos-db`.

### 4. Configurar base de datos

El archivo `.env` ya está creado con la configuración correcta.

Generar Prisma Client:

```bash
npm run db:generate
```

Aplicar migraciones:

```bash
npm run db:migrate
```

Cuando pregunte por el nombre de la migración, escribe: `init`

### 5. Cargar datos de prueba

```bash
npm run db:seed
```

Esto creará:
- ✅ 1 tienda (Bodega El Mercado)
- ✅ 2 usuarios (owner, cashier)
- ✅ 12 productos de ejemplo
- ✅ Precios y stock

### 6. Iniciar servidor

```bash
npm run dev
```

Abre en navegador: **http://localhost:3000**

---

## 🧪 Verificar que todo funciona

### Opción A: Navegador

1. Ve a http://localhost:3000
2. Haz clic en "Punto de Venta"
3. Busca "inca" o "papa"
4. Deberías ver resultados

### Opción B: API directa

```bash
# Health check
curl http://localhost:3000/api/health

# Buscar productos
curl "http://localhost:3000/api/products?query=inca"

# Escanear código de barras
curl http://localhost:3000/api/products/scan/7750243051234
```

### Opción C: Prisma Studio (GUI para ver la DB)

```bash
npm run db:studio
```

Se abrirá en http://localhost:5555

---

## 📊 Datos de prueba creados

**Tienda:**
- Nombre: Bodega El Mercado
- RUC: 20123456789

**Usuarios:**
- owner@bodega.com (OWNER)
- cashier@bodega.com (CASHIER)

**Productos con código de barras (6):**
- Inca Kola 500ml (7750243051234) - S/ 2.50
- Inca Kola 1L - S/ 4.00
- Chizitos 30g - S/ 1.00
- Sublime Clásico - S/ 1.50
- Leche Gloria 1L - S/ 5.50
- Pilsen Callao 650ml - S/ 6.00

**Productos sin código de barras (2):**
- Pan Francés (INT-001) - S/ 0.30
- Huevos (INT-002) - S/ 0.50

**Productos por peso (4):**
- Papa Blanca (INT-003) - S/ 3.50/kg
- Cebolla Roja (INT-004) - S/ 4.00/kg
- Arroz a Granel (INT-005) - S/ 4.20/kg
- Azúcar Rubia (INT-006) - S/ 3.80/kg

---

## 🛠️ Comandos Útiles

```bash
# Ver logs de Docker
docker-compose logs -f

# Detener PostgreSQL
docker-compose down

# Reiniciar base de datos (⚠️ borra todo)
npm run db:reset

# Ver estructura de DB con GUI
npm run db:studio

# Compilar para producción
npm run build
npm run start
```

---

## ❌ Troubleshooting

### Error: "Docker no encontrado"

**Solución**: Instalar y ejecutar Docker Desktop primero.

### Error: "Port 5432 already in use"

**Solución**: Ya tienes PostgreSQL corriendo. Opciones:

1. Detener el Postgres local (recomendado para dev)
2. Cambiar el puerto en `docker-compose.yml` y `.env`

### Error: "Cannot connect to database"

**Solución**:

```bash
# Verificar que Docker esté corriendo
docker ps

# Si no aparece el contenedor, levantarlo de nuevo
docker-compose up -d

# Verificar logs
docker-compose logs postgres
```

### Error en migraciones

**Solución**:

```bash
# Limpiar todo y empezar de nuevo
npm run db:reset

# O manual:
docker-compose down -v
docker-compose up -d
npm run db:migrate
npm run db:seed
```

---

## ✅ Estado Actual

**Módulo 1: Base & Arquitectura** - COMPLETADO

- ✅ Arquitectura en capas portable
- ✅ Base de datos con Prisma (Postgres)
- ✅ Repository Pattern implementado
- ✅ Domain logic (Cart, Money helpers)
- ✅ API REST mínima funcional
- ✅ UI placeholder para navegación
- ✅ Seeds con datos realistas

**Próximo paso**: Módulo 2 - Autenticación y gestión de usuarios

---

## 📁 Estructura del Proyecto

```
market/
├── prisma/
│   ├── schema.prisma    # Esquema de BD
│   └── seed.ts          # Datos de prueba
├── src/
│   ├── app/             # Next.js App Router
│   │   ├── api/         # API Routes
│   │   ├── pos/         # Página POS
│   │   └── inventory/   # Página inventario
│   ├── domain/          # Lógica pura
│   │   ├── types.ts     # Tipos del dominio
│   │   └── cart.ts      # Lógica del carrito
│   ├── repositories/    # Interfaces
│   ├── infra/db/        # Implementaciones Prisma
│   └── lib/             # Utilidades
├── docker-compose.yml   # PostgreSQL
├── package.json
└── README.md
```

---

**¿Todo listo?** Ejecuta:

```bash
npm run dev
```

Y abre http://localhost:3000 🚀
