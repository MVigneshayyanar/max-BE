const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/products ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, category, active, page = 1, limit = 500 } = req.query;

    const where = { storeId: req.storeId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) where.category = category;
    if (active !== undefined) where.isActive = active === 'true';

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// ─── GET /api/products/stock-summary ─────────────
// Lightweight endpoint for stock polling
router.get('/stock-summary', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId, isActive: true },
      select: { id: true, currentStock: true },
    });

    const stockMap = {};
    products.forEach(p => { stockMap[p.id] = p.currentStock; });

    res.json({ stock: stockMap });
  } catch (error) {
    console.error('Stock summary error:', error);
    res.status(500).json({ error: 'Failed to get stock summary' });
  }
});

// ─── GET /api/products/check-code/:code ──────────
router.get('/check-code/:code', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({
      where: {
        storeId: req.storeId,
        productCode: req.params.code,
      },
      select: { id: true, name: true },
    });

    res.json({ exists: !!existing, product: existing });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check code' });
  }
});

// ─── GET /api/products/:id ───────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// ─── POST /api/products ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const product = await prisma.product.create({
      data: {
        storeId: req.storeId,
        ...req.body,
      },
    });

    res.status(201).json({ product });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Product code already exists in this store' });
    }
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ─── PUT /api/products/:id ───────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Ensure product belongs to this store
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const { storeId, id, ...updateData } = req.body;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ product });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ─── DELETE /api/products/:id ────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ─── POST /api/products/bulk ─────────────────────
router.post('/bulk', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array required' });
    }

    const created = await prisma.product.createMany({
      data: products.map(p => ({ ...p, storeId: req.storeId })),
      skipDuplicates: true,
    });

    res.status(201).json({ count: created.count });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to bulk import products' });
  }
});

module.exports = router;
