import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId || !session.storeId) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const fromDate = from ? new Date(from + 'T00:00:00.000-05:00') : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to + 'T23:59:59.999-05:00') : new Date();

    const userFilter = session.role === 'CASHIER'
      ? Prisma.sql`AND s.user_id = ${session.userId}`
      : Prisma.empty;

    const products = await prisma.$queryRaw<Array<{
      product_name: string;
      qty: any; unit_cost: any; unit_price: any;
      total_cost: any; total_revenue: any; ticket_count: any;
    }>>(
      Prisma.sql`
        SELECT 
          si.product_name,
          SUM(si.quantity) as qty,
          ROUND(COALESCE(AVG(si.cost_price), 0), 2) as unit_cost,
          ROUND(AVG(si.unit_price), 2) as unit_price,
          COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
          COALESCE(SUM(si.total_line), 0) as total_revenue,
          COUNT(DISTINCT s.id) as ticket_count
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = ${session.storeId}
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
          AND s.total > 0
          ${userFilter}
        GROUP BY si.product_name
        ORDER BY SUM(si.total_line) DESC
      `
    );

    // Totals
    let grandRevenue = 0, grandCost = 0, grandQty = 0;
    products.forEach(p => {
      grandRevenue += Number(p.total_revenue);
      grandCost += Number(p.total_cost);
      grandQty += Number(p.qty);
    });
    const grandProfit = grandRevenue - grandCost;
    const grandMargin = grandRevenue > 0 ? (grandProfit / grandRevenue) * 100 : 0;

    // Build Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MarketPOS';
    const ws = wb.addWorksheet('Ranking de Productos');

    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    // Title
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = 'Ranking de Productos - Análisis de Rentabilidad';
    ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF059669' } };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:I2');
    ws.getCell('A2').value = `Periodo: ${fromDate.toLocaleDateString('es-PE')} - ${toDate.toLocaleDateString('es-PE')} | ${products.length} productos`;
    ws.getCell('A2').font = { color: { argb: 'FF9CA3AF' }, size: 10 };

    // Summary row
    const kpiLabels = ['Total Vendido', 'Costo Total', 'Ganancia', 'Margen', 'Productos', 'Unidades'];
    const kpiValues = [grandRevenue, grandCost, grandProfit, grandMargin / 100, products.length, grandQty];
    const kpiFmts = ['"S/ "#,##0.00', '"S/ "#,##0.00', '"S/ "#,##0.00', '0.0%', '#,##0', '#,##0'];

    ws.getRow(4).values = kpiLabels;
    ws.getRow(5).values = kpiValues;
    kpiLabels.forEach((_, i) => {
      const col = i + 1;
      ws.getCell(4, col).font = { color: { argb: 'FF6B7280' }, size: 9 };
      ws.getCell(4, col).alignment = { horizontal: 'center' };
      ws.getCell(5, col).numFmt = kpiFmts[i];
      ws.getCell(5, col).font = { bold: true, size: 13, color: { argb: i === 2 ? (grandProfit >= 0 ? 'FF059669' : 'FFDC2626') : 'FF111827' } };
      ws.getCell(5, col).alignment = { horizontal: 'center' };
      ws.getCell(4, col).border = borderThin;
      ws.getCell(5, col).border = borderThin;
    });

    // Table header
    const headers = ['#', 'Producto', 'Cantidad', 'P. Costo', 'P. Venta', 'Costo Total', 'Venta Total', 'Ganancia', 'Margen'];
    const hRow = ws.addRow([]);
    ws.addRow([]);
    const tableHeaderRow = ws.addRow(headers);
    tableHeaderRow.eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderThin;
    });
    tableHeaderRow.height = 22;

    // Column widths
    const colWidths = [6, 35, 10, 14, 14, 14, 14, 14, 10];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Data
    products.forEach((p, i) => {
      const rev = Number(p.total_revenue);
      const cost = Number(p.total_cost);
      const profit = rev - cost;
      const margin = rev > 0 ? profit / rev : 0;

      const row = ws.addRow([
        i + 1,
        p.product_name,
        Number(p.qty),
        Number(p.unit_cost),
        Number(p.unit_price),
        cost,
        rev,
        profit,
        margin,
      ]);

      row.getCell(4).numFmt = '"S/ "#,##0.00';
      row.getCell(5).numFmt = '"S/ "#,##0.00';
      row.getCell(6).numFmt = '"S/ "#,##0.00';
      row.getCell(7).numFmt = '"S/ "#,##0.00';
      row.getCell(8).numFmt = '"S/ "#,##0.00';
      row.getCell(9).numFmt = '0.0%';

      row.getCell(8).font = { bold: true, color: { argb: profit >= 0 ? 'FF059669' : 'FFDC2626' } };
      row.getCell(9).font = { color: { argb: margin >= 0.3 ? 'FF059669' : margin >= 0.15 ? 'FFD97706' : 'FFDC2626' } };

      const fillColor = i % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.border = borderThin;
      });
    });

    // Total footer
    const totalRow = ws.addRow(['', 'TOTAL', grandQty, '', '', grandCost, grandRevenue, grandProfit, grandMargin / 100]);
    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      cell.border = borderThin;
    });
    totalRow.getCell(6).numFmt = '"S/ "#,##0.00';
    totalRow.getCell(7).numFmt = '"S/ "#,##0.00';
    totalRow.getCell(8).numFmt = '"S/ "#,##0.00';
    totalRow.getCell(9).numFmt = '0.0%';
    totalRow.getCell(8).font = { bold: true, color: { argb: grandProfit >= 0 ? 'FF059669' : 'FFDC2626' } };

    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Ranking_Productos_Rentabilidad.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting all products profit:', error);
    return NextResponse.json({ code: 'SERVER_ERROR' }, { status: 500 });
  }
}
