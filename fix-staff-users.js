require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function fixStaffUsers() {
  // Init Firebase
  const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
  }
  const db = admin.firestore();

  console.log('🔍 Looking at Firestore user documents for storeId fields...\n');

  // Get all users from Firestore
  const usersSnap = await db.collection('users').get();
  let fixed = 0;
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const firebaseUid = data.uid || doc.id;
    const storeId = data.storeId ? String(data.storeId) : data.store_id ? String(data.store_id) : null;
    const email = data.email || null;

    if (!storeId) {
      skipped++;
      continue;
    }

    // Find user in PostgreSQL
    const pgUser = await prisma.user.findUnique({
      where: { firebaseUid }
    });

    if (!pgUser) {
      console.log(`⚠️  No PG user for UID: ${firebaseUid} (${email})`);
      continue;
    }

    if (pgUser.storeId === storeId) {
      // Already linked correctly
      continue;
    }

    // Check if the store exists
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      console.log(`⚠️  Store ${storeId} not found for ${email}`);
      continue;
    }

    await prisma.user.update({
      where: { id: pgUser.id },
      data: { storeId: storeId }
    });

    console.log(`✅ Fixed ${email || firebaseUid} -> store ${storeId} (${store.storeName})`);
    fixed++;
  }

  console.log(`\n✅ Done! Fixed: ${fixed}, Skipped (no storeId): ${skipped}`);

  // Also check the specific failing user
  console.log('\n🔍 Checking profitudeindia@gmail.com specifically...');
  const firestoreResult = await db.collection('users').where('email', '==', 'profitudeindia@gmail.com').get();
  if (!firestoreResult.empty) {
    firestoreResult.forEach(doc => {
      console.log('Firestore data:', JSON.stringify(doc.data(), null, 2));
    });
  } else {
    console.log('❌ Not found in Firestore users collection!');
    // Try looking in store subcollections
    console.log('🔍 Searching in store subcollections...');
    const storesSnap = await db.collection('store').get();
    for (const storeDoc of storesSnap.docs) {
      const subUsers = await storeDoc.ref.collection('users')
        .where('email', '==', 'profitudeindia@gmail.com').get();
      if (!subUsers.empty) {
        subUsers.forEach(u => {
          console.log(`Found in store ${storeDoc.id}:`, JSON.stringify(u.data(), null, 2));
        });
      }
    }
  }

  await prisma.$disconnect();
}

fixStaffUsers().catch(console.error);
