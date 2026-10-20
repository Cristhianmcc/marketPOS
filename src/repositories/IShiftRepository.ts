// Repository interface for Shifts (domain layer)

import { Shift, ShiftWithUsers, OpenShiftData, CloseShiftData } from '@/domain/types';

export interface IShiftRepository {
  /**
   * Get current open shift for a user
   */
  getCurrentShift(storeId: string, userId: string): Promise<Shift | null>;

  /**
   * Create a shift only when the same user has no open shift in the store.
   * Returns null when another request already opened it.
   */
  createIfNone(storeId: string, userId: string, data: OpenShiftData): Promise<Shift | null>;

  /**
   * Find shift by ID
   */
  findById(shiftId: string, storeId: string): Promise<Shift | null>;

  /**
   * Close a shift with closing data
   */
  close(
    shiftId: string,
    closedById: string,
    data: CloseShiftData,
    expectedCash: number,
    difference: number
  ): Promise<Shift>;

  /**
   * Get shift history
   * - If userId provided (CASHIER): only their shifts
   * - If userId null (OWNER): all shifts in store
   */
  getHistory(
    storeId: string,
    userId: string | null,
    from?: Date,
    to?: Date,
    page?: number,
    limit?: number,
    search?: string
  ): Promise<{ shifts: ShiftWithUsers[]; total: number }>;

  /**
   * Check if user has an open shift
   */
  hasOpenShift(storeId: string, userId: string): Promise<boolean>;

  /**
   * Calculate cash sales for a shift
   */
  getCashSalesTotal(shiftId: string): Promise<number>;

  /**
   * Get sales totals grouped by payment method for a shift
   */
  getSalesByMethod(shiftId: string): Promise<{ byMethod: Record<string, { total: number; count: number }>; mixedInfo: { count: number; total: number; details: string[]; splitTotals: Record<string, number> } }>;

  /**
   * Get total cost and profit for a shift (based on sale_items.cost_price snapshots)
   */
  getShiftProfit(shiftId: string): Promise<{ totalSales: number; totalCost: number; profit: number }>;

  /**
   * Get profit breakdown by product for a shift
   */
  getShiftProfitByProduct(shiftId: string): Promise<Array<{
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    totalCost: number;
    totalRevenue: number;
    profit: number;
  }>>;
}
