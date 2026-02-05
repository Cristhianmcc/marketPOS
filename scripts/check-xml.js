const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const doc = await p.electronicDocument.findFirst({
    where: { fullNumber: 'F001-00000003' }
  });
  
  if (doc && doc.xmlSigned) {
    console.log('=== FULL xmlSigned ===');
    console.log(doc.xmlSigned);
    console.log('\n=== DOCUMENT INFO ===');
    console.log('fullNumber:', doc.fullNumber);
    console.log('status:', doc.status);
  } else {
    console.log('No document F001-00000003 found');
  }
}

main().finally(() => p.$disconnect());
