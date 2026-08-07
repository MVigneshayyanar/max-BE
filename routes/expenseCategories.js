const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { storeId: req.storeId },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list expense categories' });
  }
});

router.post('/', async (req, res) => {
  try {
    const category = await prisma.expenseCategory.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Expense category already exists' });
    res.status(500).json({ error: 'Failed to create expense category' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.expenseCategory.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const { storeId, id, ...data } = req.body;
    const category = await prisma.expenseCategory.update({ where: { id: req.params.id }, data });
    res.json({ category });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense category' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.expenseCategory.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    await prisma.expenseCategory.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense category' });
  }
});

module.exports = router;
