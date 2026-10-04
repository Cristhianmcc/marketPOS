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
import { buildSunatQrText } from '@/lib/sunat/qr';
import { buildPrintedRepresentationPdf } from '@/lib/sunat/pdf/buildPrintedRepresentation';

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
        store: true,
        sunatSettings: true,
        sale: {
          include: {
            items: true,
          },
        },
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
      if (!doc.sale) {
        return NextResponse.json(
          { error: 'El documento no tiene una venta asociada para generar su representación impresa' },
          { status: 409 }
        );
      }
      if (!['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'].includes(doc.docType)) {
        return NextResponse.json(
          { error: 'Este tipo de documento no tiene representación impresa individual' },
          { status: 400 }
        );
      }

      const qrText = doc.qrText || buildSunatQrText({
        issuerRuc: doc.sunatSettings.ruc || doc.store.ruc || '',
        docType: doc.docType,
        series: doc.series,
        number: doc.number,
        igv: Number(doc.igv),
        total: Number(doc.total),
        issueDate: doc.issueDate,
        customerDocType: doc.customerDocType,
        customerDocNumber: doc.customerDocNumber,
        hash: doc.hash,
      });

      const pdf = await buildPrintedRepresentationPdf({
        environment: doc.sunatSettings.env,
        issuer: {
          ruc: doc.sunatSettings.ruc || doc.store.ruc || '',
          businessName: doc.sunatSettings.razonSocial || doc.store.name,
          address: doc.sunatSettings.address || doc.store.address,
        },
        document: {
          type: doc.docType as 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO',
          fullNumber: doc.fullNumber,
          issueDate: doc.issueDate,
          currency: doc.currency,
          status: doc.status,
          sunatMessage: doc.sunatMessage,
        },
        customer: {
          documentType: doc.customerDocType,
          documentNumber: doc.customerDocNumber,
          name: doc.customerName,
          address: doc.customerAddress,
        },
        items: doc.sale.items.map((item) => ({
          description: [item.productName, item.productContent].filter(Boolean).join(' '),
          quantity: Number(item.quantityOriginal ?? item.quantity),
          unit: item.unitSymbol || item.unitSunatCodeUsed || item.unitSunatCode || 'NIU',
          unitPrice: Number(item.unitPrice),
          total: Number(item.totalLine || item.subtotal),
        })),
        totals: {
          taxable: Number(doc.taxable),
          igv: Number(doc.igv),
          total: Number(doc.total),
        },
        qrText,
        hash: doc.hash,
      });

      await auditSunatDownload(
        user.userId,
        doc.storeId,
        doc.saleId,
        docId,
        'PDF',
        doc.docType,
        doc.fullNumber
      );

      return new NextResponse(Buffer.from(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${doc.fullNumber}.pdf"`,
          'Content-Length': String(pdf.length),
          'Cache-Control': 'private, no-store',
        },
      });

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
