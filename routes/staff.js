const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const { authMiddleware, requireStore, requireOwner } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/staff ──────────────────────────────
router.get('/', async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: { storeId: req.storeId },
      select: {
        id: true, firebaseUid: true, email: true, phone: true,
        displayName: true, role: true, permissions: true, isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ staff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list staff' });
  }
});

// ─── POST /api/staff/invite ─────────────────────
router.post('/invite', requireOwner, async (req, res) => {
  try {
    const { email, phone, displayName, role, permissions } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone required' });
    }

    // Check if user already exists in Firebase
    let firebaseUser;
    try {
      if (email) {
        firebaseUser = await admin.auth().getUserByEmail(email);
      } else {
        firebaseUser = await admin.auth().getUserByPhoneNumber(phone);
      }
    } catch (e) {
      // Create new Firebase user
      firebaseUser = await admin.auth().createUser({
        email: email || undefined,
        phoneNumber: phone || undefined,
        displayName: displayName || undefined,
      });
    }

    // Create/update user in PostgreSQL linked to this store
    const user = await prisma.user.upsert({
      where: { firebaseUid: firebaseUser.uid },
      update: {
        storeId: req.storeId,
        role: role || 'Staff',
        permissions: permissions || {},
        isActive: true,
      },
      create: {
        firebaseUid: firebaseUser.uid,
        email,
        phone,
        displayName,
        storeId: req.storeId,
        role: role || 'Staff',
        permissions: permissions || {},
      },
    });

    res.status(201).json({ staff: user });
  } catch (error) {
    console.error('Invite staff error:', error);
    res.status(500).json({ error: 'Failed to invite staff' });
  }
});

// ─── PUT /api/staff/:id ─────────────────────────
router.put('/:id', requireOwner, async (req, res) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    const { role, permissions, isActive, displayName } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(role !== undefined && { role }),
        ...(permissions !== undefined && { permissions }),
        ...(isActive !== undefined && { isActive }),
        ...(displayName !== undefined && { displayName }),
      },
    });

    res.json({ staff: user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update staff' });
  }
});

// ─── DELETE /api/staff/:id ──────────────────────
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    // Don't delete, deactivate
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false, storeId: null },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove staff' });
  }
});

module.exports = router;
