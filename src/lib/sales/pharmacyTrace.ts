import { FeatureFlagKey, Prisma } from '@prisma/client';

export class PharmacyTraceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'PharmacyTraceError';
  }
}

export interface PharmacyTraceProductLine {
  saleItemId: string;
  productName: string;
  genericName: string | null;
  concentration: string | null;
  laboratory: string | null;
  quantity: Prisma.Decimal;
  batchBreakdown: Prisma.JsonValue | null;
  requiresPrescription: boolean;
  prescriptionNumber?: string | null;
  observation?: string | null;
}

interface PharmacyTraceInput {
  storeId: string;
  userId: string;
  sale: {
    id: string;
    saleNumber: number;
    createdAt: Date;
  };
  productLines: PharmacyTraceProductLine[];
  patientId?: string | null;
  prescribedBy?: string | null;
  cmpNumber?: string | null;
  consultReason?: string | null;
}

function cleanOptional(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function firstBatchNumber(value: Prisma.JsonValue | null): string | null {
  if (!Array.isArray(value)) return null;

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const batchNumber = (entry as Record<string, unknown>).batchNumber;
    if (typeof batchNumber === 'string' && batchNumber.trim()) {
      return batchNumber.trim();
    }
  }

  return null;
}

export async function registerPharmacyTrace(
  tx: Prisma.TransactionClient,
  input: PharmacyTraceInput
): Promise<{ patientMedications: number; controlledBookEntries: number }> {
  if (input.productLines.length === 0) {
    return { patientMedications: 0, controlledBookEntries: 0 };
  }

  const controlledFlag = await tx.featureFlag.findUnique({
    where: {
      storeId_key: {
        storeId: input.storeId,
        key: FeatureFlagKey.ENABLE_CONTROLLED_BOOK,
      },
    },
    select: { enabled: true },
  });
  const controlledLines = controlledFlag?.enabled
    ? input.productLines.filter((line) => line.requiresPrescription)
    : [];

  if (controlledLines.length > 0 && !input.patientId) {
    throw new PharmacyTraceError(
      'PATIENT_REQUIRED',
      422,
      'Selecciona un paciente válido para vender productos sujetos al libro de controlados'
    );
  }

  const patient = input.patientId
    ? await tx.patient.findFirst({
        where: {
          id: input.patientId,
          storeId: input.storeId,
          active: true,
        },
        select: { id: true, name: true, dni: true },
      })
    : null;

  if (input.patientId && !patient) {
    throw new PharmacyTraceError(
      'PATIENT_NOT_FOUND',
      404,
      'El paciente no existe, está inactivo o pertenece a otra tienda'
    );
  }

  for (const line of controlledLines) {
    if (!cleanOptional(line.prescriptionNumber)) {
      throw new PharmacyTraceError(
        'PRESCRIPTION_REQUIRED',
        422,
        `${line.productName}: ingresa el número de receta para registrar el libro de controlados`
      );
    }
  }

  const dispenser = controlledLines.length > 0
    ? await tx.user.findFirst({
        where: {
          id: input.userId,
          storeId: input.storeId,
          active: true,
        },
        select: { id: true, name: true },
      })
    : null;

  if (controlledLines.length > 0 && !dispenser) {
    throw new PharmacyTraceError(
      'DISPENSER_NOT_FOUND',
      403,
      'El usuario que dispensa no está activo en esta tienda'
    );
  }

  let patientMedications = 0;
  if (patient) {
    const result = await tx.patientMedication.createMany({
      data: input.productLines.map((line) => ({
        id: `patient-med:${patient.id}:${line.saleItemId}`,
        patientId: patient.id,
        saleId: input.sale.id,
        productName: line.productName,
        genericName: line.genericName,
        concentration: line.concentration,
        quantity: line.quantity,
        prescribedBy: cleanOptional(input.prescribedBy),
        dosage: null,
        consultReason: cleanOptional(input.consultReason),
        notes: cleanOptional(line.observation),
      })),
      skipDuplicates: true,
    });
    patientMedications = result.count;
  }

  let controlledBookEntries = 0;
  if (controlledLines.length > 0 && patient && dispenser) {
    const result = await tx.controlledBookEntry.createMany({
      data: controlledLines.map((line) => ({
        id: `controlled:${line.saleItemId}`,
        storeId: input.storeId,
        saleId: input.sale.id,
        saleNumber: input.sale.saleNumber,
        saleDate: input.sale.createdAt,
        productName: line.productName,
        genericName: line.genericName,
        concentration: line.concentration,
        laboratory: line.laboratory,
        batchNumber: firstBatchNumber(line.batchBreakdown),
        quantity: line.quantity,
        prescriptionNumber: cleanOptional(line.prescriptionNumber)!,
        prescribedBy: cleanOptional(input.prescribedBy),
        cmpNumber: cleanOptional(input.cmpNumber),
        patientId: patient.id,
        patientName: patient.name,
        patientDni: patient.dni,
        dispensedById: dispenser.id,
        dispensedByName: dispenser.name,
      })),
      skipDuplicates: true,
    });
    controlledBookEntries = result.count;
  }

  return { patientMedications, controlledBookEntries };
}
