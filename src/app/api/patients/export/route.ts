import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FeatureFlagKey } from '@prisma/client';
import ExcelJS from 'exceljs';

// ─── helpers ────────────────────────────────────────────────────────────────

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    value?: ExcelJS.CellValue;
    bg?: string;
    bold?: boolean;
    color?: string;
    size?: number;
    halign?: ExcelJS.Alignment['horizontal'];
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
    wrap?: boolean;
  },
) {
  if (opts.value !== undefined) cell.value = opts.value;
  if (opts.bg) cell.fill = fill(opts.bg);
  if (opts.border) cell.border = opts.border;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  cell.font = {
    bold:  opts.bold  ?? false,
    color: { argb: opts.color ?? 'FF1F2937' },
    size:  opts.size  ?? 10,
    name:  'Calibri',
  };
  cell.alignment = {
    vertical:   'middle',
    horizontal: opts.halign ?? 'left',
    indent:     opts.halign === 'center' ? 0 : 1,
    wrapText:   opts.wrap ?? false,
  };
}

function allBorders(style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Borders> {
  const b: ExcelJS.Border = { style, color: { argb: 'FFBFBFBF' } };
  return { top: b, left: b, bottom: b, right: b };
}

const C = {
  navy:   'FF1F3864',
  purple: 'FF6B21A8',
  purpleLight: 'FFF3E8FF',
  hdr:    'FFE9D5FF',
  altRow: 'FFFAF5FF',
  white:  'FFFFFFFF',
  dark:   'FF1F2937',
  teal:   'FF0F766E',
  tealLight: 'FFE6FFFA',
};

// ─── GET /api/patients/export ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const storeId = session.storeId!;
    const enabled = await isFeatureEnabled(storeId, FeatureFlagKey.ENABLE_PATIENTS);
    if (!enabled) {
      return NextResponse.json({ error: 'Módulo no habilitado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from'); // YYYY-MM-DD
    const to   = searchParams.get('to');   // YYYY-MM-DD

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRegex.test(from)) {
      return NextResponse.json({ error: "Fecha 'from' inválida. Use YYYY-MM-DD" }, { status: 400 });
    }
    if (to && !dateRegex.test(to)) {
      return NextResponse.json({ error: "Fecha 'to' inválida. Use YYYY-MM-DD" }, { status: 400 });
    }

    // Filtro de dispensaciones por fecha
    const medWhere: any = {};
    if (from) medWhere.dispensedAt = { ...medWhere.dispensedAt, gte: new Date(from + 'T00:00:00.000-05:00') };
    if (to)   medWhere.dispensedAt = { ...medWhere.dispensedAt, lte: new Date(to   + 'T23:59:59.999-05:00') };

    const [store, currentUser, patients] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, ruc: true, address: true },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true },
      }),
      prisma.patient.findMany({
        where: { storeId, active: true },
        orderBy: { name: 'asc' },
        include: {
          medicationHistory: {
            ...(Object.keys(medWhere).length > 0 ? { where: medWhere } : {}),
            orderBy: { dispensedAt: 'desc' },
          },
          _count: { select: { medicationHistory: true, controlledEntries: true } },
        },
      }),
    ]);

    type PatientWithHistory = (typeof patients)[number] & { medicationHistory: NonNullable<(typeof patients)[number]['medicationHistory']> };
    const typedPatients = patients as PatientWithHistory[];

    // Si hay filtro por fecha, solo exportar pacientes que tienen dispensaciones en ese rango
    const filteredPatients = (from || to)
      ? typedPatients.filter((p) => p.medicationHistory.length > 0)
      : typedPatients;

    const exportDate  = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const periodLabel = from && to
      ? `Del ${from} al ${to}`
      : from ? `Desde ${from}` : to ? `Hasta ${to}` : 'Todo el historial';

    // ─── workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = currentUser?.name ?? 'MarketPOS';
    wb.created = new Date();

    // ════════════════════════════════════════════════════════════
    // HOJA 1 – LISTADO DE PACIENTES
    // ════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Pacientes', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    const cols1 = [
      { width: 12 }, // DNI
      { width: 28 }, // Nombre
      { width: 14 }, // Teléfono
      { width: 11 }, // Género
      { width: 14 }, // Fecha nac.
      { width: 10 }, // Total meds
      { width: 30 }, // Alergias
      { width: 30 }, // Condiciones
      { width: 14 }, // Registrado
      { width: 28 }, // Producto (dispensación)
      { width: 24 }, // Genérico
      { width: 14 }, // Concentración
      { width: 9 },  // Cant
      { width: 24 }, // Motivo consulta
      { width: 16 }, // Fecha disp.
    ];
    cols1.forEach((c, i) => { ws1.getColumn(i + 1).width = c.width; });

    // Título
    ws1.getRow(1).height = 6;
    ws1.getRow(2).height = 32;
    ws1.mergeCells(2, 1, 2, 15);
    styleCell(ws1.getCell(2, 1), {
      value: 'HISTORIAL DE PACIENTES Y DISPENSACIONES — ' + (store?.name ?? ''),
      bg: C.purple, bold: true, color: C.white, size: 15, halign: 'center',
      border: allBorders('thin'),
    });
    ws1.getRow(3).height = 8;

    // Bloque info
    const infoData: [string, string][] = [
      ['Tienda',    store?.name    ?? ''],
      ['RUC',       store?.ruc     ?? ''],
      ['Período',   periodLabel],
      ['Exportado', exportDate],
      ['Por',       currentUser?.name ?? ''],
      ['Total pacientes', String(filteredPatients.length)],
    ];
    ws1.getRow(4).height = 18;
    ws1.mergeCells(4, 1, 4, 2);
    styleCell(ws1.getCell(4, 1), { value: 'INFORMACIÓN', bg: C.purple, bold: true, color: C.white, size: 10, border: allBorders('thin'), halign: 'center' });
    for (let i = 0; i < infoData.length; i++) {
      const r = 5 + i;
      ws1.getRow(r).height = 16;
      styleCell(ws1.getCell(r, 1), { value: infoData[i][0], bg: C.purpleLight, bold: true, border: allBorders('hair') });
      styleCell(ws1.getCell(r, 2), { value: infoData[i][1], bg: C.white, border: allBorders('hair') });
    }

    let row1 = 5 + infoData.length + 1;
    ws1.getRow(row1 - 1).height = 8;

    // Cabecera tabla — paciente + dispensaciones inline
    ws1.getRow(row1).height = 20;
    const headers1 = [
      'DNI', 'Nombre Completo', 'Teléfono', 'Género', 'Fecha Nac.', 'Total Disp.',
      'Alergias', 'Condiciones Crónicas', 'Fecha Registro',
      'Producto', 'Genérico (DCI)', 'Concentración', 'Cant.', 'Motivo Consulta', 'Fecha Disp.',
    ];
    headers1.forEach((h, ci) => {
      const isPharma = ci >= 9;
      styleCell(ws1.getCell(row1, ci + 1), {
        value: h, bg: isPharma ? C.teal : C.purple, bold: true, color: C.white,
        halign: 'center', border: allBorders('thin'), size: 10,
      });
    });
    row1++;

    // Datos — fila paciente + sub-filas por cada dispensación
    let totalDisp1 = 0;
    for (let i = 0; i < filteredPatients.length; i++) {
      const p = filteredPatients[i];
      const patientBg = i % 2 === 0 ? C.purpleLight : C.altRow;
      ws1.getRow(row1).height = 17;
      const genderLabel = p.gender === 'M' ? 'Masculino' : p.gender === 'F' ? 'Femenino' : '';
      const birthDate   = p.birthDate ? new Date(p.birthDate).toLocaleDateString('es-PE') : '';
      const createdAt   = (p as any).createdAt ? new Date((p as any).createdAt).toLocaleDateString('es-PE') : '';

      // Fila principal del paciente (columnas 1-9)
      const patientVals = [
        p.dni,
        p.name,
        p.phone ?? '',
        genderLabel,
        birthDate,
        p.medicationHistory.length,
        p.allergies ?? '',
        p.conditions ?? '',
        createdAt,
      ];
      patientVals.forEach((v, ci) => {
        styleCell(ws1.getCell(row1, ci + 1), {
          value: v as ExcelJS.CellValue,
          bg: patientBg,
          bold: ci <= 1,
          border: allBorders('hair'),
          halign: typeof v === 'number' ? 'center' : 'left',
          wrap: ci >= 6,
        });
      });

      // Resaltar alergias
      if (p.allergies) {
        ws1.getCell(row1, 7).fill = fill('FFFFF0D0');
        ws1.getCell(row1, 7).font = { color: { argb: 'FF7D4607' }, size: 10, bold: false, name: 'Calibri' };
      }

      // Primera dispensación en la misma fila del paciente (si existe)
      if (p.medicationHistory.length > 0) {
        const med = p.medicationHistory[0];
        const dispDate = new Date(med.dispensedAt).toLocaleDateString('es-PE');
        const medVals = [
          med.productName,
          med.genericName ?? '',
          med.concentration ?? '',
          Number(med.quantity),
          (med as any).consultReason ?? '',
          dispDate,
        ];
        medVals.forEach((v, ci) => {
          styleCell(ws1.getCell(row1, 10 + ci), {
            value: v as ExcelJS.CellValue,
            bg: C.tealLight,
            border: allBorders('hair'),
            halign: typeof v === 'number' ? 'center' : 'left',
            size: 9,
          });
        });
        totalDisp1++;
      } else {
        // Sin dispensaciones — celdas vacías con fondo suave
        for (let ci = 10; ci <= 15; ci++) {
          styleCell(ws1.getCell(row1, ci), { value: ci === 10 ? '—' : '', bg: 'FFF5F5F5', border: allBorders('hair'), halign: 'center', size: 9 });
        }
      }
      row1++;

      // Sub-filas para dispensaciones adicionales (2da en adelante)
      for (let mi = 1; mi < p.medicationHistory.length; mi++) {
        const med = p.medicationHistory[mi];
        ws1.getRow(row1).height = 15;
        const dispDate = new Date(med.dispensedAt).toLocaleDateString('es-PE');

        // Columnas 1-9 vacías (pertenecen al paciente de arriba)
        for (let ci = 1; ci <= 9; ci++) {
          styleCell(ws1.getCell(row1, ci), { value: '', bg: C.white, border: allBorders('hair') });
        }

        // Columnas 10-15: dispensación
        const medVals = [
          med.productName,
          med.genericName ?? '',
          med.concentration ?? '',
          Number(med.quantity),
          (med as any).consultReason ?? '',
          dispDate,
        ];
        medVals.forEach((v, ci) => {
          styleCell(ws1.getCell(row1, 10 + ci), {
            value: v as ExcelJS.CellValue,
            bg: mi % 2 === 0 ? C.tealLight : C.white,
            border: allBorders('hair'),
            halign: typeof v === 'number' ? 'center' : 'left',
            size: 9,
          });
        });
        row1++;
        totalDisp1++;
      }
    }

    // Fila total
    ws1.getRow(row1).height = 18;
    ws1.mergeCells(row1, 1, row1, 9);
    styleCell(ws1.getCell(row1, 1), { value: `TOTAL: ${filteredPatients.length} pacientes — ${totalDisp1} dispensaciones`, bg: C.navy, bold: true, color: C.white, halign: 'center', border: allBorders('thin') });
    ws1.mergeCells(row1, 10, row1, 15);
    styleCell(ws1.getCell(row1, 10), { value: '', bg: C.navy, border: allBorders('thin') });

    // ════════════════════════════════════════════════════════════
    // HOJA 2 – HISTORIAL DE DISPENSACIONES
    // ════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Dispensaciones', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    const cols2 = [
      { width: 12 }, // DNI
      { width: 28 }, // Paciente
      { width: 30 }, // Producto
      { width: 28 }, // Genérico
      { width: 14 }, // Concentración
      { width: 10 }, // Cantidad
      { width: 28 }, // Motivo consulta
      { width: 22 }, // Prescrito por
      { width: 18 }, // Fecha
    ];
    cols2.forEach((c, i) => { ws2.getColumn(i + 1).width = c.width; });

    // Título
    ws2.getRow(1).height = 6;
    ws2.getRow(2).height = 32;
    ws2.mergeCells(2, 1, 2, 9);
    styleCell(ws2.getCell(2, 1), {
      value: 'HISTORIAL DE DISPENSACIONES — ' + (store?.name ?? ''),
      bg: C.teal, bold: true, color: C.white, size: 15, halign: 'center',
      border: allBorders('thin'),
    });
    ws2.getRow(3).height = 8;

    // Info
    ws2.getRow(4).height = 18;
    ws2.mergeCells(4, 1, 4, 2);
    styleCell(ws2.getCell(4, 1), { value: 'PERÍODO: ' + periodLabel, bg: C.teal, bold: true, color: C.white, size: 10, border: allBorders('thin'), halign: 'center' });
    ws2.getRow(4).getCell(4).value = `Exportado: ${exportDate}`;
    styleCell(ws2.getCell(4, 4), { bg: C.tealLight, bold: false, size: 10, border: allBorders('thin') });
    ws2.getRow(5).height = 8;

    let row2 = 6;

    // Cabecera tabla
    ws2.getRow(row2).height = 20;
    const headers2 = ['DNI', 'Paciente', 'Producto', 'Genérico (DCI)', 'Concentración', 'Cantidad', 'Motivo Consulta', 'Prescrito Por', 'Fecha Dispensación'];
    headers2.forEach((h, ci) => {
      styleCell(ws2.getCell(row2, ci + 1), {
        value: h, bg: C.teal, bold: true, color: C.white,
        halign: 'center', border: allBorders('thin'), size: 10,
      });
    });
    row2++;

    // Aplanar todas las dispensaciones
    let totalDisp = 0;
    for (let pi = 0; pi < filteredPatients.length; pi++) {
      const p = filteredPatients[pi];
      for (let mi = 0; mi < p.medicationHistory.length; mi++) {
        const med = p.medicationHistory[mi];
        const bg  = totalDisp % 2 === 0 ? C.white : C.tealLight;
        ws2.getRow(row2).height = 16;

        const dispDate = new Date(med.dispensedAt).toLocaleString('es-PE', {
          timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });

        const vals = [
          p.dni,
          p.name,
          med.productName,
          med.genericName ?? '',
          med.concentration ?? '',
          Number(med.quantity),
          (med as any).consultReason ?? '',
          med.prescribedBy ?? '',
          dispDate,
        ];
        vals.forEach((v, ci) => {
          styleCell(ws2.getCell(row2, ci + 1), {
            value: v as ExcelJS.CellValue,
            bg,
            border: allBorders('hair'),
            halign: typeof v === 'number' ? 'center' : 'left',
            wrap: false,
          });
        });
        row2++;
        totalDisp++;
      }
    }

    // Fila total dispensaciones
    ws2.getRow(row2).height = 18;
    ws2.mergeCells(row2, 1, row2, 9);
    styleCell(ws2.getCell(row2, 1), {
      value: `TOTAL: ${totalDisp} dispensaciones registradas`,
      bg: C.navy, bold: true, color: C.white, halign: 'center', border: allBorders('thin'),
    });

    // ─── generar buffer y devolver ────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `pacientes_${dateStr}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Patients Export] Error:', error);
    return NextResponse.json({ error: 'Error al generar exportación' }, { status: 500 });
  }
}
