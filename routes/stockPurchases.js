const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const where = { storeId: req.storeId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [purchases, total] = await Promise.all([
      prisma.stockPurchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.stockPurchase.count({ where }),
    ]);
    res.json({ purchases, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list stock purchases' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const purchase = await prisma.stockPurchase.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json({ purchase });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get purchase' });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.stockPurchase.create({
        data: {
          storeId: req.storeId,
          ...req.body,
          date: req.body.date ? new Date(req.body.date) : new Date(),
        },
      });

      // Increment product stock for each item
      const items = req.body.items || [];
      for (const item of items) {
        if (item.productId && item.quantity) {
          await tx.product.updateMany({
            where: { id: item.productId, storeId: req.storeId },
            data: { currentStock: { increment: parseFloat(item.quantity) } },
          });
        }
      }

      return purchase;
    });
    res.status(201).json({ purchase: result });
  } catch (error) {
    console.error('Create purchase error:', error);
    res.status(500).json({ error: 'Failed to create stock purchase' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.stockPurchase.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });

    const { storeId, id, ...data } = req.body;
    if (data.date) data.date = new Date(data.date);
    const purchase = await prisma.stockPurchase.update({ where: { id: req.params.id }, data });
    res.json({ purchase });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.stockPurchase.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });

    await prisma.stockPurchase.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

module.exports = router;
