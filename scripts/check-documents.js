const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.electronicDocument.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      docType: true,
      series: true,
      number: true,
      status: true,
      sunatCode: true,
      sunatMessage: true,
      createdAt: true,
      saleId: true,
    }
  });
  
  console.log('\n📄 ÚLTIMOS DOCUMENTOS ELECTRÓNICOS:\n');
  docs.forEach((doc, i) => {
    console.log(`${i+1}. ${doc.docType} ${doc.series}-${String(doc.number).padStart(8, '0')}`);
    console.log(`   Estado: ${doc.status}`);
    console.log(`   SUNAT: ${doc.sunatCode || '-'} - ${doc.sunatMessage || '-'}`);
    console.log(`   Venta: ${doc.saleId || '-'}`);
    console.log(`   Fecha: ${doc.createdAt}`);
    console.log('');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
