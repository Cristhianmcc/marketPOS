// Verificar usuarios en AWS RDS
const { PrismaClient } = require('@prisma/client');

const cloudUrl = 'postgresql://marketadmin:Kikomoreno1@market-pos-db.cbsuesi8i2vk.us-east-2.rds.amazonaws.com:5432/market_pos';

const prisma = new PrismaClient({
  datasources: {
    db: { url: cloudUrl }
  }
});

async function main() {
  try {
    console.log('Conectando a AWS RDS...');
    
    const users = await prisma.user.findMany({
      where: { role: 'OWNER' },
      select: { 
        email: true, 
        name: true,
        password: true // Para ver el hash
      }
    });
    
    console.log('Usuarios OWNER encontrados:', users.length);
    users.forEach(u => {
      console.log(`- ${u.email} (${u.name})`);
      console.log(`  Hash: ${u.password.substring(0, 20)}...`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
