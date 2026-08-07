const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const orders = await prisma.savedOrder.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list saved orders' });
  }
});

router.post('/', async (req, res) => {
  try {
    const order = await prisma.savedOrder.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save order' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.savedOrder.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const { storeId, id, ...data } = req.body;
    const order = await prisma.savedOrder.update({ where: { id: req.params.id }, data });
    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.savedOrder.deleteMany({ where: { id: req.params.id, storeId: req.storeId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
