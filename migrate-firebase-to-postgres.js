require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function initFirebase() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
    console.log('✅ Firebase Admin initialized for migration');
  } else {
    throw new Error('Firebase service account not found at ' + serviceAccountPath);
  }
}

async function migrateData() {
  await initFirebase();
  const db = admin.firestore();

  console.log('\n🚀 Starting Firebase to PostgreSQL Migration...\n');

  try {
    // 1. Migrate Users
    console.log('Migrating Users...');
    const usersSnap = await db.collection('users').get();
    const users = [];
    usersSnap.forEach(doc => {
      const data = doc.data();
      users.push({
        id: doc.id,
        firebaseUid: data.uid || doc.id,
        email: data.email || null,
        phone: data.phone || data.mobile || null,
        displayName: data.name || data.displayName || null,
        role: data.role || 'Owner',
        permissions: data.permissions || {},
        isActive: data.isActive ?? true,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
      });
    });
    // Insert Users
    if (users.length > 0) {
      await prisma.user.createMany({ data: users, skipDuplicates: true });
      console.log(`✅ Migrated ${users.length} Users`);
    }

    // 2. Migrate Stores
    console.log('\nMigrating Stores...');
    const storesSnap = await db.collection('store').get();
    const stores = [];
    storesSnap.forEach(doc => {
      const data = doc.data();
      stores.push({
        id: doc.id,
        storeName: data.storeName || data.name || 'Unnamed Store',
        ownerUid: data.ownerUid || doc.id,
        ownerEmail: data.ownerEmail || null,
        businessType: data.businessType || null,
        phone: data.phone || data.mobile || null,
        address: data.address || null,
        plan: data.plan || 'Free',
        currency: data.currency || 'INR',
        currencySymbol: data.currencySymbol || '₹',
        nextInvoiceNumber: parseInt(data.nextInvoiceNumber) || 100001,
        nextQuotationNumber: parseInt(data.nextQuotationNumber) || 100001,
        nextPurchaseNumber: parseInt(data.nextPurchaseNumber) || 100001,
        nextExpenseNumber: parseInt(data.nextExpenseNumber) || 100001,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
      });
    });
    if (stores.length > 0) {
      await prisma.store.createMany({ data: stores, skipDuplicates: true });
      console.log(`✅ Migrated ${stores.length} Stores`);
    }

    // Since many objects require storeId, we should fetch valid store IDs first
    const validStores = new Set(stores.map(s => s.id));

    // 3. Migrate Products
    console.log('\nMigrating Products...');
    const productsSnap = await db.collectionGroup('Products').get();
    const products = [];
    productsSnap.forEach(doc => {
      const data = doc.data();
      const storeId = doc.ref.parent.parent?.id;
      if (storeId && validStores.has(storeId)) {
        products.push({
          id: doc.id,
          storeId: storeId,
          name: data.name || data.productName || 'Unnamed Product',
          productCode: data.productCode || null,
          category: data.category || null,
          price: parseFloat(data.price) || parseFloat(data.salePrice) || 0,
          cost: parseFloat(data.cost) || parseFloat(data.purchasePrice) || 0,
          currentStock: parseFloat(data.currentStock) || parseFloat(data.stock) || 0,
          unit: data.unit || null,
          taxes: data.taxes || [],
          isActive: data.isActive ?? true,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        });
      }
    });
    if (products.length > 0) {
      await prisma.product.createMany({ data: products, skipDuplicates: true });
      console.log(`✅ Migrated ${products.length} Products`);
    }

    // 4. Migrate Customers
    console.log('\nMigrating Customers...');
    const customersSnap = await db.collectionGroup('customers').get();
    const customers = [];
    customersSnap.forEach(doc => {
      const data = doc.data();
      const storeId = doc.ref.parent.parent?.id;
      if (storeId && validStores.has(storeId)) {
        customers.push({
          id: doc.id,
          storeId: storeId,
          name: data.name || data.customerName || 'Unknown',
          phone: data.phone || data.mobile || 'Unknown',
          email: data.email || null,
          address: data.address || null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        });
      }
    });
    if (customers.length > 0) {
      await prisma.customer.createMany({ data: customers, skipDuplicates: true });
      console.log(`✅ Migrated ${customers.length} Customers`);
    }

    // 5. Migrate Sales (Invoices)
    console.log('\nMigrating Sales...');
    const salesSnap = await db.collectionGroup('sales').get();
    const sales = [];
    salesSnap.forEach(doc => {
      const data = doc.data();
      const storeId = doc.ref.parent.parent?.id;
      if (storeId && validStores.has(storeId)) {
        sales.push({
          id: doc.id,
          storeId: storeId,
          invoiceNumber: data.invoiceNumber || data.id || doc.id,
          items: data.items || [],
          subtotal: parseFloat(data.subtotal) || 0,
          taxTotal: parseFloat(data.taxTotal) || parseFloat(data.tax) || 0,
          discount: parseFloat(data.discount) || 0,
          total: parseFloat(data.total) || 0,
          paymentMode: data.paymentMode || 'Cash',
          paymentStatus: data.paymentStatus || 'completed',
          customerName: data.customerName || null,
          customerPhone: data.customerPhone || null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        });
      }
    });
    if (sales.length > 0) {
      await prisma.sale.createMany({ data: sales, skipDuplicates: true });
      console.log(`✅ Migrated ${sales.length} Sales`);
    }

    console.log('\n🎉 Migration Completed Successfully!');

  } catch (err) {
    console.error('\n❌ Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

migrateData();
