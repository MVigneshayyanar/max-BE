const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({ where: { storeId: req.storeId }, orderBy: { name: 'asc' } });
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

router.post('/', async (req, res) => {
  try {
    const role = await prisma.role.create({ data: { storeId: req.storeId, ...req.body } });
    res.status(201).json({ role });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Role name already exists' });
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    const { storeId, id, ...data } = req.body;
    const role = await prisma.role.update({ where: { id: req.params.id }, data });
    res.json({ role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.role.deleteMany({ where: { id: req.params.id, storeId: req.storeId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

module.exports = router;
