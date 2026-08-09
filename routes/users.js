const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../config/db');

router.use(authMiddleware);

// ─── GET /api/users ─────────────────────────────
// Get all users in current store (staff + owner)
router.get('/', async (req, res) => {
  try {
    const where = req.storeId ? { storeId: req.storeId } : { firebaseUid: req.firebaseUid };
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, firebaseUid: true, email: true, phone: true,
        displayName: true, role: true, permissions: true, isActive: true,
        storeId: true, activeSessionId: true, activeDeviceId: true,
        activeDeviceLabel: true, activeSessionUpdatedAt: true, createdAt: true,
      },
    });
    res.json({ docs: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// ─── GET /api/users/:id ─────────────────────────
// Get a specific user by firebaseUid or internal id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Try by firebaseUid first, then by internal id
    let user = await prisma.user.findUnique({ where: { firebaseUid: id } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { id } });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ─── PUT /api/users/:id ─────────────────────────
// Update user document (called by firestore_compat.dart DocumentReference.set/update)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Only allow updating certain safe fields
    const allowedFields = [
      'displayName', 'name', 'phone', 'email', 'storeId', 'permissions', 'role', 'isActive',
      'activeSessionId', 'activeDeviceId', 'activeDeviceLabel', 'activeSessionUpdatedAt',
      'fcmTokens',
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'name') updateData.displayName = data[field];
        else if (field === 'storeId') updateData.storeId = data[field]?.toString();
        else if (field === 'activeSessionUpdatedAt' && data[field]) {
          const dateStr = String(data[field]);
          const isoStr = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : `${dateStr}Z`;
          updateData.activeSessionUpdatedAt = new Date(isoStr);
        }
        else updateData[field] = data[field];
      }
    }

    // Find user by firebaseUid first, then by internal id
    let user = await prisma.user.findUnique({ where: { firebaseUid: id } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { id } });
    }

    if (!user) {
      // Silently succeed if user doesn't exist (legacy Firestore compatibility)
      return res.json({ success: true });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── DELETE /api/users/:id ──────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Soft delete - just deactivate
    const { id } = req.params;
    let user = await prisma.user.findUnique({ where: { firebaseUid: id } });
    if (!user) user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
