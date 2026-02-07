/**
 * Tipos centralizados para el módulo POS
 * Extraídos de page.tsx para mantener consistencia
 */

export interface StoreProduct {
  id: string;
  price: number;
  stock: number | null;
  active: boolean;
  product: {
    id: string;
    name: string;
    brand: string | null;
    content: string | null;
    category: string;
    unitType: 'UNIT' | 'KG';
    barcode: string | null;
    internalSku: string;
    imageUrl?: string | null;
  };
}

export interface CartItem {
  storeProduct: StoreProduct;
  quantity: number;
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  // Promociones automáticas
  promotionType?: 'TWO_FOR_ONE' | 'PACK_PRICE' | 'HAPPY_HOUR' | null;
  promotionName?: string | null;
  promotionDiscount?: number;
  // Promociones por categoría (Módulo 14.2-B)
  categoryPromoName?: string | null;
  categoryPromoType?: 'PERCENT' | 'AMOUNT' | null;
  categoryPromoDiscount?: number;
  // Promociones por volumen (Módulo 14.2-C1)
  volumePromoName?: string | null;
  volumePromoQty?: number | null;
  volumePromoDiscount?: number;
  // Promociones n-ésimo con descuento (Módulo 14.2-C2)
  nthPromoName?: string | null;
  nthPromoQty?: number | null;
  nthPromoPercent?: number | null;
  nthPromoDiscount?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  totalBalance: number;
}

export interface OperationalLimits {
  maxDiscountPercent: number | null;
  maxManualDiscountAmount: number | null;
  maxSaleTotal: number | null;
  maxItemsPerSale: number | null;
  maxReceivableBalance: number | null;
}

export interface AppliedCoupon {
  code: string;
  discount: number;
  type: string;
  value: number;
}

export interface CompletedSale {
  id: string;
  total: number;
}

export type PaymentMethod = 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
export type DiscountType = 'PERCENT' | 'AMOUNT';
