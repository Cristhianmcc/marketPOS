import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const product = searchParams.get('product');
    const groupBy = searchParams.get('groupBy') || 'day';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!product) {
      return NextResponse.json({ code: 'BAD_REQUEST' }, { status: 400 });
    }

    const defaultDays = groupBy === 'month' ? 365 : groupBy === 'week' ? 90 : 30;
    const fromDate = from ? new Date(from + 'T00:00:00.000-05:00') : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    const userFilter = session.role === 'CASHIER'
      ? Prisma.sql`AND s.user_id = ${session.userId}`
      : Prisma.empty;

    let dateTrunc: Prisma.Sql;
    if (groupBy === 'month') {
      dateTrunc = Prisma.sql`DATE_TRUNC('month', s.created_at)`;
    } else if (groupBy === 'week') {
      dateTrunc = Prisma.sql`DATE_TRUNC('week', s.created_at)`;
    } else {
      dateTrunc = Prisma.sql`DATE_TRUNC('day', s.created_at)`;
    }

    const timeSeries = await prisma.$queryRaw<Array<{
      period: Date; qty: any; unit_cost: any; unit_price: any;
      total_cost: any; total_revenue: any; ticket_count: any;
    }>>(
      Prisma.sql`
        SELECT ${dateTrunc} as period,
          SUM(si.quantity) as qty,
          ROUND(COALESCE(AVG(si.cost_price), 0), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue,
          COUNT(DISTINCT s.id) as ticket_count
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
          AND s.total > 0 AND si.product_name = ${product}
          ${userFilter}
        GROUP BY ${dateTrunc} ORDER BY period ASC
      `
    );

    const totals = await prisma.$queryRaw<Array<{
      qty: any; total_cost: any; total_revenue: any; ticket_count: any;
      unit_cost: any; unit_price: any;
    }>>(
      Prisma.sql`
        SELECT SUM(si.quantity) as qty,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue,
          COUNT(DISTINCT s.id) as ticket_count,
          ROUND(COALESCE(AVG(si.cost_price), 0), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
          AND s.total > 0 AND si.product_name = ${product}
          ${userFilter}
      `
    );

    const t = totals[0];
    const totalRev = Number(t?.total_revenue || 0);
    const totalCost = Number(t?.total_cost || 0);
    const profit = totalRev - totalCost;
    const margin = totalRev > 0 ? (profit / totalRev) * 100 : 0;

    // Build Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MarketPOS';
    wb.created = new Date();

    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    const groupLabel = groupBy === 'day' ? 'Diario' : groupBy === 'week' ? 'Semanal' : 'Mensual';

    // ─── Sheet 1: Resumen (estilo Ranking) ─────────────────────────────
    const ws = wb.addWorksheet('Resumen');

    // Title
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = `Análisis de Rentabilidad: ${product}`;
    ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF059669' } };
    ws.getRow(1).height = 28;

    // Subtitle
    ws.mergeCells('A2:I2');
    ws.getCell('A2').value = `Periodo: ${fromDate.toLocaleDateString('es-PE')} - ${toDate.toLocaleDateString('es-PE')} | Agrupación: ${groupLabel} | ${timeSeries.length} periodos`;
    ws.getCell('A2').font = { color: { argb: 'FF9CA3AF' }, size: 10 };

    // KPI Summary (row 4-5) — same style as ranking
    const kpiLabels = ['Total Vendido', 'Costo Total', 'Ganancia', 'Margen', 'P. Costo Prom.', 'P. Venta Prom.', 'Unidades', 'Tickets'];
    const kpiValues = [totalRev, totalCost, profit, margin / 100, Number(t?.unit_cost || 0), Number(t?.unit_price || 0), Number(t?.qty || 0), Number(t?.ticket_count || 0)];
    const kpiFmts = ['"S/ "#,##0.00', '"S/ "#,##0.00', '"S/ "#,##0.00', '0.0%', '"S/ "#,##0.00', '"S/ "#,##0.00', '#,##0', '#,##0'];

    ws.getRow(4).values = kpiLabels;
    ws.getRow(5).values = kpiValues;
    ws.getRow(4).height = 20;
    ws.getRow(5).height = 28;

    kpiLabels.forEach((_, i) => {
      const col = i + 1;
      ws.getCell(4, col).font = { color: { argb: 'FF6B7280' }, size: 9 };
      ws.getCell(4, col).alignment = { horizontal: 'center' };
      ws.getCell(4, col).border = borderThin;
      ws.getCell(5, col).numFmt = kpiFmts[i];
      ws.getCell(5, col).font = { bold: true, size: 13, color: { argb: i === 2 ? (profit >= 0 ? 'FF059669' : 'FFDC2626') : 'FF111827' } };
      ws.getCell(5, col).alignment = { horizontal: 'center' };
      ws.getCell(5, col).border = borderThin;
    });

    // Table header (row 8) — same columns as ranking
    const tableHeaders = ['#', 'Periodo', 'Cantidad', 'P. Costo', 'P. Venta', 'Costo Total', 'Venta Total', 'Ganancia', 'Margen'];
    const colWidths = [16, 30, 12, 14, 14, 16, 16, 16, 10];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const tableHeaderRow = ws.getRow(8);
    tableHeaders.forEach((h, i) => {
      const cell = tableHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
    });
    tableHeaderRow.height = 22;

    // Data rows starting at row 9
    timeSeries.forEach((r, i) => {
      const d = new Date(r.period);
      let label: string;
      if (groupBy === 'month') {
        label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      } else if (groupBy === 'week') {
        const end = new Date(d);
        end.setDate(end.getDate() + 6);
        label = `${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`;
      } else {
        label = d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      }

      const rev = Number(r.total_revenue);
      const cost = Number(r.total_cost);
      const p = rev - cost;
      const m = rev > 0 ? p / rev : 0;

      const rowNum = 9 + i;
      const row = ws.getRow(rowNum);
      const vals = [i + 1, label, Number(r.qty), Number(r.unit_cost), Number(r.unit_price), cost, rev, p, m];
      vals.forEach((v, ci) => { row.getCell(ci + 1).value = v; });

      row.getCell(4).numFmt = '"S/ "#,##0.00';
      row.getCell(5).numFmt = '"S/ "#,##0.00';
      row.getCell(6).numFmt = '"S/ "#,##0.00';
      row.getCell(7).numFmt = '"S/ "#,##0.00';
      row.getCell(8).numFmt = '"S/ "#,##0.00';
      row.getCell(9).numFmt = '0.0%';

      row.getCell(8).font = { bold: true, color: { argb: p >= 0 ? 'FF059669' : 'FFDC2626' } };
      row.getCell(9).font = { color: { argb: m >= 0.3 ? 'FF059669' : m >= 0.15 ? 'FFD97706' : 'FFDC2626' } };

      const fillColor = i % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.border = borderThin;
      });
    });

    // Total footer
    if (timeSeries.length > 0) {
      const totalRowNum = 9 + timeSeries.length;
      const tRow = ws.getRow(totalRowNum);
      const tVals = ['', 'TOTAL', Number(t?.qty || 0), '', '', totalCost, totalRev, profit, margin / 100];
      tVals.forEach((v, ci) => { tRow.getCell(ci + 1).value = v; });

      tRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        cell.border = borderThin;
      });
      tRow.getCell(6).numFmt = '"S/ "#,##0.00';
      tRow.getCell(7).numFmt = '"S/ "#,##0.00';
      tRow.getCell(8).numFmt = '"S/ "#,##0.00';
      tRow.getCell(9).numFmt = '0.0%';
      tRow.getCell(8).font = { bold: true, color: { argb: profit >= 0 ? 'FF059669' : 'FFDC2626' } };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const fileName = `Rentabilidad_${product.replace(/[^a-zA-Z0-9]/g, '_')}_${groupLabel}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting product profit:', error);
    return NextResponse.json({ code: 'SERVER_ERROR' }, { status: 500 });
  }
}
