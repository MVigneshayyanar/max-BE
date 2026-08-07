const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireStore);

// ─── CRUD for Categories ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { storeId: req.storeId },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

router.post('/', async (req, res) => {
  try {
    const category = await prisma.category.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const { storeId, id, ...data } = req.body;
    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json({ category });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
