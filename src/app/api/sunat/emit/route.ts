/**
 * MÓDULO 18.5 + 18.7 — POST /api/sunat/emit
 * 
 * ENDPOINT PRINCIPAL: Emite un comprobante electrónico SUNAT para una venta existente.
 * 
 * FLUJO:
 * 1. Validar venta existe y no tiene FIADO
 * 2. Validar permisos (CASHIER→BOLETA, OWNER→BOLETA+FACTURA)
 * 3. Crear ElectronicDocument DRAFT
 * 4. Generar XML (firma pendiente para producción)
 * 5. Marcar como SIGNED
 * 6. Encolar job SUNAT (worker enviará asíncronamente)
 * 
 * IMPORTANTE:
 * - NO bloquea el checkout (se llama DESPUÉS de guardar venta)
 * - Si falla, venta YA está guardada
 * - FIADO bloqueado (409 FIADO_NOT_SUPPORTED)
 * 
 * MÓDULO 18.7: Idempotencia con emitKey
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { auditSunatEmitRequested, auditSunatEmitSuccess, auditSunatEmitFailed } from '@/domain/sunat/audit';
import { validateFacturaData, validateBoletaData, isValidRuc, isValidDni } from '@/lib/sunat/validation/fiscalValidations';
import { isSuperAdmin } from '@/lib/superadmin';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'; // ✅ MÓDULO S8

/**
 * Genera emitKey para idempotencia
 * Hash de: saleId + docType + customerDocNumber
 */
function generateEmitKey(saleId: string, docType: string, customerDocNumber: string): string {
  const data = `${saleId}:${docType}:${customerDocNumber}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    // ✅ MÓDULO S8: Rate limit SUNAT emit
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit('sunat', clientIP);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intenta en ${waitSeconds}s`, code: 'TOO_MANY_REQUESTS' },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      saleId,
      docType, // 'BOLETA' | 'FACTURA'
      customerDocType, // 'DNI' | 'RUC' | 'CE' | etc
      customerDocNumber,
      customerName,
      customerAddress, // Opcional
      customerEmail, // Opcional
    } = body;

    // 1. Validar campos obligatorios
    if (!saleId || !docType || !customerDocType || !customerDocNumber || !customerName) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: saleId, docType, customerDocType, customerDocNumber, customerName' },
        { status: 400 }
      );
    }

    if (!['BOLETA', 'FACTURA'].includes(docType)) {
      return NextResponse.json(
        { error: 'docType debe ser BOLETA o FACTURA' },
        { status: 400 }
      );
    }

    // 1.5 MÓDULO 18.7: Validaciones fiscales MVP
    if (docType === 'FACTURA') {
      // FACTURA requiere RUC válido
      if (!isValidRuc(customerDocNumber)) {
        return NextResponse.json(
          { 
            error: 'FACTURA requiere RUC válido (11 dígitos)',
            code: 'INVALID_RUC_FOR_FACTURA',
            hint: 'El RUC debe tener exactamente 11 dígitos y formato válido',
          },
          { status: 400 }
        );
      }
      if (customerDocType.toUpperCase() !== 'RUC' && customerDocType !== '6') {
        return NextResponse.json(
          { 
            error: 'FACTURA requiere tipo de documento RUC',
            code: 'DOC_TYPE_MUST_BE_RUC',
          },
          { status: 400 }
        );
      }
    } else if (docType === 'BOLETA') {
      // BOLETA: DNI opcional pero si se incluye debe ser válido
      if (customerDocType.toUpperCase() === 'DNI' || customerDocType === '1') {
        if (!isValidDni(customerDocNumber)) {
          return NextResponse.json(
            { 
              error: 'DNI inválido (debe tener 8 dígitos)',
              code: 'INVALID_DNI',
              hint: 'El DNI debe tener exactamente 8 dígitos',
            },
            { status: 400 }
          );
        }
      }
    }

    // 2. Verificar permisos por rol
    const isSuper = isSuperAdmin(user.email);
    if (docType === 'FACTURA' && user.role !== 'OWNER' && !isSuper) {
      await auditSunatEmitFailed(
        user.userId,
        user.storeId!,
        saleId,
        docType,
        'Rol insuficiente para emitir FACTURA',
        null,
        null
      );

      return NextResponse.json(
        { error: 'Solo OWNER o SUPERADMIN pueden emitir FACTURA' },
        { status: 403 }
      );
    }

    // 3. Buscar venta con todos los datos necesarios
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: true,
              },
            },
          },
        },
        store: {
          include: {
            sunatSettings: true,
          },
        },
        electronicDocuments: true,
      },
    });

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    // 4. Verificar permisos de tienda
    if (!isSuper && sale.storeId !== user.storeId) {
      return NextResponse.json({ error: 'No tienes acceso a esta venta' }, { status: 403 });
    }

    // 5. FIADO bloqueado
    if (sale.paymentMethod === 'FIADO') {
      await auditSunatEmitFailed(
        user.userId,
        user.storeId!,
        saleId,
        docType,
        'FIADO no soporta emisión SUNAT',
        null,
        null
      );

      return NextResponse.json(
        { error: 'No se puede emitir comprobante para ventas FIADO' },
        { status: 409 }
      );
    }

    // 6. MÓDULO 18.7: Verificación de idempotencia con emitKey
    // Genera emitKey basado en saleId + docType + customerDocNumber
    const emitKey = generateEmitKey(saleId, docType, customerDocNumber);
    
    // 6.1 Verificar si ya existe documento con esta combinación
    const existingDoc = sale.electronicDocuments.find(
      (d) => d.saleId === saleId && d.docType === docType
    );

    if (existingDoc) {
      // Si ya existe, devolver el existente (idempotencia)
      const isActive = ['SIGNED', 'SENT', 'ACCEPTED'].includes(existingDoc.status);
      
      if (isActive) {
        console.log(`[SUNAT] Idempotencia: Documento existente ${existingDoc.fullNumber} para emitKey ${emitKey}`);
        
        return NextResponse.json({
          success: true,
          idempotent: true,
          message: 'Documento ya emitido previamente',
          documentId: existingDoc.id,
          fullNumber: existingDoc.fullNumber,
          status: existingDoc.status,
          emitKey,
        });
      } else if (existingDoc.status === 'REJECTED' || existingDoc.status === 'ERROR') {
        // Si fue rechazado/error, permitir reintento (se creará nuevo documento)
        console.log(`[SUNAT] Documento previo ${existingDoc.fullNumber} en estado ${existingDoc.status}, permitiendo reemisión`);
      } else if (existingDoc.status === 'DRAFT') {
        // Si está en DRAFT, continuar procesándolo
        console.log(`[SUNAT] Documento previo ${existingDoc.fullNumber} en DRAFT, retomando proceso`);
      }
    }

    // 7. Verificar SUNAT habilitado en tienda
    if (!sale.store.sunatSettings) {
      return NextResponse.json(
        { error: 'SUNAT no configurado para esta tienda' },
        { status: 400 }
      );
    }

    const settings = sale.store.sunatSettings;
    if (!settings.enabled) {
      return NextResponse.json(
        { error: 'SUNAT deshabilitado en esta tienda' },
        { status: 400 }
      );
    }

    // 8. Determinar serie según docType
    let series: string;
    if (docType === 'BOLETA') {
      series = settings.defaultBoletaSeries || 'B001';
    } else {
      series = settings.defaultFacturaSeries || 'F001';
    }

    // 9. Obtener siguiente número correlativo
    const lastDoc = await prisma.electronicDocument.findFirst({
      where: {
        storeId: sale.storeId,
        docType: docType,
        series: series,
      },
      orderBy: {
        number: 'desc',
      },
    });

    const nextNumber = (lastDoc?.number || 0) + 1;
    const fullNumber = `${series}-${String(nextNumber).padStart(8, '0')}`;

    // 10. Auditar inicio
    await auditSunatEmitRequested(
      user.userId,
      user.storeId!,
      saleId,
      docType,
      fullNumber,
      customerDocType,
      customerDocNumber
    );

    // 11. Crear documento electrónico DRAFT
    // Calcular taxable e IGV (18%)
    const totalNum = Number(sale.total);
    const taxable = totalNum / 1.18;  // Base imponible
    const igv = totalNum - taxable;    // IGV

    const electronicDoc = await prisma.electronicDocument.create({
      data: {
        storeId: sale.storeId,
        saleId: sale.id,
        docType: docType,
        series: series,
        number: nextNumber,
        fullNumber: fullNumber,
        status: 'DRAFT',
        issueDate: new Date(),
        currency: 'PEN',
        taxable: taxable,
        igv: igv,
        total: sale.total,
        customerDocType: customerDocType as any,
        customerDocNumber: customerDocNumber,
        customerName: customerName,
        customerAddress: customerAddress || null,
      },
    });

    // 12. Generar XML (versión mock para BETA - firma pendiente)
    const xmlContent = generateMockSignedXml({
      ruc: settings.ruc || '',
      businessName: settings.razonSocial || '',
      docType: docType,
      fullNumber: fullNumber,
      issueDate: electronicDoc.issueDate,
      customerDocType: customerDocType,
      customerDocNumber: customerDocNumber,
      customerName: customerName,
      customerAddress: customerAddress || '',
      items: sale.items.map((item) => ({
        description: item.storeProduct?.product?.name || item.productName || 'Producto',
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: Number(item.subtotal),
      })),
      currency: electronicDoc.currency,
      total: Number(electronicDoc.total),
    });

    const hash = `mock_hash_${Date.now()}`;

    // 13. Actualizar a SIGNED (en producción, aquí iría firma digital)
    await prisma.electronicDocument.update({
      where: { id: electronicDoc.id },
      data: {
        xmlSigned: xmlContent,
        hash: hash,
        status: 'SIGNED',
      },
    });

    // 14. Encolar job para worker
    const job = await prisma.sunatJob.create({
      data: {
        storeId: sale.storeId,
        document: { connect: { id: electronicDoc.id } },
        type: 'SEND_CPE',
        status: 'QUEUED',
        attempts: 0,
        nextRunAt: new Date(),
      },
    });

    // 15. Auditar éxito
    await auditSunatEmitSuccess(
      user.userId,
      user.storeId!,
      saleId,
      docType,
      fullNumber,
      electronicDoc.id,
      job.id
    );

    // 16. Respuesta
    return NextResponse.json({
      success: true,
      document: {
        id: electronicDoc.id,
        fullNumber: fullNumber,
        status: 'SIGNED',
        queuedAt: new Date(),
      },
      job: {
        id: job.id,
        status: job.status,
      },
      message: 'Comprobante creado y encolado para envío a SUNAT',
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/emit:', error);

    return NextResponse.json(
      { error: error.message || 'Error al emitir comprobante' },
      { status: 500 }
    );
  }
}

/**
 * Genera XML mock firmado (BETA)
 * En producción, usar firma digital con certificado SUNAT
 */
function generateMockSignedXml(data: {
  ruc: string;
  businessName: string;
  docType: string;
  fullNumber: string;
  issueDate: Date;
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  customerAddress: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  currency: string;
  total: number;
}): string {
  const dateStr = data.issueDate.toISOString().split('T')[0];
  const timeStr = data.issueDate.toISOString().split('T')[1].slice(0, 8);
  const docTypeCode = data.docType === 'BOLETA' ? '03' : '01';
  
  // Calcular totales
  const totalNum = typeof data.total === 'number' ? data.total : Number(data.total);
  const taxable = totalNum / 1.18;
  const igv = totalNum - taxable;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <ds:Signature Id="signatureId">
          <ds:SignedInfo>
            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
            <ds:Reference URI="">
              <ds:Transforms>
                <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
              </ds:Transforms>
              <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
              <ds:DigestValue>MOCK_DIGEST_VALUE</ds:DigestValue>
            </ds:Reference>
          </ds:SignedInfo>
          <ds:SignatureValue>MOCK_SIGNATURE_BETA_${Date.now()}</ds:SignatureValue>
          <ds:KeyInfo>
            <ds:X509Data>
              <ds:X509Certificate>MOCK_CERTIFICATE</ds:X509Certificate>
            </ds:X509Data>
          </ds:KeyInfo>
        </ds:Signature>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${data.fullNumber}</cbc:ID>
  <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  <cbc:IssueTime>${timeStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${docTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listAgencyName="United Nations Economic Commission for Europe" listName="Currency">${data.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${data.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${data.businessName}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${data.businessName}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${data.customerDocType === 'DNI' ? '1' : '6'}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${data.customerDocNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${data.customerName}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${data.currency}">${igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${data.currency}">${taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${data.currency}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.currency}">${taxable.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.currency}">${totalNum.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${data.currency}">${totalNum.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${data.items.map((item, idx) => {
    const itemTotal = typeof item.total === 'number' ? item.total : Number(item.total);
    const itemTaxable = itemTotal / 1.18;
    const itemIgv = itemTotal - itemTaxable;
    return `<cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${data.currency}">${itemTotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${data.currency}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
        <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.currency}">${itemIgv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.currency}">${itemTaxable.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.currency}">${itemIgv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18</cbc:Percent>
          <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${item.description}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${data.currency}">${(item.unitPrice / 1.18).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('\n  ')}
</Invoice>`;
}
