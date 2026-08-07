const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/subscriptions/current ──────────────
router.get('/current', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { plan: true, subscriptionExpiryDate: true, isTrial: true },
    });

    if (!store) return res.json({ plan: 'Free', expiryDate: null, isTrial: false });

    res.json({
      plan: store.plan,
      expiryDate: store.subscriptionExpiryDate,
      isTrial: store.isTrial,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ─── POST /api/subscriptions/activate ────────────
// Activate plan after Razorpay payment verification
router.post('/activate', async (req, res) => {
  try {
    const { plan, expiryDate, paymentId, isTrial } = req.body;

    if (!plan || !expiryDate) {
      return res.status(400).json({ error: 'Plan and expiry date required' });
    }

    const store = await prisma.store.update({
      where: { id: req.storeId },
      data: {
        plan,
        subscriptionExpiryDate: new Date(expiryDate),
        isTrial: isTrial || false,
      },
    });

    res.json({
      plan: store.plan,
      expiryDate: store.subscriptionExpiryDate,
      isTrial: store.isTrial,
    });
  } catch (error) {
    console.error('Activate subscription error:', error);
    res.status(500).json({ error: 'Failed to activate subscription' });
  }
});

module.exports = router;
