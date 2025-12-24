// Repository interface for Shifts (domain layer)

import { Shift, ShiftWithUsers, OpenShiftData, CloseShiftData } from '@/domain/types';

export interface IShiftRepository {
  /**
   * Get current open shift for a user
   */
  getCurrentShift(storeId: string, userId: string): Promise<Shift | null>;

  /**
   * Create a new shift
   */
  create(storeId: string, userId: string, data: OpenShiftData): Promise<Shift>;

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
    to?: Date
  ): Promise<ShiftWithUsers[]>;

  /**
   * Check if user has an open shift
   */
  hasOpenShift(storeId: string, userId: string): Promise<boolean>;

  /**
   * Calculate cash sales for a shift
   */
  getCashSalesTotal(shiftId: string): Promise<number>;
}
