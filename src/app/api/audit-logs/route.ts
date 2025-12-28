import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { prisma } from '@/infra/db/prisma';
import { AuditSeverity, AuditEntityType } from '@prisma/client';

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session?.isLoggedIn) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const isSuperAdminUser = isSuperAdmin(session.email);
  const isOwner = session.role === 'OWNER';

  // Solo OWNER y SUPERADMIN pueden acceder
  if (!isOwner && !isSuperAdminUser) {
    return NextResponse.json(
      { message: 'Solo OWNER y SUPERADMIN pueden ver logs de auditoría' },
      { status: 403 }
    );
  }

  // Parse query params
  const searchParams = req.nextUrl.searchParams;
  
  const storeId = searchParams.get('storeId');
  const severity = searchParams.get('severity') as AuditSeverity | null;
  const action = searchParams.get('action');
  const entityType = searchParams.get('entityType') as AuditEntityType | null;
  const userId = searchParams.get('userId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  
  let limit = parseInt(searchParams.get('limit') || '25');
  let offset = parseInt(searchParams.get('offset') || '0');

  // Validar limit
  if (isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;
  
  if (isNaN(offset) || offset < 0) offset = 0;

  // Validar severidad
  if (severity && !['INFO', 'WARN', 'ERROR'].includes(severity)) {
    return NextResponse.json(
      { message: 'Severidad inválida. Valores permitidos: INFO, WARN, ERROR' },
      { status: 400 }
    );
  }

  // Validar entityType
  if (entityType && !['SALE', 'SHIFT', 'COUPON', 'PROMOTION', 'STORE', 'CUSTOMER', 'RECEIVABLE', 'USER', 'PRODUCT', 'RESTORE', 'SYSTEM'].includes(entityType)) {
    return NextResponse.json(
      { message: 'Tipo de entidad inválido' },
      { status: 400 }
    );
  }

  // Validar fechas
  let dateFromObj: Date | undefined;
  let dateToObj: Date | undefined;

  if (dateFrom) {
    // Crear fecha al inicio del día en hora local del servidor
    dateFromObj = new Date(dateFrom + 'T00:00:00.000');
    if (isNaN(dateFromObj.getTime())) {
      return NextResponse.json(
        { message: 'Fecha desde inválida (formato: YYYY-MM-DD)' },
        { status: 400 }
      );
    }
  }

  if (dateTo) {
    // Crear fecha al final del día en hora local del servidor
    dateToObj = new Date(dateTo + 'T23:59:59.999');
    if (isNaN(dateToObj.getTime())) {
      return NextResponse.json(
        { message: 'Fecha hasta inválida (formato: YYYY-MM-DD)' },
        { status: 400 }
      );
    }
  }

  // Construir filtros
  const where: any = {};

  // Control de acceso por store
  if (isSuperAdminUser) {
    // SUPERADMIN puede filtrar por storeId o ver todos
    if (storeId) {
      where.storeId = storeId;
    }
  } else if (isOwner) {
    // OWNER solo ve logs de su tienda
    where.storeId = session.storeId;
  }

  // Aplicar filtros adicionales
  if (severity) {
    where.severity = severity;
  }

  if (action) {
    where.action = { contains: action, mode: 'insensitive' };
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (userId) {
    where.userId = userId;
  }

  if (dateFromObj || dateToObj) {
    where.createdAt = {};
    if (dateFromObj) {
      where.createdAt.gte = dateFromObj;
    }
    if (dateToObj) {
      where.createdAt.lte = dateToObj;
    }
  }

  try {
    // Consultar logs con paginación
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { message: 'Error al obtener logs de auditoría' },
      { status: 500 }
    );
  }
}
