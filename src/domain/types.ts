// Domain types (pure, no DB dependencies)
// Aligned with schema.prisma

export type UnitType = 'UNIT' | 'KG';
export type UserRole = 'OWNER' | 'CASHIER';
export type PaymentMethod = 'CASH' | 'YAPE' | 'PLIN' | 'CARD';
export type MovementType = 'SALE' | 'PURCHASE' | 'ADJUSTMENT';

export interface Product {
  id: string;
  barcode: string | null;
  internalSku: string;
  name: string;
  brand: string | null;
  content: string | null;
  category: string;
  unitType: UnitType; // ✅ unitType ahora en Product
  baseUnitId?: string | null; // ✅ MÓDULO F2.1: Unidad SUNAT
  imageUrl: string | null;
  isGlobal?: boolean; // ✅ MÓDULO 18.1: Catálogo Global
}

export interface StoreProduct {
  id: string;
  storeId: string;
  productId: string;
  price: number;
  stock: number | null;
  minStock: number | null;
  active: boolean;
  product?: Product;
}

export interface Sale {
  id: string;
  storeId: string;
  userId: string;
  shiftId: string | null;
  saleNumber: number;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number | null;
  changeAmount: number | null;
  printedAt: Date | null;
  createdAt: Date;
  items: SaleItem[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  storeProductId: string;
  productName: string; // snapshot
  productContent: string | null; // snapshot
  unitType: UnitType; // snapshot
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Shift {
  id: string;
  storeId: string;
  openedById: string;
  closedById: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  notes: string | null;
}

export interface ShiftWithUsers extends Shift {
  openedBy: {
    id: string;
    name: string;
    email: string;
  };
  closedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface OpenShiftData {
  openingCash: number;
}

export interface CloseShiftData {
  closingCash: number;
  notes?: string;
}

export interface Movement {
  id: string;
  storeId: string;
  storeProductId: string;
  type: MovementType;
  quantity: number;
  unitPrice: number | null;
  total: number | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  storeId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface Store {
  id: string;
  name: string;
  ruc: string | null;
  address: string | null;
  phone: string | null;
}

export interface StoreSettings {
  id: string;
  storeId: string;
  ticketFooter: string | null;
  taxRate: number;
}
