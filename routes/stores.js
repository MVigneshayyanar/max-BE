const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');

// All store routes require authentication
router.use(authMiddleware);

// ─── GET /api/stores ──────────────────────────────
// List or filter stores (e.g. by ownerUid / ownerEmail)
router.get('/', async (req, res) => {
  try {
    const { ownerUid, ownerEmail, limit = 50 } = req.query;
    const where = {};
    if (ownerUid) where.ownerUid = ownerUid;
    if (ownerEmail) where.ownerEmail = ownerEmail;

    const stores = await prisma.store.findMany({
      where,
      take: parseInt(limit),
    });

    res.json({ stores });
  } catch (error) {
    console.error('List stores error:', error);
    res.status(500).json({ error: 'Failed to list stores' });
  }
});

// ─── POST /api/stores ────────────────────────────
// Create or Update store (onboarding)
router.post('/', async (req, res) => {
  try {
    const {
      storeName, businessType, address, city, state, pincode,
      phone, gstNumber, panNumber, currency, currencySymbol,
    } = req.body;

    const firebaseUid = req.firebaseUid;
    const nameToUse = storeName || req.body.businessName || 'My Store';

    // Check if user already has a store
    let userStore = null;
    if (req.user?.storeId) {
      userStore = await prisma.store.findUnique({ where: { id: req.user.storeId } });
    }
    if (!userStore && firebaseUid) {
      userStore = await prisma.store.findFirst({
        where: {
          OR: [
            { ownerUid: firebaseUid },
            ...(req.user?.email ? [{ ownerEmail: req.user.email }] : []),
          ],
        },
      });
    }

    if (userStore) {
      // User already has a store -> Update existing store
      const updated = await prisma.store.update({
        where: { id: userStore.id },
        data: {
          storeName: nameToUse,
          businessType: businessType || userStore.businessType,
          address: address || userStore.address,
          city: city || userStore.city,
          state: state || userStore.state,
          pincode: pincode || userStore.pincode,
          phone: phone || userStore.phone,
          gstNumber: gstNumber || userStore.gstNumber,
          panNumber: panNumber || userStore.panNumber,
          currency: currency || userStore.currency,
          currencySymbol: currencySymbol || userStore.currencySymbol,
        },
      });

      if (req.user && req.user.storeId !== userStore.id) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { storeId: userStore.id },
        });
      }

      return res.json({ store: updated, user: req.user, ...updated });
    }

    // Create store and link to user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          storeName: nameToUse,
          ownerUid: firebaseUid,
          ownerEmail: req.user?.email || null,
          businessType,
          address, city, state, pincode,
          phone, gstNumber, panNumber,
          currency: currency || 'INR',
          currencySymbol: currencySymbol || '₹',
          plan: 'MAX Plus',
          isTrial: true,
        },
      });

      // Link user to store
      let updatedUser = req.user;
      if (req.user) {
        updatedUser = await tx.user.update({
          where: { id: req.user.id },
          data: { storeId: store.id },
          include: { store: true },
        });
      }

      return { store, user: updatedUser };
    });

    res.status(201).json({ ...result.store, store: result.store, user: result.user });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: 'Failed to create store: ' + error.message });
  }
});

// ─── GET /api/stores/mine ────────────────────────
// Get current user's store
router.get('/mine', async (req, res) => {
  try {
    let store = null;
    if (req.storeId) {
      store = await prisma.store.findUnique({
        where: { id: req.storeId },
      });
    }

    if (!store && req.firebaseUid) {
      store = await prisma.store.findFirst({
        where: {
          OR: [
            { ownerUid: req.firebaseUid },
            ...(req.user?.email ? [{ ownerEmail: req.user.email }] : []),
          ],
        },
      });
      if (store && req.user && !req.user.storeId) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { storeId: store.id },
        });
      }
    }

    res.json({ store, ...(store || {}) });
  } catch (error) {
    console.error('Get store error:', error);
    res.status(500).json({ error: 'Failed to get store' });
  }
});

// ─── GET /api/stores/:id ─────────────────────────
// Get store by ID (or ownerUid fallback)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      store = await prisma.store.findFirst({ where: { ownerUid: id } });
    }
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json({ store, ...store });
  } catch (error) {
    console.error('Get store by ID error:', error);
    res.status(500).json({ error: 'Failed to get store' });
  }
});

// ─── PUT /api/stores/:id ─────────────────────────
// Create or Update store details (supports onboarding when user has no store yet)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const firebaseUid = req.firebaseUid;

    // Check if user already OWNS a store in PostgreSQL
    let userStore = await prisma.store.findFirst({
      where: {
        OR: [
          { ownerUid: firebaseUid },
          ...(req.user?.email ? [{ ownerEmail: req.user.email }] : []),
        ],
      },
    });

    const storeName = body.businessName || body.storeName || 'My Store';
    const ownerEmail = body.ownerEmail || req.user?.email || null;
    const phone = body.businessPhone || body.phone || null;
    const address = body.businessLocation || body.address || null;
    const gstNumber = body.gstin || body.gstNumber || null;
    const currency = body.currency || 'INR';

    if (userStore) {
      // User ALREADY has a store -> Update existing store
      const updated = await prisma.store.update({
        where: { id: userStore.id },
        data: {
          storeName,
          phone: phone || userStore.phone,
          address: address || userStore.address,
          gstNumber: gstNumber || userStore.gstNumber,
          currency: currency || userStore.currency,
        },
      });

      // Ensure user.storeId is linked
      if (req.user && req.user.storeId !== userStore.id) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { storeId: userStore.id },
        });
      }

      return res.json({ store: updated, ...updated, storeId: updated.id });
    }

    // User DOES NOT have a store yet -> Create a new Store
    // Ensure store ID is unique in DB
    let targetStoreId = id;
    const existingById = await prisma.store.findUnique({ where: { id: targetStoreId } });
    if (existingById && existingById.ownerUid !== firebaseUid) {
      // Requested ID is taken by another user -> Generate a unique store ID
      targetStoreId = String(Date.now());
    }

    const createdStore = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          id: targetStoreId,
          storeName,
          ownerUid: firebaseUid,
          ownerEmail,
          phone,
          address,
          gstNumber,
          currency,
          plan: body.plan || 'MAX Plus',
          isTrial: body.isTrial !== undefined ? body.isTrial : true,
          subscriptionExpiryDate: body.subscriptionExpiryDate ? new Date(body.subscriptionExpiryDate) : null,
        },
      });

      if (req.user) {
        await tx.user.update({
          where: { id: req.user.id },
          data: { storeId: store.id },
        });
      }

      return store;
    });

    res.status(201).json({ store: createdStore, ...createdStore, storeId: createdStore.id });
  } catch (error) {
    console.error('Update/Create store error:', error);
    res.status(500).json({ error: 'Failed to save store details: ' + error.message });
  }
});



// ─── PUT /api/stores/:id/settings ────────────────
// Update store settings (prefixes, number sequences, bill settings)
router.put('/:id/settings', requireStore, async (req, res) => {
  try {
    if (req.params.id !== req.storeId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const settingsFields = [
      'invoicePrefix', 'quotationPrefix', 'purchasePrefix',
      'expensePrefix', 'paymentReceiptPrefix',
      'nextInvoiceNumber', 'nextQuotationNumber', 'nextPurchaseNumber',
      'nextExpenseNumber', 'nextPaymentReceiptNumber',
      'billSettings',
    ];

    const updateData = {};
    for (const field of settingsFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const store = await prisma.store.update({
      where: { id: req.storeId },
      data: updateData,
    });

    res.json({ store });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── GET /api/stores/:id/maintenance ─────────────
// Check maintenance status
router.get('/:id/maintenance', async (req, res) => {
  try {
    let settings = await prisma.maintenanceSettings.findUnique({
      where: { id: 'global' },
    });

    if (!settings) {
      settings = { isUnderMaintenance: false, minAppVersion: '1.0.0', forceUpdate: false, message: '' };
    }

    res.json(settings);
  } catch (error) {
    console.error('Maintenance check error:', error);
    res.json({ isUnderMaintenance: false, minAppVersion: '1.0.0', forceUpdate: false });
  }
});

module.exports = router;
