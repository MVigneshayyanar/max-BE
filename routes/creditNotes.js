const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { status, type, customerPhone } = req.query;
    const where = { storeId: req.storeId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (customerPhone) where.customerPhone = customerPhone;

    const creditNotes = await prisma.creditNote.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ creditNotes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list credit notes' });
  }
});

router.get('/next-number', async (req, res) => {
  try {
    const { type = 'CN' } = req.query;
    const prefix = type;
    const last = await prisma.creditNote.findFirst({
      where: {
        storeId: req.storeId,
        creditNoteNumber: { startsWith: prefix },
      },
      orderBy: { creditNoteNumber: 'desc' },
    });

    let nextNum = 100001;
    if (last) {
      const numericPart = last.creditNoteNumber.replace(/[^0-9]/g, '');
      nextNum = (parseInt(numericPart) || 100000) + 1;
    }
    res.json({ nextNumber: `${prefix}${nextNum}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get next number' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const note = await prisma.creditNote.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!note) return res.status(404).json({ error: 'Credit note not found' });
    res.json({ creditNote: note });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get credit note' });
  }
});

router.post('/', async (req, res) => {
  try {
    const note = await prisma.creditNote.create({
      data: { storeId: req.storeId, ...req.body, originalAmount: req.body.amount || 0 },
    });
    res.status(201).json({ creditNote: note });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Credit note number already exists' });
    res.status(500).json({ error: 'Failed to create credit note' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.creditNote.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });

    const { storeId, id, ...data } = req.body;
    if (data.usedAt) data.usedAt = new Date(data.usedAt);
    if (data.lastPartialUseAt) data.lastPartialUseAt = new Date(data.lastPartialUseAt);
    const note = await prisma.creditNote.update({ where: { id: req.params.id }, data });
    res.json({ creditNote: note });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update credit note' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.creditNote.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });

    await prisma.creditNote.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete credit note' });
  }
});

module.exports = router;
