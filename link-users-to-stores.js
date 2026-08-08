require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function linkUsersToStores() {
  console.log('🔗 Linking users to their stores...\n');

  // Get all stores with their ownerUid
  const stores = await prisma.store.findMany({
    select: { id: true, ownerUid: true, ownerEmail: true, storeName: true }
  });

  console.log(`Found ${stores.length} stores`);

  let updated = 0;
  let alreadyLinked = 0;
  let notFound = 0;

  for (const store of stores) {
    // Find user by firebaseUid matching store's ownerUid
    const user = await prisma.user.findUnique({
      where: { firebaseUid: store.ownerUid },
    });

    if (!user) {
      // Also try by email
      const userByEmail = store.ownerEmail ? await prisma.user.findFirst({
        where: { email: store.ownerEmail }
      }) : null;

      if (userByEmail && !userByEmail.storeId) {
        await prisma.user.update({
          where: { id: userByEmail.id },
          data: { storeId: store.id }
        });
        console.log(`✅ Linked (by email) ${store.ownerEmail} -> store "${store.storeName}"`);
        updated++;
      } else {
        notFound++;
      }
      continue;
    }

    if (user.storeId === store.id) {
      alreadyLinked++;
      continue;
    }

    // Update user to link to their store
    await prisma.user.update({
      where: { id: user.id },
      data: { storeId: store.id }
    });

    console.log(`✅ Linked ${user.email || user.firebaseUid} -> store "${store.storeName}"`);
    updated++;
  }

  console.log(`\n✅ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Already linked: ${alreadyLinked}`);
  console.log(`   No user found: ${notFound}`);

  await prisma.$disconnect();
}

linkUsersToStores().catch(console.error);
