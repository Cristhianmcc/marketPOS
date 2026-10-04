export interface AdjustmentMetadata {
  kind: 'ADJUSTMENT';
  reasonCode: string;
  reason: string;
  referenceDocType: 'FACTURA' | 'BOLETA';
  referenceDocNumber: string;
  amount: number;
  cancelSaleOnAcceptance?: boolean;
}

export function serializeAdjustmentMetadata(value: AdjustmentMetadata): string {
  return JSON.stringify(value);
}

export function parseAdjustmentMetadata(value: string | null | undefined): AdjustmentMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AdjustmentMetadata>;
    if (
      parsed.kind !== 'ADJUSTMENT' ||
      typeof parsed.reasonCode !== 'string' ||
      typeof parsed.reason !== 'string' ||
      (parsed.referenceDocType !== 'FACTURA' && parsed.referenceDocType !== 'BOLETA') ||
      typeof parsed.referenceDocNumber !== 'string' ||
      typeof parsed.amount !== 'number'
    ) return null;
    return parsed as AdjustmentMetadata;
  } catch {
    return null;
  }
}
