/**
 * Reglas compartidas de órdenes de trabajo (taller y lavandería).
 */

export type WorkOrderStatusName = 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'CLOSED' | 'CANCELLED';

const DEFAULT_LABELS: Record<WorkOrderStatusName, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobado',
  IN_PROGRESS: 'En Proceso',
  READY: 'Listo',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

const PROFILE_LABELS: Partial<Record<string, Partial<Record<WorkOrderStatusName, string>>>> = {
  LAVANDERIA: { APPROVED: 'Recibido', CLOSED: 'Entregado' },
};

export function workOrderStatusLabels(profile?: string | null): Record<WorkOrderStatusName, string> {
  return { ...DEFAULT_LABELS, ...(profile ? PROFILE_LABELS[profile] : undefined) };
}

/**
 * Cambios de estado permitidos por edición. CLOSED solo se alcanza cobrando
 * (convert-to-sale) y CANCELLED solo por anulación (DELETE).
 */
const EDIT_TRANSITIONS: Record<WorkOrderStatusName, WorkOrderStatusName[]> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['DRAFT', 'IN_PROGRESS', 'READY'],
  IN_PROGRESS: ['APPROVED', 'READY'],
  READY: ['IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

export function canEditTransition(from: WorkOrderStatusName, to: WorkOrderStatusName): boolean {
  return from === to || EDIT_TRANSITIONS[from].includes(to);
}

export class WorkOrderRuleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'WorkOrderRuleError';
  }
}

/**
 * Valida cantidad y precio de un item. Las unidades sin decimales (prendas,
 * unidades) exigen enteros. Solo el dueño puede cambiar el precio del catálogo.
 */
export function resolveItemPrice(input: {
  itemName: string;
  quantityBase: number;
  allowDecimals: boolean;
  catalogPrice: number;
  requestedPrice: number | undefined;
  isOwner: boolean;
}): number {
  const { itemName, quantityBase } = input;
  if (!Number.isFinite(quantityBase) || quantityBase <= 0) {
    throw new WorkOrderRuleError(`${itemName}: la cantidad debe ser mayor a 0`);
  }
  if (!input.allowDecimals && !Number.isInteger(quantityBase)) {
    throw new WorkOrderRuleError(`${itemName}: se cobra por unidad entera, no admite ${quantityBase}`);
  }
  if (!input.isOwner || input.requestedPrice === undefined || input.requestedPrice === null) {
    return input.catalogPrice;
  }
  if (!Number.isFinite(input.requestedPrice) || input.requestedPrice < 0) {
    throw new WorkOrderRuleError(`${itemName}: precio inválido`);
  }
  return input.requestedPrice;
}

/** Recargo express redondeado a céntimos sobre el subtotal de la orden. */
export function expressSurchargeFor(subtotal: number, percent: number, express: boolean): number {
  if (!express) return 0;
  const safePercent = Math.min(Math.max(Number.isFinite(percent) ? percent : 0, 0), 200);
  return Math.round(subtotal * safePercent + 1e-6) / 100;
}

/**
 * Fecha prometida de entrega: opcional; `null` la borra. No admite fechas
 * anteriores a hoy (margen de 12 h por zona horaria).
 */
export function parsePromisedAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new WorkOrderRuleError('Fecha prometida inválida');
  if (date.getTime() < Date.now() - 12 * 3_600_000) {
    throw new WorkOrderRuleError('La fecha prometida no puede ser anterior a hoy');
  }
  return date;
}

/**
 * Trabajo libre (lavandería): descripción y total escritos al recibir, sin
 * servicio de catálogo. Los kilos o el detalle van en `itemContent` y la
 * cantidad es 1, para que el comprobante cuadre sin redondeos por kilo.
 */
export function freeWorkLine(input: { itemName?: unknown; itemContent?: unknown; unitPrice?: unknown }) {
  const itemName = typeof input.itemName === 'string' ? input.itemName.trim() : '';
  if (itemName.length < 2 || itemName.length > 120) {
    throw new WorkOrderRuleError('Describe el trabajo (por ejemplo "Lavado de ropa")');
  }
  const price = Number(input.unitPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new WorkOrderRuleError(`${itemName}: escribe el precio a cobrar`);
  }
  const content = typeof input.itemContent === 'string' ? input.itemContent.trim().slice(0, 60) : '';
  return { itemName, itemContent: content || null };
}
