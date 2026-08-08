require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const path = require('path');

const prisma = new PrismaClient();

function toDate(val) {
  if (!val) return new Date();
  if (val._seconds) return new Date(val._seconds * 1000);
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

function toFloat(val) { return parseFloat(val) || 0; }
function toInt(val) { return parseInt(val) || 0; }
function toStr(val) { return val != null ? String(val) : null; }

async function initFirebase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(path.join(__dirname, 'firebase-service-account.json'))),
    });
  }
  return admin.firestore();
}

async function migrateAll() {
  const db = await initFirebase();
  console.log('\n🚀 Starting COMPLETE Firebase → PostgreSQL Migration\n');
  console.log('='.repeat(60));

  // ── STEP 1: USERS (root collection) ──────────────────────────
  console.log('\n[1/12] Migrating Users...');
  const usersSnap = await db.collection('users').get();
  let userCount = 0;
  for (const doc of usersSnap.docs) {
    const d = doc.data();
    const firebaseUid = d.uid || doc.id;
    try {
      await prisma.user.upsert({
        where: { firebaseUid },
        update: {
          email: d.email || null,
          phone: toStr(d.phone),
          displayName: d.name || d.displayName || null,
          role: d.role || 'Owner',
          permissions: d.permissions || {},
          isActive: d.isActive ?? true,
          storeId: d.storeId ? toStr(d.storeId) : undefined,
        },
        create: {
          firebaseUid,
          email: d.email || null,
          phone: toStr(d.phone),
          displayName: d.name || d.displayName || null,
          role: d.role || 'Owner',
          permissions: d.permissions || {},
          isActive: d.isActive ?? true,
          storeId: d.storeId ? toStr(d.storeId) : undefined,
          createdAt: toDate(d.createdAt),
        },
      });
      userCount++;
    } catch (e) { console.log(`  ⚠️  User ${firebaseUid}: ${e.message}`); }
  }
  console.log(`  ✅ ${userCount} Users`);

  // ── STEP 2: STORES ───────────────────────────────────────────
  console.log('\n[2/12] Migrating Stores (with correct field names)...');
  const storesSnap = await db.collection('store').get();
  let storeCount = 0;
  for (const doc of storesSnap.docs) {
    const d = doc.data();
    try {
      await prisma.store.upsert({
        where: { id: doc.id },
        update: {
          storeName: d.businessName || d.storeName || d.name || 'Unnamed Store',
          ownerUid: d.ownerUid || '',
          ownerEmail: d.ownerEmail || d.email || null,
          businessType: d.licenseType || null,
          phone: toStr(d.businessPhone || d.ownerPhone || d.personalPhone),
          address: d.businessLocation || d.address || null,
          gstNumber: d.gstin || null,
          plan: d.plan || 'Free',
          currency: d.currency || 'INR',
          currencySymbol: d.currency === 'USD' ? '$' : '₹',
          invoicePrefix: d.invoicePrefix || '',
          quotationPrefix: d.quotationPrefix || '',
          purchasePrefix: d.purchasePrefix || '',
          expensePrefix: d.expensePrefix || '',
          paymentReceiptPrefix: d.paymentReceiptPrefix || '',
          nextInvoiceNumber: toInt(d.nextInvoiceNumber) || 100001,
          nextQuotationNumber: toInt(d.nextQuotationNumber) || 100001,
          nextPurchaseNumber: toInt(d.nextPurchaseNumber) || 100001,
          nextExpenseNumber: toInt(d.nextExpenseNumber) || 100001,
          nextPaymentReceiptNumber: toInt(d.nextPaymentReceiptNumber) || 100001,
          logoUrl: d.logoUrl || null,
          subscriptionExpiryDate: d.subscriptionExpiryDate ? toDate(d.subscriptionExpiryDate) : null,
        },
        create: {
          id: doc.id,
          storeName: d.businessName || d.storeName || d.name || 'Unnamed Store',
          ownerUid: d.ownerUid || '',
          ownerEmail: d.ownerEmail || d.email || null,
          businessType: d.licenseType || null,
          phone: toStr(d.businessPhone || d.ownerPhone || d.personalPhone),
          address: d.businessLocation || d.address || null,
          gstNumber: d.gstin || null,
          plan: d.plan || 'Free',
          currency: d.currency || 'INR',
          currencySymbol: d.currency === 'USD' ? '$' : '₹',
          invoicePrefix: d.invoicePrefix || '',
          quotationPrefix: d.quotationPrefix || '',
          purchasePrefix: d.purchasePrefix || '',
          expensePrefix: d.expensePrefix || '',
          paymentReceiptPrefix: d.paymentReceiptPrefix || '',
          nextInvoiceNumber: toInt(d.nextInvoiceNumber) || 100001,
          nextQuotationNumber: toInt(d.nextQuotationNumber) || 100001,
          nextPurchaseNumber: toInt(d.nextPurchaseNumber) || 100001,
          nextExpenseNumber: toInt(d.nextExpenseNumber) || 100001,
          nextPaymentReceiptNumber: toInt(d.nextPaymentReceiptNumber) || 100001,
          logoUrl: d.logoUrl || null,
          subscriptionExpiryDate: d.subscriptionExpiryDate ? toDate(d.subscriptionExpiryDate) : null,
          createdAt: toDate(d.createdAt),
        },
      });
      storeCount++;
    } catch (e) { console.log(`  ⚠️  Store ${doc.id}: ${e.message}`); }
  }
  console.log(`  ✅ ${storeCount} Stores`);

  const allStores = await prisma.store.findMany({ select: { id: true } });
  const validStoreIds = new Set(allStores.map(s => s.id));

  // ── STEP 3: PRODUCTS (both 'Products' and 'products') ────────
  console.log('\n[3/12] Migrating Products...');
  let productCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    for (const collName of ['Products', 'products']) {
      const snap = await storeDoc.ref.collection(collName).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        const name = d.itemName || d.name || 'Unnamed Product';
        const productCode = d.productCode || d.barcode || null;
        try {
          await prisma.product.upsert({
            where: { storeId_productCode: { storeId: storeDoc.id, productCode: productCode || doc.id } },
            update: {
              name,
              category: d.category || null,
              price: toFloat(d.salePrice || d.price),
              cost: toFloat(d.purchasePrice || d.costPrice),
              currentStock: toFloat(d.currentStock || d.quantity),
              unit: d.unit || d.stockUnit || null,
              barcode: d.barcode || null,
              hsnCode: d.hsnCode || d.hsn || null,
              taxType: d.taxType || null,
              isActive: d.isActive ?? true,
            },
            create: {
              storeId: storeDoc.id,
              name,
              productCode: productCode || doc.id,
              category: d.category || null,
              price: toFloat(d.salePrice || d.price),
              cost: toFloat(d.purchasePrice || d.costPrice),
              currentStock: toFloat(d.currentStock || d.quantity),
              unit: d.unit || d.stockUnit || null,
              barcode: d.barcode || null,
              hsnCode: d.hsnCode || d.hsn || null,
              taxType: d.taxType || null,
              isActive: d.isActive ?? true,
              createdAt: toDate(d.createdAt),
            },
          });
          productCount++;
        } catch (e) { /* skip dup */ }
      }
    }
  }
  console.log(`  ✅ ${productCount} Products`);

  // ── STEP 4: CUSTOMERS ─────────────────────────────────────────
  console.log('\n[4/12] Migrating Customers...');
  let customerCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('customers').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const phone = toStr(d.phone || doc.id) || 'Unknown';
      try {
        await prisma.customer.upsert({
          where: { storeId_phone: { storeId: storeDoc.id, phone } },
          update: {
            name: d.name || 'Unknown',
            address: d.address || null,
            gstNumber: d.gstin || d.gst || null,
            balance: toFloat(d.balance),
            totalSales: toFloat(d.totalSales),
          },
          create: {
            storeId: storeDoc.id,
            name: d.name || 'Unknown',
            phone,
            address: d.address || null,
            gstNumber: d.gstin || d.gst || null,
            balance: toFloat(d.balance),
            totalSales: toFloat(d.totalSales),
            createdAt: toDate(d.timestamp || d.createdAt),
          },
        });
        customerCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${customerCount} Customers`);

  // ── STEP 5: SALES ─────────────────────────────────────────────
  console.log('\n[5/12] Migrating Sales...');
  let saleCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('sales').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const invoiceNumber = toStr(d.invoiceNumber || doc.id);
      try {
        await prisma.sale.upsert({
          where: { storeId_invoiceNumber: { storeId: storeDoc.id, invoiceNumber } },
          update: {},
          create: {
            storeId: storeDoc.id,
            invoiceNumber,
            items: d.items || [],
            subtotal: toFloat(d.subtotal),
            taxTotal: toFloat(d.totalTax),
            discount: toFloat(d.discount),
            total: toFloat(d.total),
            paymentMode: d.paymentMode || 'Cash',
            paymentStatus: 'completed',
            customerName: d.customerName || null,
            customerPhone: toStr(d.customerPhone),
            cashReceived: toFloat(d.cashReceived),
            staffName: d.staffName || null,
            notes: d.customNote || null,
            createdAt: toDate(d.timestamp || d.date),
          },
        });
        saleCount++;
      } catch (e) { /* skip dup */ }
    }
  }
  console.log(`  ✅ ${saleCount} Sales`);

  // ── STEP 6: CATEGORIES ────────────────────────────────────────
  console.log('\n[6/12] Migrating Categories...');
  let catCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('categories').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      try {
        await prisma.category.upsert({
          where: { storeId_name: { storeId: storeDoc.id, name: d.name || doc.id } },
          update: {},
          create: { storeId: storeDoc.id, name: d.name || doc.id, createdAt: toDate(d.createdAt) },
        });
        catCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${catCount} Categories`);

  // ── STEP 7: QUOTATIONS ────────────────────────────────────────
  console.log('\n[7/12] Migrating Quotations...');
  let quotCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('quotations').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const quotationNumber = toStr(d.quotationNumber || doc.id);
      try {
        await prisma.quotation.upsert({
          where: { storeId_quotationNumber: { storeId: storeDoc.id, quotationNumber } },
          update: {},
          create: {
            storeId: storeDoc.id,
            quotationNumber,
            items: d.items || [],
            subtotal: toFloat(d.subtotal),
            discount: toFloat(d.discount),
            total: toFloat(d.total),
            customerName: d.customerName || null,
            customerPhone: toStr(d.customerPhone),
            status: d.status || 'pending',
            createdAt: toDate(d.timestamp || d.date),
          },
        });
        quotCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${quotCount} Quotations`);

  // ── STEP 8: EXPENSES ──────────────────────────────────────────
  console.log('\n[8/12] Migrating Expenses...');
  let expCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('expenses').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      try {
        await prisma.expense.create({
          data: {
            storeId: storeDoc.id,
            category: d.expenseType || null,
            type: d.expenseName || null,
            amount: toFloat(d.amount),
            paymentMode: d.paymentMode || null,
            createdAt: toDate(d.timestamp),
          },
        });
        expCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${expCount} Expenses`);

  // ── STEP 9: VENDORS ───────────────────────────────────────────
  console.log('\n[9/12] Migrating Vendors...');
  let vendorCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('vendors').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      try {
        await prisma.vendor.create({
          data: {
            storeId: storeDoc.id,
            name: d.name || 'Unknown Vendor',
            phone: toStr(d.phone),
            gstNumber: d.gstin || null,
            createdAt: toDate(d.createdAt),
          },
        });
        vendorCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${vendorCount} Vendors`);

  // ── STEP 10: STOCK PURCHASES ──────────────────────────────────
  console.log('\n[10/12] Migrating Stock Purchases...');
  let spCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('stockPurchases').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      try {
        await prisma.stockPurchase.create({
          data: {
            storeId: storeDoc.id,
            vendorName: d.supplierName || null,
            items: d.items || [],
            total: toFloat(d.totalAmount),
            taxTotal: toFloat(d.taxAmount),
            paymentMode: d.paymentMode || null,
            notes: d.notes || null,
            createdAt: toDate(d.timestamp),
          },
        });
        spCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${spCount} Stock Purchases`);

  // ── STEP 11: CREDIT NOTES ─────────────────────────────────────
  console.log('\n[11/12] Migrating Credit Notes...');
  let cnCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;
    const snap = await storeDoc.ref.collection('creditNotes').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const creditNoteNumber = toStr(d.creditNoteNumber || doc.id);
      try {
        await prisma.creditNote.upsert({
          where: { storeId_creditNoteNumber: { storeId: storeDoc.id, creditNoteNumber } },
          update: {},
          create: {
            storeId: storeDoc.id,
            creditNoteNumber,
            amount: toFloat(d.amount),
            originalAmount: toFloat(d.amount),
            status: d.status || 'Active',
            customerName: d.customerName || null,
            customerPhone: toStr(d.customerPhone),
            invoiceNumber: toStr(d.invoiceNumber),
            items: d.items || [],
            reason: d.reason || null,
            createdAt: toDate(d.timestamp),
          },
        });
        cnCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${cnCount} Credit Notes`);

  // ── STEP 12: TAX PROFILES, ROLES, CREDIT LOGS ────────────────
  console.log('\n[12/12] Migrating Tax Profiles, Roles & Credit Logs...');
  let taxCount = 0, roleCount = 0, creditLogCount = 0;
  for (const storeDoc of storesSnap.docs) {
    if (!validStoreIds.has(storeDoc.id)) continue;

    // Taxes
    const taxSnap = await storeDoc.ref.collection('taxes').get();
    for (const doc of taxSnap.docs) {
      const d = doc.data();
      try {
        await prisma.taxProfile.create({
          data: { storeId: storeDoc.id, name: d.name || doc.id, percentage: toFloat(d.percentage), isActive: d.isActive ?? true, createdAt: toDate(d.createdAt) },
        });
        taxCount++;
      } catch (e) { /* skip */ }
    }

    // Roles
    const rolesSnap = await storeDoc.ref.collection('roles').get();
    for (const doc of rolesSnap.docs) {
      const d = doc.data();
      try {
        await prisma.role.upsert({
          where: { storeId_name: { storeId: storeDoc.id, name: d.name || doc.id } },
          update: { permissions: d.permissions || {} },
          create: { storeId: storeDoc.id, name: d.name || doc.id, permissions: d.permissions || {}, createdAt: toDate(d.createdAt) },
        });
        roleCount++;
      } catch (e) { /* skip */ }
    }

    // Credit Logs (credits collection)
    const creditsSnap = await storeDoc.ref.collection('credits').get();
    for (const doc of creditsSnap.docs) {
      const d = doc.data();
      try {
        await prisma.creditLog.create({
          data: {
            storeId: storeDoc.id,
            customerId: toStr(d.customerId || d.customerName || 'unknown'),
            customerName: d.customerName || null,
            amount: toFloat(d.amount),
            type: d.type || 'credit',
            method: d.method || null,
            invoiceNumber: toStr(d.invoiceNumber),
            note: d.note || null,
            date: toDate(d.timestamp || d.date),
            createdAt: toDate(d.timestamp || d.date),
          },
        });
        creditLogCount++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  ✅ ${taxCount} Tax Profiles`);
  console.log(`  ✅ ${roleCount} Roles`);
  console.log(`  ✅ ${creditLogCount} Credit Logs`);

  // ── FINAL: LINK USERS TO STORES ──────────────────────────────
  console.log('\n🔗 Linking all users to their stores...');
  const allStoresList = await prisma.store.findMany({ select: { id: true, ownerUid: true, ownerEmail: true, storeName: true } });
  let linkedCount = 0;
  for (const store of allStoresList) {
    const user = await prisma.user.findUnique({ where: { firebaseUid: store.ownerUid } });
    if (user && !user.storeId) {
      await prisma.user.update({ where: { id: user.id }, data: { storeId: store.id } });
      linkedCount++;
    }
  }
  console.log(`  ✅ Linked ${linkedCount} owners to stores`);

  console.log('\n' + '='.repeat(60));
  console.log('🎉 COMPLETE Migration Finished!');
  console.log(`   Users: ${userCount}`);
  console.log(`   Stores: ${storeCount} (with correct business names!)`);
  console.log(`   Products: ${productCount}`);
  console.log(`   Customers: ${customerCount}`);
  console.log(`   Sales: ${saleCount}`);
  console.log(`   Categories: ${catCount}`);
  console.log(`   Quotations: ${quotCount}`);
  console.log(`   Expenses: ${expCount}`);
  console.log(`   Vendors: ${vendorCount}`);
  console.log(`   Stock Purchases: ${spCount}`);
  console.log(`   Credit Notes: ${cnCount}`);
  console.log(`   Tax Profiles: ${taxCount}`);
  console.log(`   Roles: ${roleCount}`);
  console.log(`   Credit Logs: ${creditLogCount}`);

  await prisma.$disconnect();
}

migrateAll().catch(console.error);
