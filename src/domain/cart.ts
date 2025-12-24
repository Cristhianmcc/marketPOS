// Cart domain logic (pure, no dependencies)

import { StoreProduct } from './types';

export interface CartItem {
  storeProduct: StoreProduct;
  quantity: number;
  subtotal: number;
}

export class Cart {
  private items: Map<string, CartItem> = new Map();

  addItem(storeProduct: StoreProduct, quantity: number): void {
    const existingItem = this.items.get(storeProduct.id);

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      const subtotal = newQuantity * storeProduct.price;
      this.items.set(storeProduct.id, {
        ...existingItem,
        quantity: newQuantity,
        subtotal,
      });
    } else {
      const subtotal = quantity * storeProduct.price;
      this.items.set(storeProduct.id, {
        storeProduct,
        quantity,
        subtotal,
      });
    }
  }

  removeItem(storeProductId: string): void {
    this.items.delete(storeProductId);
  }

  updateQuantity(storeProductId: string, quantity: number): void {
    const item = this.items.get(storeProductId);
    if (!item) return;

    if (quantity <= 0) {
      this.removeItem(storeProductId);
      return;
    }

    const subtotal = quantity * item.storeProduct.price;
    this.items.set(storeProductId, {
      ...item,
      quantity,
      subtotal,
    });
  }

  getItems(): CartItem[] {
    return Array.from(this.items.values());
  }

  getTotal(): number {
    return Array.from(this.items.values()).reduce((sum, item) => sum + item.subtotal, 0);
  }

  getItemCount(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  isEmpty(): boolean {
    return this.items.size === 0;
  }
}
