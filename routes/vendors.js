const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where = { storeId: req.storeId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    const vendors = await prisma.vendor.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list vendors' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ vendor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get vendor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const vendor = await prisma.vendor.create({ data: { storeId: req.storeId, ...req.body } });
    res.status(201).json({ vendor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    const { storeId, id, ...data } = req.body;
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data });
    res.json({ vendor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    await prisma.vendor.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

module.exports = router;
