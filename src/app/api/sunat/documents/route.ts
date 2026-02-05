/**
 * MÓDULO 18.10 — GET /api/sunat/documents
 * 
 * Lista documentos electrónicos con filtros y paginación.
 * 
 * Query params:
 * - storeId? (solo SUPERADMIN)
 * - from=YYYY-MM-DD
 * - to=YYYY-MM-DD
 * - type=BOLETA|FACTURA|NC|ND|SUMMARY|VOIDED|ALL
 * - status=DRAFT|SIGNED|SENT|ACCEPTED|REJECTED|OBSERVED|ERROR|CANCELED|ALL
 * - q=texto (search por fullNumber o saleNumber o customer)
 * - page, pageSize (default 1, 25)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { Prisma, SunatDocType, SunatStatus } from '@prisma/client';
import { logAudit } from '@/lib/auditLog';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET(req: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Verificar permisos (OWNER o SUPERADMIN)
    const isSuper = isSuperAdmin(user.email);
    if (user.role !== 'OWNER' && !isSuper) {
      return NextResponse.json(
        { error: 'No tienes permisos para ver documentos electrónicos' },
        { status: 403 }
      );
    }

    // 3. Verificar feature flag
    if (process.env.ENABLE_SUNAT !== 'true') {
      return NextResponse.json(
        { error: 'FEATURE_DISABLED', message: 'SUNAT no está habilitado' },
        { status: 403 }
      );
    }

    // 4. Parse query params
    const url = new URL(req.url);
    const storeIdParam = url.searchParams.get('storeId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const type = url.searchParams.get('type') || 'ALL';
    const status = url.searchParams.get('status') || 'ALL';
    const q = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '25');

    // 5. Determinar storeId a consultar
    let targetStoreId: string | undefined;
    
    if (isSuper) {
      // SUPERADMIN puede filtrar por cualquier tienda o ver todas
      targetStoreId = storeIdParam || undefined;
    } else {
      // OWNER solo puede ver su tienda
      if (!user.storeId) {
        return NextResponse.json(
          { error: 'No tienes tienda asignada' },
          { status: 400 }
        );
      }
      targetStoreId = user.storeId;
    }

    // 6. Construir filtros
    const where: Prisma.ElectronicDocumentWhereInput = {};

    // Filtro por tienda
    if (targetStoreId) {
      where.storeId = targetStoreId;
    }

    // Filtro por fechas
    if (from || to) {
      where.issueDate = {};
      if (from) {
        where.issueDate.gte = new Date(from + 'T00:00:00');
      }
      if (to) {
        where.issueDate.lte = new Date(to + 'T23:59:59');
      }
    }

    // Filtro por tipo de documento
    if (type !== 'ALL') {
      const validTypes: SunatDocType[] = ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'SUMMARY', 'VOIDED'];
      if (validTypes.includes(type as SunatDocType)) {
        where.docType = type as SunatDocType;
      }
    }

    // Filtro por estado
    if (status !== 'ALL') {
      const validStatuses: SunatStatus[] = ['DRAFT', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED', 'OBSERVED', 'ERROR', 'CANCELED'];
      if (validStatuses.includes(status as SunatStatus)) {
        where.status = status as SunatStatus;
      }
    }

    // Búsqueda por texto (fullNumber, customer)
    if (q.trim()) {
      where.OR = [
        { fullNumber: { contains: q.trim(), mode: 'insensitive' } },
        { customerName: { contains: q.trim(), mode: 'insensitive' } },
        { customerDocNumber: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    // 7. Ejecutar consulta con paginación
    const [items, total] = await Promise.all([
      prisma.electronicDocument.findMany({
        where,
        select: {
          id: true,
          storeId: true,
          docType: true,
          series: true,
          number: true,
          fullNumber: true,
          status: true,
          issueDate: true,
          createdAt: true,
          saleId: true,
          customerDocType: true,
          customerDocNumber: true,
          customerName: true,
          total: true,
          currency: true,
          sunatCode: true,
          sunatMessage: true,
          sunatTicket: true,
          xmlSigned: true,
          cdrZip: true,
          store: {
            select: {
              name: true,
            },
          },
          sale: {
            select: {
              saleNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.electronicDocument.count({ where }),
    ]);

    // 8. Mapear respuesta
    const mappedItems = items.map((doc) => ({
      id: doc.id,
      storeId: doc.storeId,
      storeName: doc.store.name,
      docType: doc.docType,
      series: doc.series,
      number: doc.number,
      fullNumber: doc.fullNumber,
      status: doc.status,
      issueDate: doc.issueDate,
      createdAt: doc.createdAt,
      saleId: doc.saleId,
      saleNumber: doc.sale?.saleNumber || null,
      customerDocType: doc.customerDocType,
      customerDocNumber: doc.customerDocNumber,
      customerName: doc.customerName,
      total: doc.total,
      currency: doc.currency,
      sunatCode: doc.sunatCode,
      sunatMessage: doc.sunatMessage,
      // Enmascarar ticket (últimos 4 caracteres)
      ticketMasked: doc.sunatTicket
        ? '****' + doc.sunatTicket.slice(-4)
        : null,
      hasXmlSigned: !!doc.xmlSigned,
      hasCdr: !!doc.cdrZip,
    }));

    // 9. Auditoría
    await logAudit({
      storeId: targetStoreId || user.storeId || 'SUPERADMIN',
      userId: user.userId,
      action: 'SUNAT_DOC_LIST_VIEWED',
      entityType: 'SUNAT',
      entityId: 'list',
      severity: 'INFO',
      meta: {
        filters: { from, to, type, status, q },
        page,
        pageSize,
        total,
      },
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    return NextResponse.json({
      items: mappedItems,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Error listing SUNAT documents:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
