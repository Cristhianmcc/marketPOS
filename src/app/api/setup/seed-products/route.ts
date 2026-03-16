// src/app/api/setup/seed-products/route.ts
// Crea categorías y productos de ejemplo para una tienda nueva

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

// Helper para generar slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper para generar SKU
function generateSku(): string {
  return `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

// Categorías base para bodega/minimarket
const CATEGORIES_SEED = [
  { name: 'Abarrotes', icon: '🛒', color: '#F59E0B', order: 1 },
  { name: 'Bebidas', icon: '🥤', color: '#3B82F6', order: 2 },
  { name: 'Lácteos', icon: '🥛', color: '#10B981', order: 3 },
  { name: 'Limpieza', icon: '🧹', color: '#8B5CF6', order: 4 },
  { name: 'Snacks', icon: '🍿', color: '#EF4444', order: 5 },
  { name: 'Enlatados', icon: '🥫', color: '#F97316', order: 6 },
  { name: 'Licores', icon: '🍺', color: '#6366F1', order: 7 },
  { name: 'Panadería', icon: '🍞', color: '#D97706', order: 8 },
  { name: 'Golosinas', icon: '🍬', color: '#EC4899', order: 9 },
  { name: 'Higiene Personal', icon: '🧴', color: '#14B8A6', order: 10 },
];

// Productos de ejemplo por categoría
const PRODUCTS_SEED = [
  // Abarrotes
  { name: 'Arroz Costeño 1kg', category: 'Abarrotes', price: 4.50, stock: 50 },
  { name: 'Azúcar Rubia 1kg', category: 'Abarrotes', price: 3.80, stock: 40 },
  { name: 'Aceite Vegetal 1L', category: 'Abarrotes', price: 8.50, stock: 30 },
  { name: 'Fideos Spaghetti 500g', category: 'Abarrotes', price: 2.50, stock: 60 },
  { name: 'Sal de Mesa 1kg', category: 'Abarrotes', price: 1.50, stock: 35 },
  { name: 'Avena Quaker 400g', category: 'Abarrotes', price: 5.20, stock: 25 },
  { name: 'Lentejas 500g', category: 'Abarrotes', price: 4.00, stock: 30 },
  { name: 'Atún Florida 170g', category: 'Enlatados', price: 5.80, stock: 40 },
  
  // Bebidas
  { name: 'Agua San Luis 625ml', category: 'Bebidas', price: 1.50, stock: 100 },
  { name: 'Gaseosa Inca Kola 500ml', category: 'Bebidas', price: 2.50, stock: 80 },
  { name: 'Gaseosa Coca Cola 500ml', category: 'Bebidas', price: 2.50, stock: 80 },
  { name: 'Jugo Frugos 300ml', category: 'Bebidas', price: 2.00, stock: 60 },
  { name: 'Agua Cielo 2.5L', category: 'Bebidas', price: 3.50, stock: 40 },
  { name: 'Gatorade 500ml', category: 'Bebidas', price: 4.00, stock: 30 },
  { name: 'Té Lipton 400ml', category: 'Bebidas', price: 2.20, stock: 50 },
  
  // Lácteos
  { name: 'Leche Gloria 400g', category: 'Lácteos', price: 4.20, stock: 60 },
  { name: 'Leche Ideal 395g', category: 'Lácteos', price: 4.00, stock: 50 },
  { name: 'Yogurt Gloria 1L', category: 'Lácteos', price: 6.50, stock: 25 },
  { name: 'Mantequilla Laive 200g', category: 'Lácteos', price: 5.80, stock: 20 },
  { name: 'Queso Edam 250g', category: 'Lácteos', price: 8.50, stock: 15 },
  
  // Limpieza
  { name: 'Detergente Ace 500g', category: 'Limpieza', price: 5.50, stock: 40 },
  { name: 'Jabón Bolívar Barra', category: 'Limpieza', price: 2.80, stock: 50 },
  { name: 'Lejía Clorox 1L', category: 'Limpieza', price: 4.50, stock: 35 },
  { name: 'Limpiatodo Sapolio 900ml', category: 'Limpieza', price: 5.00, stock: 30 },
  { name: 'Papel Higiénico Elite x4', category: 'Limpieza', price: 6.50, stock: 40 },
  { name: 'Esponja Scotch Brite', category: 'Limpieza', price: 2.50, stock: 30 },
  
  // Snacks
  { name: 'Papas Lays 42g', category: 'Snacks', price: 2.00, stock: 50 },
  { name: 'Chifles Karinto', category: 'Snacks', price: 1.50, stock: 40 },
  { name: 'Galletas Oreo', category: 'Snacks', price: 2.50, stock: 45 },
  { name: 'Galletas Margarita', category: 'Snacks', price: 1.80, stock: 50 },
  { name: 'Doritos 45g', category: 'Snacks', price: 2.00, stock: 40 },
  
  // Licores
  { name: 'Cerveza Pilsen 630ml', category: 'Licores', price: 5.50, stock: 48 },
  { name: 'Cerveza Cristal 630ml', category: 'Licores', price: 5.50, stock: 48 },
  { name: 'Cerveza Cusqueña 330ml', category: 'Licores', price: 4.00, stock: 36 },
  { name: 'Ron Cartavio 750ml', category: 'Licores', price: 25.00, stock: 10 },
  { name: 'Pisco Quebranta 700ml', category: 'Licores', price: 35.00, stock: 8 },
  
  // Panadería
  { name: 'Pan Francés x10', category: 'Panadería', price: 2.50, stock: 20 },
  { name: 'Pan de Molde Bimbo', category: 'Panadería', price: 5.50, stock: 15 },
  { name: 'Tostadas Gali x8', category: 'Panadería', price: 3.50, stock: 25 },
  
  // Golosinas
  { name: 'Chocolate Sublime', category: 'Golosinas', price: 1.50, stock: 60 },
  { name: 'Galleta Morochas', category: 'Golosinas', price: 1.20, stock: 50 },
  { name: 'Caramelos Arcor x100', category: 'Golosinas', price: 5.00, stock: 20 },
  { name: 'Chicle Big Babol x3', category: 'Golosinas', price: 1.00, stock: 80 },
  
  // Higiene Personal
  { name: 'Shampoo Head & Shoulders 375ml', category: 'Higiene Personal', price: 15.00, stock: 20 },
  { name: 'Jabón Palmolive x3', category: 'Higiene Personal', price: 6.50, stock: 30 },
  { name: 'Pasta Dental Colgate 75ml', category: 'Higiene Personal', price: 4.50, stock: 40 },
  { name: 'Desodorante Rexona', category: 'Higiene Personal', price: 8.00, stock: 25 },
];

// ─── SEEDS ADICIONALES POR RUBRO ────────────────────────────────────────────
// BODEGA usa CATEGORIES_SEED / PRODUCTS_SEED de arriba (los originales 47 prods)
// Los demás rubros tienen sus propios datos aquí

interface RubroSeedItem {
  categories: { name: string; icon: string; color: string; order: number }[];
  products: { name: string; category: string; price: number; stock: number | null; allowDecimals?: boolean }[];
}

const RUBRO_SEEDS: Record<string, RubroSeedItem> = {

  FERRETERIA: {
    categories: [
      { name: 'Construcción',  icon: '🧱', color: '#D97706', order: 1 },
      { name: 'Herramientas',  icon: '🔧', color: '#6B7280', order: 2 },
      { name: 'Plomería',      icon: '🚿', color: '#3B82F6', order: 3 },
      { name: 'Electricidad',  icon: '⚡', color: '#F59E0B', order: 4 },
      { name: 'Pinturas',      icon: '🎨', color: '#EF4444', order: 5 },
      { name: 'Fijaciones',    icon: '🔩', color: '#8B5CF6', order: 6 },
      { name: 'Seguridad',     icon: '🔒', color: '#10B981', order: 7 },
      { name: 'Otros',         icon: '📦', color: '#9CA3AF', order: 8 },
    ],
    products: [
      { name: 'Cemento Sol 42.5kg',           category: 'Construcción',  price: 32.00, stock: 50 },
      { name: 'Ladrillo King Kong x100',      category: 'Construcción',  price: 85.00, stock: 20 },
      { name: 'Arena Fina (m3)',              category: 'Construcción',  price: 70.00, stock: null, allowDecimals: true },
      { name: 'Fierro Corrugado 1/2" x 9m',  category: 'Construcción',  price: 48.00, stock: 30 },
      { name: 'Cable NYM 2x2.5mm (m)',        category: 'Electricidad',  price: 3.50,  stock: null, allowDecimals: true },
      { name: 'Tomacorriente Doble',          category: 'Electricidad',  price: 8.50,  stock: 25 },
      { name: 'Interruptor Simple',           category: 'Electricidad',  price: 6.00,  stock: 30 },
      { name: 'Foco LED 9W',                  category: 'Electricidad',  price: 12.00, stock: 40 },
      { name: 'Tubo PVC 4" x 3m',            category: 'Plomería',      price: 22.00, stock: 20 },
      { name: 'Tubo PVC 2" x 3m',            category: 'Plomería',      price: 12.00, stock: 25 },
      { name: 'Codo PVC 4" 90°',             category: 'Plomería',      price: 4.50,  stock: 30 },
      { name: 'Llave de Paso 1/2"',          category: 'Plomería',      price: 15.00, stock: 20 },
      { name: 'Pintura Látex Blanco 4L',     category: 'Pinturas',      price: 45.00, stock: 15 },
      { name: 'Pintura Látex Color 4L',      category: 'Pinturas',      price: 48.00, stock: 12 },
      { name: 'Lija al Agua N°120',          category: 'Pinturas',      price: 2.00,  stock: 50 },
      { name: 'Tornillo 1/4" x 2" (ciento)', category: 'Fijaciones',    price: 12.00, stock: 20 },
      { name: 'Clavo 3" (kg)',               category: 'Fijaciones',    price: 8.00,  stock: null, allowDecimals: true },
      { name: 'Perno M10 x 50mm',            category: 'Fijaciones',    price: 1.50,  stock: 100 },
      { name: 'Martillo 500g',               category: 'Herramientas',  price: 35.00, stock: 8 },
      { name: 'Cinta Métrica 5m',            category: 'Herramientas',  price: 18.00, stock: 12 },
      { name: 'Destornillador Estrella',     category: 'Herramientas',  price: 12.00, stock: 15 },
      { name: 'Sierra Arco',                 category: 'Herramientas',  price: 45.00, stock: 6 },
      { name: 'Candado 40mm',                category: 'Seguridad',     price: 22.00, stock: 10 },
      { name: 'Bisagra 3" x par',            category: 'Seguridad',     price: 6.50,  stock: 20 },
    ],
  },

  POLLERIA: {
    categories: [
      { name: 'Pollos',           icon: '🍗', color: '#F59E0B', order: 1 },
      { name: 'Porciones',        icon: '🍖', color: '#EF4444', order: 2 },
      { name: 'Acompañamientos',  icon: '🍟', color: '#10B981', order: 3 },
      { name: 'Bebidas',          icon: '🥤', color: '#3B82F6', order: 4 },
      { name: 'Extras',           icon: '🧂', color: '#8B5CF6', order: 5 },
    ],
    products: [
      { name: 'Pollo a la Brasa Entero', category: 'Pollos',          price: 58.00, stock: 20 },
      { name: 'Pollo a la Brasa 1/2',    category: 'Pollos',          price: 32.00, stock: 30 },
      { name: 'Pollo a la Brasa 1/4',    category: 'Pollos',          price: 18.00, stock: 40 },
      { name: 'Pollo a la Brasa 1/8',    category: 'Porciones',       price: 10.00, stock: 50 },
      { name: 'Alitas x6',               category: 'Porciones',       price: 22.00, stock: 20 },
      { name: 'Combinado Broaster',      category: 'Porciones',       price: 25.00, stock: 15 },
      { name: 'Papas Fritas Chicas',     category: 'Acompañamientos', price: 6.00,  stock: 50 },
      { name: 'Papas Fritas Grandes',    category: 'Acompañamientos', price: 10.00, stock: 40 },
      { name: 'Ensalada Verde',          category: 'Acompañamientos', price: 5.00,  stock: 30 },
      { name: 'Arroz Chaufa',            category: 'Acompañamientos', price: 8.00,  stock: 20 },
      { name: 'Chicha Morada 1L',        category: 'Bebidas',         price: 8.00,  stock: 20 },
      { name: 'Gaseosa 1.5L',            category: 'Bebidas',         price: 7.00,  stock: 30 },
      { name: 'Agua 625ml',              category: 'Bebidas',         price: 1.50,  stock: 50 },
      { name: 'Inca Kola 600ml',         category: 'Bebidas',         price: 3.00,  stock: 40 },
      { name: 'Ají Especial (porción)',  category: 'Extras',          price: 2.00,  stock: 50 },
      { name: 'Mayonesa (porción)',      category: 'Extras',          price: 1.50,  stock: 50 },
      { name: 'Crema Huancaína',         category: 'Extras',          price: 2.50,  stock: 30 },
    ],
  },

  TALLER: {
    categories: [
      { name: 'Lubricantes', icon: '🛢️', color: '#4B5563', order: 1 },
      { name: 'Repuestos',   icon: '⚙️', color: '#6B7280', order: 2 },
      { name: 'Filtros',     icon: '🔄', color: '#3B82F6', order: 3 },
      { name: 'Accesorios',  icon: '🔧', color: '#F59E0B', order: 4 },
      { name: 'Servicios',   icon: '🛠️', color: '#10B981', order: 5 },
      { name: 'Llantería',   icon: '🏎', color: '#EF4444', order: 6 },
    ],
    products: [
      { name: 'Aceite Motor 15W40 (L)',      category: 'Lubricantes', price: 22.00,  stock: null, allowDecimals: true },
      { name: 'Aceite Motor 20W50 (L)',      category: 'Lubricantes', price: 20.00,  stock: null, allowDecimals: true },
      { name: 'Aceite Caja 80W90 (L)',       category: 'Lubricantes', price: 25.00,  stock: null, allowDecimals: true },
      { name: 'Grasa Multiusos (kg)',        category: 'Lubricantes', price: 18.00,  stock: null, allowDecimals: true },
      { name: 'Filtro de Aceite Universal',  category: 'Filtros',     price: 28.00,  stock: 20 },
      { name: 'Filtro de Aire Universal',    category: 'Filtros',     price: 35.00,  stock: 15 },
      { name: 'Filtro de Combustible',       category: 'Filtros',     price: 22.00,  stock: 15 },
      { name: 'Bujía NGK Estándar',          category: 'Repuestos',   price: 18.00,  stock: 30 },
      { name: 'Pastilla de Freno Delantera', category: 'Repuestos',   price: 85.00,  stock: 10 },
      { name: 'Correa de Distribución',      category: 'Repuestos',   price: 120.00, stock: 8 },
      { name: 'Faja Alternador',             category: 'Repuestos',   price: 45.00,  stock: 12 },
      { name: 'Líquido de Frenos 500ml',     category: 'Accesorios',  price: 18.00,  stock: 20 },
      { name: 'Líquido Refrigerante 1L',     category: 'Accesorios',  price: 15.00,  stock: 20 },
      { name: 'Silicón Negro 90g',           category: 'Accesorios',  price: 12.00,  stock: 15 },
      { name: 'Cambio de Aceite y Filtro',   category: 'Servicios',   price: 45.00,  stock: null },
      { name: 'Alineamiento y Balanceo',     category: 'Servicios',   price: 80.00,  stock: null },
      { name: 'Revisión General',            category: 'Servicios',   price: 120.00, stock: null },
      { name: 'Reparación de Frenos',        category: 'Servicios',   price: 150.00, stock: null },
      { name: 'Vulcanizado (llanta)',        category: 'Llantería',   price: 15.00,  stock: null },
      { name: 'Parche Llantas Radial',       category: 'Llantería',   price: 20.00,  stock: 20 },
    ],
  },

  LAVANDERIA: {
    categories: [
      { name: 'Lavado',           icon: '👕', color: '#3B82F6', order: 1 },
      { name: 'Planchado',        icon: '📲', color: '#F59E0B', order: 2 },
      { name: 'Tintorería',       icon: '🎨', color: '#8B5CF6', order: 3 },
      { name: 'Seco Lavado',      icon: '🧺', color: '#10B981', order: 4 },
      { name: 'Servicio Especial',icon: '✨', color: '#EF4444', order: 5 },
    ],
    products: [
      { name: 'Lavado Camisa',         category: 'Lavado',           price: 5.00,  stock: null },
      { name: 'Lavado Pantalón',       category: 'Lavado',           price: 6.00,  stock: null },
      { name: 'Lavado Polo',           category: 'Lavado',           price: 4.00,  stock: null },
      { name: 'Lavado Casaca/Saco',    category: 'Lavado',           price: 10.00, stock: null },
      { name: 'Lavado Sábana Simple',  category: 'Lavado',           price: 8.00,  stock: null },
      { name: 'Lavado Sábana Doble',   category: 'Lavado',           price: 10.00, stock: null },
      { name: 'Lavado Edredón',        category: 'Lavado',           price: 18.00, stock: null },
      { name: 'Lavado Toalla',         category: 'Lavado',           price: 4.00,  stock: null },
      { name: 'Lavado Vestido',        category: 'Lavado',           price: 9.00,  stock: null },
      { name: 'Planchado Camisa',      category: 'Planchado',        price: 3.00,  stock: null },
      { name: 'Planchado Pantalón',    category: 'Planchado',        price: 3.50,  stock: null },
      { name: 'Planchado Vestido',     category: 'Planchado',        price: 5.00,  stock: null },
      { name: 'Planchado Casaca',      category: 'Planchado',        price: 6.00,  stock: null },
      { name: 'Lavado en Seco Camisa', category: 'Seco Lavado',      price: 12.00, stock: null },
      { name: 'Lavado en Seco Terno',  category: 'Seco Lavado',      price: 35.00, stock: null },
      { name: 'Teñido Camisa',         category: 'Tintorería',       price: 20.00, stock: null },
      { name: 'Teñido Pantalón',       category: 'Tintorería',       price: 25.00, stock: null },
      { name: 'Quitamanchas Especial', category: 'Servicio Especial',price: 15.00, stock: null },
      { name: 'Costura Básica',        category: 'Servicio Especial',price: 8.00,  stock: null },
    ],
  },

  ACCESORIOS: {
    categories: [
      { name: 'Bisutería', icon: '💍', color: '#F59E0B', order: 1 },
      { name: 'Bolsos',    icon: '👜', color: '#EC4899', order: 2 },
      { name: 'Calzado',   icon: '👟', color: '#3B82F6', order: 3 },
      { name: 'Ropa',      icon: '👗', color: '#8B5CF6', order: 4 },
      { name: 'Relojes',   icon: '⌚', color: '#6B7280', order: 5 },
      { name: 'Lentes',    icon: '🕶️', color: '#10B981', order: 6 },
      { name: 'Otros',     icon: '📦', color: '#9CA3AF', order: 7 },
    ],
    products: [
      { name: 'Aretes Dorados',           category: 'Bisutería', price: 15.00, stock: 20 },
      { name: 'Aretes Plateados',         category: 'Bisutería', price: 12.00, stock: 20 },
      { name: 'Collar Fino',              category: 'Bisutería', price: 25.00, stock: 15 },
      { name: 'Pulsera Tejida',           category: 'Bisutería', price: 10.00, stock: 25 },
      { name: 'Anillo Ajustable',         category: 'Bisutería', price: 8.00,  stock: 30 },
      { name: 'Bolso de Cuero Pequeño',   category: 'Bolsos',    price: 65.00, stock: 8 },
      { name: 'Bolso de Tela Mediano',    category: 'Bolsos',    price: 35.00, stock: 12 },
      { name: 'Cartera Dama',             category: 'Bolsos',    price: 45.00, stock: 10 },
      { name: 'Mochila Casual',           category: 'Bolsos',    price: 55.00, stock: 8 },
      { name: 'Zapatillas Casual T39',    category: 'Calzado',   price: 85.00, stock: 6 },
      { name: 'Zapatillas Casual T40',    category: 'Calzado',   price: 85.00, stock: 6 },
      { name: 'Sandalias Dama',           category: 'Calzado',   price: 55.00, stock: 8 },
      { name: 'Polo Básico S',            category: 'Ropa',      price: 25.00, stock: 10 },
      { name: 'Polo Básico M',            category: 'Ropa',      price: 25.00, stock: 10 },
      { name: 'Polo Básico L',            category: 'Ropa',      price: 25.00, stock: 10 },
      { name: 'Reloj Analógico Clásico',  category: 'Relojes',   price: 95.00, stock: 6 },
      { name: 'Reloj Digital Sport',      category: 'Relojes',   price: 75.00, stock: 8 },
      { name: 'Lentes Oscuros Unisex',    category: 'Lentes',    price: 35.00, stock: 12 },
      { name: 'Lentes Con Aumento +1.5',  category: 'Lentes',    price: 25.00, stock: 10 },
    ],
  },

  HOSTAL: {
    categories: [
      { name: 'Habitaciones', icon: '🛏️', color: '#3B82F6', order: 1 },
      { name: 'Desayunos',    icon: '☕',  color: '#F59E0B', order: 2 },
      { name: 'Bebidas',      icon: '🥤', color: '#10B981', order: 3 },
      { name: 'Servicios',    icon: '🛎️', color: '#8B5CF6', order: 4 },
      { name: 'Extras',       icon: '📦', color: '#9CA3AF', order: 5 },
    ],
    products: [
      { name: 'Habitación Simple (noche)',     category: 'Habitaciones', price: 60.00,  stock: 5 },
      { name: 'Habitación Doble (noche)',      category: 'Habitaciones', price: 90.00,  stock: 4 },
      { name: 'Habitación Matrimonial (noche)',category: 'Habitaciones', price: 90.00,  stock: 3 },
      { name: 'Habitación Triple (noche)',     category: 'Habitaciones', price: 120.00, stock: 2 },
      { name: 'Suite (noche)',                 category: 'Habitaciones', price: 180.00, stock: 1 },
      { name: 'Desayuno Continental',          category: 'Desayunos',   price: 15.00,  stock: null },
      { name: 'Desayuno Americano',            category: 'Desayunos',   price: 20.00,  stock: null },
      { name: 'Café Americano',               category: 'Bebidas',     price: 5.00,   stock: 30 },
      { name: 'Gaseosa 500ml',                category: 'Bebidas',     price: 4.00,   stock: 30 },
      { name: 'Agua 625ml',                   category: 'Bebidas',     price: 2.00,   stock: 50 },
      { name: 'Servicio de Lavandería',        category: 'Servicios',   price: 25.00,  stock: null },
      { name: 'Llamada Local',                category: 'Servicios',   price: 2.00,   stock: null },
      { name: 'Estacionamiento (día)',        category: 'Servicios',   price: 10.00,  stock: null },
      { name: 'Toalla Extra',                 category: 'Extras',      price: 5.00,   stock: 15 },
      { name: 'Almohada Extra',               category: 'Extras',      price: 5.00,   stock: 10 },
    ],
  },

  BOTICA: {
    categories: [
      { name: 'Analgésicos',      icon: '💊', color: '#EF4444', order: 1 },
      { name: 'Antibióticos',     icon: '🧬', color: '#3B82F6', order: 2 },
      { name: 'Vitaminas',        icon: '🌿', color: '#10B981', order: 3 },
      { name: 'Higiene',          icon: '🧴', color: '#8B5CF6', order: 4 },
      { name: 'Primeros Auxilios',icon: '🩹', color: '#F97316', order: 5 },
      { name: 'Otros',            icon: '📦', color: '#9CA3AF', order: 6 },
    ],
    products: [
      { name: 'Paracetamol 500mg x10',   category: 'Analgésicos',      price: 2.50,  stock: 50 },
      { name: 'Ibuprofeno 400mg x8',     category: 'Analgésicos',      price: 3.50,  stock: 40 },
      { name: 'Naproxeno 500mg x10',     category: 'Analgésicos',      price: 4.00,  stock: 30 },
      { name: 'Amoxicilina 500mg x12',   category: 'Antibióticos',     price: 12.00, stock: 20 },
      { name: 'Azitromicina 500mg x3',   category: 'Antibióticos',     price: 15.00, stock: 15 },
      { name: 'Vitamina C 1g x10',       category: 'Vitaminas',        price: 6.00,  stock: 30 },
      { name: 'Complejo B x30',          category: 'Vitaminas',        price: 8.50,  stock: 25 },
      { name: 'Vitamina D3 1000UI x30',  category: 'Vitaminas',        price: 12.00, stock: 20 },
      { name: 'Jabón Antiséptico',       category: 'Higiene',          price: 5.50,  stock: 30 },
      { name: 'Alcohol 70° 250ml',       category: 'Higiene',          price: 4.50,  stock: 40 },
      { name: 'Gel Desinfectante 250ml', category: 'Higiene',          price: 8.00,  stock: 25 },
      { name: 'Algodón 100g',            category: 'Primeros Auxilios',price: 4.00,  stock: 30 },
      { name: 'Esparadrapo 5m',          category: 'Primeros Auxilios',price: 5.50,  stock: 25 },
      { name: 'Venda Elástica 4"',       category: 'Primeros Auxilios',price: 6.00,  stock: 20 },
      { name: 'Termómetro Digital',      category: 'Otros',            price: 25.00, stock: 10 },
    ],
  },
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json({ error: 'No autenticado o sin tienda asignada' }, { status: 401 });
    }

    const storeId = user.storeId;

    // Obtener el businessProfile para elegir el seed correcto
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { businessProfile: true },
    });
    const profile = store?.businessProfile ?? 'BODEGA';

    // Verificar si ya hay categorías
    const existingCategories = await prisma.category.count({ where: { storeId } });
    if (existingCategories > 0) {
      return NextResponse.json({
        success: true,
        message: 'La tienda ya tiene datos',
        categoriesCreated: 0,
        productsCreated: 0,
      });
    }

    // Elegir el seed según el rubro (BODEGA usa los arrays originales)
    const rubroSeed = RUBRO_SEEDS[profile];
    const categoriesToCreate: RubroSeedItem['categories'] = rubroSeed ? rubroSeed.categories : CATEGORIES_SEED;
    const productsToCreate: RubroSeedItem['products']     = rubroSeed ? rubroSeed.products   : (PRODUCTS_SEED as RubroSeedItem['products']);

    console.log(`[seed-products] Using seed for profile: ${profile} (${categoriesToCreate.length} cats, ${productsToCreate.length} prods)`);

    // Obtener unidad base (NIU) — si no existe, crearla automáticamente
    let baseUnit = await prisma.unit.findFirst({
      where: { sunatCode: 'NIU' },
    });

    if (!baseUnit) {
      console.log('[seed-products] NIU unit not found, creating it...');
      baseUnit = await prisma.unit.create({
        data: {
          code: 'UNIT',
          sunatCode: 'NIU',
          name: 'Unidad',
          displayName: 'UNIDAD (BIENES)',
          symbol: 'UND',
          kind: 'GOODS',
          allowDecimals: false,
          precision: 0,
          isBase: true,
          sortOrder: 1,
        },
      });
      console.log('[seed-products] NIU unit created:', baseUnit.id);
    }

    // Obtener (o crear) unidad decimal para productos vendidos por fracción
    let decimalUnit: typeof baseUnit | null = null;
    const needsDecimal = productsToCreate.some(p => 'allowDecimals' in p && p.allowDecimals);
    if (needsDecimal) {
      // Buscar unidad decimal existente (KGM = kg, o cualquiera con allowDecimals)
      decimalUnit = await prisma.unit.findFirst({ where: { allowDecimals: true } });
      if (!decimalUnit) {
        // Crear unidad KG con sunatCode KGM (no NIU, que tiene @unique y ya está en uso)
        decimalUnit = await prisma.unit.create({
          data: {
            code: 'KG',
            sunatCode: 'KGM',
            name: 'Kilogramo',
            displayName: 'KILOGRAMO',
            symbol: 'KG',
            kind: 'GOODS',
            allowDecimals: true,
            precision: 3,
            isBase: true,
            sortOrder: 2,
          },
        });
      }
    }

    // Crear categorías
    const categoryMap = new Map<string, string>();
    
    for (const cat of categoriesToCreate) {
      const slug = generateSlug(cat.name);
      const created = await prisma.category.create({
        data: {
          storeId,
          name: cat.name,
          slug: slug,
          icon: cat.icon,
          color: cat.color,
          sortOrder: cat.order,
          active: true,
        },
      });
      categoryMap.set(cat.name, created.id);
    }

    // Crear productos
    let productsCreated = 0;
    
    for (const prod of productsToCreate) {
      // Verificar que la categoría existe en el map
      if (!categoryMap.has(prod.category)) continue;

      const useDecimal = 'allowDecimals' in prod && prod.allowDecimals && decimalUnit;
      const unitId = useDecimal ? decimalUnit!.id : baseUnit.id;

      // Crear ProductMaster
      const master = await prisma.productMaster.create({
        data: {
          internalSku: generateSku(),
          name: prod.name,
          category: prod.category,
          unitType: useDecimal ? 'KG' : 'UNIT',
          baseUnitId: unitId,
        },
      });

      // Crear StoreProduct
      await prisma.storeProduct.create({
        data: {
          storeId,
          productId: master.id,
          price: prod.price,
          stock: prod.stock,
          minStock: prod.stock !== null ? 5 : null,
          active: true,
        },
      });

      productsCreated++;
    }

    console.log(`[seed-products] Created ${categoriesToCreate.length} categories and ${productsCreated} products for store ${storeId} (profile: ${profile})`);

    return NextResponse.json({
      success: true,
      categoriesCreated: categoriesToCreate.length,
      productsCreated,
      message: 'Datos de ejemplo creados correctamente',
    });
  } catch (error) {
    console.error('[seed-products] Error:', error);
    return NextResponse.json(
      { error: 'Error al crear datos de ejemplo: ' + (error instanceof Error ? error.message : 'Error desconocido') },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.storeId) {
      return NextResponse.json({ needsSeed: false });
    }

    const categoryCount = await prisma.category.count({ where: { storeId: user.storeId } });
    const productCount = await prisma.storeProduct.count({ where: { storeId: user.storeId } });

    return NextResponse.json({
      needsSeed: categoryCount === 0 && productCount === 0,
      categoryCount,
      productCount,
    });
  } catch {
    return NextResponse.json({ needsSeed: false });
  }
}
