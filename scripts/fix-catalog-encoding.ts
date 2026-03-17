import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const replacements = [
  ['Az??car', 'Azúcar'],
  ['L??cteos', 'Lácteos'],
  ['Panader??a', 'Panadería'],
  ['Alcoh??licas', 'Alcohólicas'],
  ['Cl??sico', 'Clásico'],
  ['Franc??s', 'Francés'],
];

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function run() {
  for (const [bad, good] of replacements) {
    const badEscaped = escapeSql(bad);
    const goodEscaped = escapeSql(good);
    await prisma.$executeRawUnsafe(
      `UPDATE store_products SET catalog_title = REPLACE(catalog_title, '${badEscaped}', '${goodEscaped}') WHERE catalog_title LIKE '%${badEscaped}%'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE store_products SET catalog_category = REPLACE(catalog_category, '${badEscaped}', '${goodEscaped}') WHERE catalog_category LIKE '%${badEscaped}%'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE products_master SET name = REPLACE(name, '${badEscaped}', '${goodEscaped}') WHERE name LIKE '%${badEscaped}%'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE products_master SET category = REPLACE(category, '${badEscaped}', '${goodEscaped}') WHERE category LIKE '%${badEscaped}%'`,
    );
  }
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[fix-catalog-encoding] Error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
