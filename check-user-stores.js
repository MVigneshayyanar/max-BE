const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserStores() {
  const users = await prisma.user.findMany({
    select: { id: true, firebaseUid: true, email: true, role: true, storeId: true }
  });
  console.log('Users in DB with Store IDs:');
  console.dir(users.filter(u => u.storeId != null).slice(0, 10), { depth: null });
  
  const unlinked = users.filter(u => u.storeId == null);
  console.log(`\nTotal Users: ${users.length}`);
  console.log(`Unlinked Users (storeId is null): ${unlinked.length}`);
  if (unlinked.length > 0) {
    console.log('Sample Unlinked Users:');
    console.dir(unlinked.slice(0, 5), { depth: null });
  }

  await prisma.$disconnect();
}

checkUserStores().catch(console.error);
