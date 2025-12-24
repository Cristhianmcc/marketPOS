// Money utilities for Peruvian Soles

/**
 * Format number to Peruvian Soles (S/)
 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'S/ 0.00';
  }
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `S/ ${numAmount.toFixed(2)}`;
}

/**
 * Parse string to number (remove S/ prefix and parse)
 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Round to 2 decimals (for monetary calculations)
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Add two monetary values safely
 */
export function addMoney(a: number, b: number): number {
  return roundMoney(a + b);
}

/**
 * Multiply monetary value safely
 */
export function multiplyMoney(amount: number, multiplier: number): number {
  return roundMoney(amount * multiplier);
}
