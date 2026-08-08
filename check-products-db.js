const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProducts() {
  const products = await prisma.product.findMany({
    take: 30,
    select: { id: true, storeId: true, name: true, category: true, price: true, productCode: true }
  });
  console.log('Sample Products in DB:');
  console.dir(products, { depth: null });
  await prisma.$disconnect();
}

checkProducts().catch(console.error);
