const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { customerId, type, startDate, endDate } = req.query;
    const where = { storeId: req.storeId };
    if (customerId) where.customerId = customerId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const logs = await prisma.creditLog.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list credit logs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const log = await prisma.creditLog.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ log });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create credit log' });
  }
});

module.exports = router;
