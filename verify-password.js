// Verificar password contra AWS RDS
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const cloudUrl = 'postgresql://marketadmin:Kikomoreno1@market-pos-db.cbsuesi8i2vk.us-east-2.rds.amazonaws.com:5432/market_pos';

const prisma = new PrismaClient({
  datasources: {
    db: { url: cloudUrl }
  }
});

async function main() {
  // Cambia esto por el password que estás probando
  const testEmail = 'owner@bodega.com';
  const testPassword = process.argv[2] || 'password123';
  
  try {
    console.log(`Verificando: ${testEmail} con password: "${testPassword}"`);
    
    const user = await prisma.user.findUnique({
      where: { email: testEmail }
    });
    
    if (!user) {
      console.log('Usuario no encontrado');
      return;
    }
    
    console.log('Usuario encontrado:', user.name);
    console.log('Hash almacenado:', user.password);
    
    const isValid = await bcrypt.compare(testPassword, user.password);
    console.log('Password válido:', isValid ? 'SÍ' : 'NO');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
