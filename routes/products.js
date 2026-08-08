const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');
const { query, prisma } = require('../config/db');
const cache = require('../utils/cache');

router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/products ───────────────────────────
// Optimized with in-memory caching (TTL 5 mins) and parameterized SQL / Prisma query
router.get('/', async (req, res) => {
  try {
    const { search, category, active, page = 1, limit = 500 } = req.query;
    const storeId = req.storeId;

    // Cache key for non-search catalog queries
    const cacheKey = `products:${storeId}:${category || 'all'}:${active || 'all'}:${page}:${limit}`;

    if (!search) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({ ...cached, _fromCache: true });
      }
    }

    const where = { storeId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) where.category = category;
    if (active !== undefined) where.isActive = active === 'true';

    const take = parseInt(limit);
    const skip = (parseInt(page) - 1) * take;

    // Select explicit fields (never SELECT *)
    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        storeId: true,
        name: true,
        productCode: true,
        category: true,
        price: true,
        cost: true,
        currentStock: true,
        unit: true,
        taxes: true,
        taxType: true,
        barcode: true,
        hsnCode: true,
        imageUrl: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      skip,
      take,
    });

    const responseData = { products, total: products.length, page: parseInt(page), limit: take };

    // Cache catalog results when no search parameter
    if (!search) {
      cache.set(cacheKey, responseData, 300); // 5 min TTL
    }

    res.json(responseData);
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// ─── GET /api/products/stock-summary ─────────────
router.get('/stock-summary', async (req, res) => {
  try {
    const cacheKey = `products:stock:${req.storeId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const products = await prisma.product.findMany({
      where: { storeId: req.storeId, isActive: true },
      select: { id: true, currentStock: true },
    });

    const stockMap = {};
    products.forEach(p => { stockMap[p.id] = p.currentStock; });

    cache.set(cacheKey, stockMap, 60); // 1 min TTL
    res.json(stockMap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stock summary' });
  }
});

// ─── GET /api/products/:id ───────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      select: {
        id: true, storeId: true, name: true, productCode: true, category: true,
        price: true, cost: true, currentStock: true, unit: true, taxes: true,
        taxType: true, barcode: true, hsnCode: true, description: true, imageUrl: true, isActive: true,
      },
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
    const {
      name, productCode, category, price, cost, currentStock, unit,
      taxes, taxType, barcode, hsnCode, description, imageUrl,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const product = await prisma.product.create({
      data: {
        storeId: req.storeId,
        name,
        productCode,
        category: category || 'General',
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        currentStock: parseFloat(currentStock) || 0,
        unit: unit || 'pcs',
        taxes: taxes || [],
        taxType: taxType || 'exclusive',
        barcode,
        hsnCode,
        description,
        imageUrl,
      },
    });

    // Invalidate product cache on create
    cache.delByPrefix(`products:${req.storeId}`);

    res.status(201).json({ product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ─── PUT /api/products/:id ───────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      name, productCode, category, price, cost, currentStock, unit,
      taxes, taxType, barcode, hsnCode, description, imageUrl, isActive,
    } = req.body;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });

    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const data = {};
    if (name !== undefined) data.name = name;
    if (productCode !== undefined) data.productCode = productCode;
    if (category !== undefined) data.category = category;
    if (price !== undefined) data.price = parseFloat(price);
    if (cost !== undefined) data.cost = parseFloat(cost);
    if (currentStock !== undefined) data.currentStock = parseFloat(currentStock);
    if (unit !== undefined) data.unit = unit;
    if (taxes !== undefined) data.taxes = taxes;
    if (taxType !== undefined) data.taxType = taxType;
    if (barcode !== undefined) data.barcode = barcode;
    if (hsnCode !== undefined) data.hsnCode = hsnCode;
    if (description !== undefined) data.description = description;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (isActive !== undefined) data.isActive = isActive;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
    });

    // Invalidate product cache on update
    cache.delByPrefix(`products:${req.storeId}`);

    res.json({ product });
  } catch (error) {
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

    // Invalidate product cache on delete
    cache.delByPrefix(`products:${req.storeId}`);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
