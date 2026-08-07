const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();

// All store routes require authentication
router.use(authMiddleware);

// ─── POST /api/stores ────────────────────────────
// Create a new store (onboarding)
router.post('/', async (req, res) => {
  try {
    const {
      storeName, businessType, address, city, state, pincode,
      phone, gstNumber, panNumber, currency, currencySymbol,
    } = req.body;

    if (!storeName) {
      return res.status(400).json({ error: 'Store name is required' });
    }

    // Check if user already has a store
    if (req.user.storeId) {
      return res.status(400).json({ error: 'User already has a store' });
    }

    // Create store and link to user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          storeName,
          ownerUid: req.firebaseUid,
          ownerEmail: req.user.email,
          businessType,
          address, city, state, pincode,
          phone, gstNumber, panNumber,
          currency: currency || 'INR',
          currencySymbol: currencySymbol || '₹',
          plan: 'Free',
        },
      });

      // Link user to store
      const user = await tx.user.update({
        where: { id: req.user.id },
        data: { storeId: store.id },
        include: { store: true },
      });

      return { store, user };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: 'Failed to create store' });
  }
});

// ─── GET /api/stores/mine ────────────────────────
// Get current user's store
router.get('/mine', async (req, res) => {
  try {
    if (!req.storeId) {
      return res.json({ store: null });
    }

    const store = await prisma.store.findUnique({
      where: { id: req.storeId },
    });

    res.json({ store });
  } catch (error) {
    console.error('Get store error:', error);
    res.status(500).json({ error: 'Failed to get store' });
  }
});

// ─── PUT /api/stores/:id ─────────────────────────
// Update store details
router.put('/:id', requireStore, async (req, res) => {
  try {
    // Ensure user can only update their own store
    if (req.params.id !== req.storeId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedFields = [
      'storeName', 'businessType', 'address', 'city', 'state', 'pincode',
      'phone', 'gstNumber', 'panNumber', 'logoUrl', 'currency', 'currencySymbol',
      'billSettings',
    ];

    const updateData = {};
    for (const field of allowedFields) {
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
    console.error('Update store error:', error);
    res.status(500).json({ error: 'Failed to update store' });
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
