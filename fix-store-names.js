require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const path = require('path');

const prisma = new PrismaClient();

async function fixStoreNames() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(path.join(__dirname, 'firebase-service-account.json'))),
    });
  }
  const db = admin.firestore();

  console.log('🏪 Fixing store names from Firestore...\n');

  const storesSnap = await db.collection('store').get();
  let fixed = 0;

  for (const doc of storesSnap.docs) {
    const data = doc.data();
    // Try all possible name fields
    const storeName = data.storeName || data.name || data.businessName || data.shopName || data.store_name || null;
    const address = data.address || data.shopAddress || data.storeAddress || null;
    const phone = data.phone || data.mobile || data.contactNumber || null;
    const gstNumber = data.gstNumber || data.gst || data.gstin || null;
    const city = data.city || data.district || null;

    if (!storeName) {
      console.log(`⚠️  No name found for store ${doc.id}, fields: ${Object.keys(data).join(', ')}`);
      continue;
    }

    await prisma.store.update({
      where: { id: doc.id },
      data: {
        storeName,
        ...(address && { address }),
        ...(phone && { phone }),
        ...(gstNumber && { gstNumber }),
        ...(city && { city }),
      }
    }).catch(e => {
      console.log(`⚠️  Store ${doc.id} not in DB: ${e.message}`);
    });

    console.log(`✅ ${doc.id}: "${storeName}"`);
    fixed++;
  }

  console.log(`\n✅ Done! Fixed ${fixed} store names.`);
  await prisma.$disconnect();
}

fixStoreNames().catch(console.error);
