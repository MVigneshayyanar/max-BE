const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const profiles = await prisma.taxProfile.findMany({
      where: { storeId: req.storeId },
      orderBy: { name: 'asc' },
    });
    res.json({ taxProfiles: profiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tax profiles' });
  }
});

router.post('/', async (req, res) => {
  try {
    const profile = await prisma.taxProfile.create({ data: { storeId: req.storeId, ...req.body } });
    res.status(201).json({ taxProfile: profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create tax profile' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.taxProfile.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Tax profile not found' });
    const { storeId, id, ...data } = req.body;
    const profile = await prisma.taxProfile.update({ where: { id: req.params.id }, data });
    res.json({ taxProfile: profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tax profile' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.taxProfile.deleteMany({ where: { id: req.params.id, storeId: req.storeId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tax profile' });
  }
});

module.exports = router;
