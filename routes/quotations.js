const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where = { storeId: req.storeId };
    if (status) where.status = status;

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.quotation.count({ where }),
    ]);
    res.json({ quotations, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list quotations' });
  }
});

router.get('/next-number', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { nextQuotationNumber: true, quotationPrefix: true },
    });
    res.json({ nextNumber: store.nextQuotationNumber, prefix: store.quotationPrefix });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get next number' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ quotation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get quotation' });
  }
});

router.post('/', async (req, res) => {
  try {
    const quotation = await prisma.quotation.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ quotation });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Quotation number already exists' });
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });

    const { storeId, id, ...data } = req.body;
    const quotation = await prisma.quotation.update({ where: { id: req.params.id }, data });
    res.json({ quotation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });

    await prisma.quotation.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

module.exports = router;
