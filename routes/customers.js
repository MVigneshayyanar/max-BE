const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/customers ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 500 } = req.query;
    const where = { storeId: req.storeId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({ customers, total });
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Failed to list customers' });
  }
});

// ─── GET /api/customers/:id ─────────────────────
router.get('/:id', async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ customer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

// ─── GET /api/customers/:id/ledger ──────────────
router.get('/:id/ledger', async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const logs = await prisma.creditLog.findMany({
      where: { storeId: req.storeId, customerId: customer.phone },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ customer, logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ledger' });
  }
});

// ─── POST /api/customers ─────────────────────────
router.post('/', async (req, res) => {
  try {
    const customer = await prisma.customer.create({
      data: { storeId: req.storeId, ...req.body },
    });
    res.status(201).json({ customer });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Customer with this phone already exists' });
    }
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// ─── PUT /api/customers/:id ─────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const { storeId, id, ...updateData } = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ customer });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ─── DELETE /api/customers/:id ──────────────────
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// ─── POST /api/customers/bulk ───────────────────
router.post('/bulk', async (req, res) => {
  try {
    const { customers } = req.body;
    if (!Array.isArray(customers)) return res.status(400).json({ error: 'Customers array required' });

    const created = await prisma.customer.createMany({
      data: customers.map(c => ({ ...c, storeId: req.storeId })),
      skipDuplicates: true,
    });
    res.status(201).json({ count: created.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk import customers' });
  }
});

// ─── POST /api/customers/:id/settle ─────────────
// Settle customer credit
router.post('/:id/settle', async (req, res) => {
  try {
    const { amount, method, note } = req.body;
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: { balance: { decrement: parseFloat(amount) } },
      });

      await tx.creditLog.create({
        data: {
          storeId: req.storeId,
          customerId: customer.phone,
          customerName: customer.name,
          amount: parseFloat(amount),
          type: 'settlement',
          method: method || 'Cash',
          note: note || 'Credit settlement',
        },
      });
    });

    const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
    res.json({ customer: updated });
  } catch (error) {
    console.error('Settle credit error:', error);
    res.status(500).json({ error: 'Failed to settle credit' });
  }
});

// ─── GET /api/customers/by-phone/:phone ─────────
router.get('/by-phone/:phone', async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { storeId: req.storeId, phone: req.params.phone },
    });
    res.json({ customer: customer || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to find customer' });
  }
});

module.exports = router;
