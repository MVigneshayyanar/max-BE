require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');

async function exploreFirestoreStructure() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(path.join(__dirname, 'firebase-service-account.json'))),
    });
  }
  const db = admin.firestore();

  console.log('🔍 Exploring full Firestore structure...\n');

  // 1. List all root collections
  const rootCollections = await db.listCollections();
  console.log('📂 ROOT COLLECTIONS:');
  for (const col of rootCollections) {
    console.log(`  - ${col.id}`);
  }

  // 2. For each root collection, show sample document fields + subcollections
  console.log('\n📄 COLLECTION DETAILS:\n');
  for (const col of rootCollections) {
    const snap = await col.limit(2).get();
    if (snap.empty) {
      console.log(`[${col.id}] (empty)`);
      continue;
    }

    const sample = snap.docs[0];
    console.log(`\n[${col.id}] - ${snap.size} sample docs`);
    console.log(`  Fields: ${Object.keys(sample.data()).join(', ')}`);
    console.log(`  Sample ID: ${sample.id}`);

    // Check subcollections on first document
    const subCols = await sample.ref.listCollections();
    if (subCols.length > 0) {
      console.log(`  📁 Subcollections:`);
      for (const sub of subCols) {
        const subSnap = await sub.limit(1).get();
        if (!subSnap.empty) {
          const subSample = subSnap.docs[0];
          console.log(`    - ${sub.id} (fields: ${Object.keys(subSample.data()).join(', ')})`);

          // Check sub-subcollections
          const subSubCols = await subSample.ref.listCollections();
          for (const subSub of subSubCols) {
            const subSubSnap = await subSub.limit(1).get();
            if (!subSubSnap.empty) {
              console.log(`      - ${subSub.id} (fields: ${Object.keys(subSubSnap.docs[0].data()).join(', ')})`);
            }
          }
        } else {
          console.log(`    - ${sub.id} (empty)`);
        }
      }
    }
  }

  // 3. Specifically check store subcollections (most important)
  console.log('\n\n📦 STORE SUBCOLLECTIONS (full scan of first store):');
  const storeSnap = await db.collection('store').limit(1).get();
  if (!storeSnap.empty) {
    const storeDoc = storeSnap.docs[0];
    console.log(`Store ID: ${storeDoc.id}`);
    console.log(`Store Fields: ${Object.keys(storeDoc.data()).join(', ')}`);
    const storeSubs = await storeDoc.ref.listCollections();
    for (const sub of storeSubs) {
      const subSnap = await sub.limit(2).get();
      console.log(`\n  📁 store/${storeDoc.id}/${sub.id}:`);
      if (!subSnap.empty) {
        console.log(`    Fields: ${Object.keys(subSnap.docs[0].data()).join(', ')}`);
        console.log(`    Sample doc ID: ${subSnap.docs[0].id}`);
        // Count total
        const countSnap = await sub.get();
        console.log(`    Total docs: ${countSnap.size}`);
      }
    }
  }

  console.log('\n✅ Done exploring!');
}

exploreFirestoreStructure().catch(console.error);
