// Test específico para ZIP Builder
// Prueba generación y extracción de archivos ZIP

console.log('═══════════════════════════════════════════════════');
console.log('📦 TEST: ZIP BUILDER');
console.log('═══════════════════════════════════════════════════\n');

const { buildZip, extractFromZip, buildSunatFilename, mapDocTypeToSunatCode } = require('../src/lib/sunat/zip/buildZip');

// Test 1: Generación de ZIP
console.log('Test 1: Generación de ZIP\n');

const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>F001-00000001</cbc:ID>
  <cbc:IssueDate>2026-02-02</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>BODEGA EL MERCADO SAC</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
</Invoice>`;

const filename = '20123456789-01-F001-00000001.xml';

try {
  const zipBase64 = buildZip(filename, xmlContent);
  
  console.log(`✅ ZIP generado:`);
  console.log(`   Tamaño Base64: ${zipBase64.length} caracteres`);
  console.log(`   Primeros 50 caracteres: ${zipBase64.substring(0, 50)}...`);
  
  // Verificar que es Base64 válido
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(zipBase64)) {
    throw new Error('El resultado no es Base64 válido');
  }
  
  console.log(`   ✅ Formato Base64 válido\n`);
  
} catch (error) {
  console.error(`❌ Error generando ZIP:`, error.message);
  process.exit(1);
}

// Test 2: Extracción de ZIP
console.log('Test 2: Extracción de ZIP\n');

try {
  const zipBase64 = buildZip(filename, xmlContent);
  const extracted = extractFromZip(zipBase64);
  
  console.log(`✅ Contenido extraído:`);
  console.log(`   Tamaño: ${extracted.length} caracteres`);
  
  if (extracted !== xmlContent) {
    throw new Error('El contenido extraído no coincide con el original');
  }
  
  console.log(`   ✅ Contenido coincide con el original\n`);
  
  // Verificar que contiene elementos esperados
  if (!extracted.includes('<Invoice') || !extracted.includes('F001-00000001')) {
    throw new Error('El XML extraído no contiene los elementos esperados');
  }
  
  console.log(`   ✅ XML contiene elementos esperados\n`);
  
} catch (error) {
  console.error(`❌ Error extrayendo ZIP:`, error.message);
  process.exit(1);
}

// Test 3: buildSunatFilename
console.log('Test 3: Nombres de archivo SUNAT\n');

const testCases = [
  {
    ruc: '20123456789',
    code: '01',
    series: 'F001',
    number: '1',
    expected: '20123456789-01-F001-00000001.xml'
  },
  {
    ruc: '20123456789',
    code: '03',
    series: 'B001',
    number: '123',
    expected: '20123456789-03-B001-00000123.xml'
  },
  {
    ruc: '20123456789',
    code: '07',
    series: 'FC01',
    number: '9999',
    expected: '20123456789-07-FC01-00009999.xml'
  },
  {
    ruc: '20123456789',
    code: '08',
    series: 'FD01',
    number: '12345678',
    expected: '20123456789-08-FD01-12345678.xml'
  },
];

testCases.forEach((test, index) => {
  try {
    const result = buildSunatFilename(test.ruc, test.code, test.series, test.number);
    
    if (result !== test.expected) {
      throw new Error(`Esperado: ${test.expected}, Obtenido: ${result}`);
    }
    
    console.log(`   ✅ Test ${index + 1}: ${result}`);
    
  } catch (error) {
    console.error(`   ❌ Test ${index + 1} falló:`, error.message);
    process.exit(1);
  }
});

console.log('');

// Test 4: mapDocTypeToSunatCode
console.log('Test 4: Mapeo de tipos de documento\n');

const typeMappings = {
  'FACTURA': '01',
  'BOLETA': '03',
  'CREDIT_NOTE': '07',
  'DEBIT_NOTE': '08',
  'UNKNOWN': '01', // Default
};

Object.entries(typeMappings).forEach(([docType, expectedCode]) => {
  try {
    const result = mapDocTypeToSunatCode(docType);
    
    if (result !== expectedCode) {
      throw new Error(`Esperado: ${expectedCode}, Obtenido: ${result}`);
    }
    
    console.log(`   ✅ ${docType.padEnd(15)} → ${result}`);
    
  } catch (error) {
    console.error(`   ❌ ${docType} falló:`, error.message);
    process.exit(1);
  }
});

console.log('\n═══════════════════════════════════════════════════');
console.log('✅ TODOS LOS TESTS DE ZIP BUILDER PASARON');
console.log('═══════════════════════════════════════════════════\n');

console.log('💡 El módulo ZIP Builder está listo para:\n');
console.log('   - Generar ZIP de XMLs firmados');
console.log('   - Extraer CDR de respuestas SUNAT');
console.log('   - Nombres de archivo compatibles con SUNAT');
console.log('   - Mapeo correcto de tipos de documento\n');
