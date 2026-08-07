const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 50 } = req.query;
    const where = { storeId: req.storeId };
    if (category) where.category = category;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.expense.count({ where }),
    ]);
    res.json({ expenses, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list expenses' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ expense });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get expense' });
  }
});

router.post('/', async (req, res) => {
  try {
    const expense = await prisma.expense.create({
      data: { storeId: req.storeId, ...req.body, date: req.body.date ? new Date(req.body.date) : new Date() },
    });
    res.status(201).json({ expense });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });

    const { storeId, id, ...data } = req.body;
    if (data.date) data.date = new Date(data.date);
    const expense = await prisma.expense.update({ where: { id: req.params.id }, data });
    res.json({ expense });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });

    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
