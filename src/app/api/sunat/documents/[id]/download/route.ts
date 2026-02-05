/**
 * MÓDULO 18.5 — GET /api/sunat/documents/:id/download
 * 
 * Descarga archivos asociados a un documento electrónico:
 * - ?type=xml → XML firmado
 * - ?type=cdr → Constancia de Recepción (CDR) de SUNAT
 * - ?type=pdf → PDF representación impresa (futuro)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { auditSunatDownload } from '@/domain/sunat/audit';
import { extractFromZip } from '@/lib/sunat/zip/buildZip';
import { isSuperAdmin } from '@/lib/superadmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'xml';

    // 1. Autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 2. Buscar documento
    const doc = await prisma.electronicDocument.findUnique({
      where: { id: docId },
      include: {
        sale: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // 3. Verificar permisos
    const isSuper = isSuperAdmin(user.email);
    if (!isSuper && doc.storeId !== user.storeId) {
      return NextResponse.json({ error: 'No tienes acceso a este documento' }, { status: 403 });
    }

    // 4. Según tipo
    if (type === 'xml') {
      // Descargar XML firmado
      if (!doc.xmlSigned) {
        return NextResponse.json(
          { error: 'XML firmado no disponible' },
          { status: 404 }
        );
      }

      // Auditar descarga
      await auditSunatDownload(
        user.userId,
        user.storeId!,
        doc.saleId,
        docId,
        'XML',
        doc.docType,
        doc.fullNumber
      );

      const filename = `${doc.fullNumber}.xml`;

      return new NextResponse(doc.xmlSigned, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });

    } else if (type === 'cdr') {
      // Descargar CDR (ZIP de SUNAT)
      if (!doc.cdrZip) {
        return NextResponse.json(
          { error: 'CDR no disponible (aún no recibido de SUNAT)' },
          { status: 404 }
        );
      }

      // Extraer XML del CDR ZIP
      let cdrXml: string | null;
      try {
        cdrXml = extractFromZip(doc.cdrZip!);
        if (!cdrXml) {
          return NextResponse.json(
            { error: 'CDR vacío o corrupto' },
            { status: 500 }
          );
        }
      } catch (error: any) {
        return NextResponse.json(
          { error: 'Error al extraer CDR: ' + error.message },
          { status: 500 }
        );
      }

      // Auditar descarga
      await auditSunatDownload(
        user.userId,
        user.storeId!,
        doc.saleId,
        docId,
        'CDR',
        doc.docType,
        doc.fullNumber
      );

      const filename = `R-${doc.fullNumber}.xml`;

      return new NextResponse(cdrXml, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });

    } else if (type === 'pdf') {
      // PDF representación impresa (futuro)
      return NextResponse.json(
        { error: 'Descarga de PDF aún no implementada' },
        { status: 501 }
      );

    } else {
      return NextResponse.json(
        { error: 'Tipo de descarga no válido. Use: xml, cdr o pdf' },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('Error en GET /api/sunat/documents/:id/download:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error al descargar archivo' },
      { status: 500 }
    );
  }
}
