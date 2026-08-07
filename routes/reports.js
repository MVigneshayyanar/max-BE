const router = require('express').Router();
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = require('../config/db');
router.use(authMiddleware);
router.use(requireStore);

// Helper: parse date range from query
function parseDateRange(query) {
  const { startDate, endDate } = query;
  const filter = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) filter.lte = new Date(endDate);
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// ─── GET /api/reports/daybook ────────────────────
router.get('/daybook', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const salesWhere = { storeId: req.storeId };
    const expenseWhere = { storeId: req.storeId };
    if (dateFilter) {
      salesWhere.createdAt = dateFilter;
      expenseWhere.createdAt = dateFilter;
    }

    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({ where: salesWhere, orderBy: { createdAt: 'desc' } }),
      prisma.expense.findMany({ where: expenseWhere, orderBy: { createdAt: 'desc' } }),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({ sales, expenses, totalSales, totalExpenses, netIncome: totalSales - totalExpenses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get daybook' });
  }
});

// ─── GET /api/reports/sales-summary ──────────────
router.get('/sales-summary', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where });

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalTax = sales.reduce((sum, s) => sum + s.taxTotal, 0);
    const totalDiscount = sales.reduce((sum, s) => sum + s.discount, 0);
    const cashSales = sales.filter(s => s.paymentMode === 'Cash').reduce((sum, s) => sum + s.total, 0);
    const onlineSales = sales.filter(s => s.paymentMode === 'Online').reduce((sum, s) => sum + s.total, 0);
    const creditSales = sales.filter(s => s.paymentMode === 'Credit').reduce((sum, s) => sum + s.total, 0);

    res.json({
      totalSales, totalTax, totalDiscount, salesCount: sales.length,
      cashSales, onlineSales, creditSales,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sales summary' });
  }
});

// ─── GET /api/reports/item-sales ─────────────────
router.get('/item-sales', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where, select: { items: true } });

    const itemMap = {};
    for (const sale of sales) {
      const items = sale.items || [];
      for (const item of items) {
        const key = item.productId || item.name;
        if (!itemMap[key]) {
          itemMap[key] = { name: item.name, quantity: 0, revenue: 0, count: 0 };
        }
        itemMap[key].quantity += parseFloat(item.quantity) || 0;
        itemMap[key].revenue += (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
        itemMap[key].count += 1;
      }
    }

    const itemSales = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);
    res.json({ itemSales });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get item sales' });
  }
});

// ─── GET /api/reports/top-customers ──────────────
router.get('/top-customers', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { storeId: req.storeId },
      orderBy: { totalSales: 'desc' },
      take: 20,
    });
    res.json({ customers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get top customers' });
  }
});

// ─── GET /api/reports/stock ──────────────────────
router.get('/stock', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, productCode: true, category: true, currentStock: true, price: true, cost: true, unit: true },
    });

    const totalValue = products.reduce((sum, p) => sum + (p.currentStock * p.cost), 0);
    const totalRetailValue = products.reduce((sum, p) => sum + (p.currentStock * p.price), 0);

    res.json({ products, totalCostValue: totalValue, totalRetailValue });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stock report' });
  }
});

// ─── GET /api/reports/low-stock ──────────────────
router.get('/low-stock', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId, isActive: true, currentStock: { lte: threshold } },
      orderBy: { currentStock: 'asc' },
    });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get low stock products' });
  }
});

// ─── GET /api/reports/top-products ───────────────
router.get('/top-products', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where, select: { items: true } });

    const productMap = {};
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const key = item.productId || item.name;
        if (!productMap[key]) productMap[key] = { name: item.name, quantity: 0, revenue: 0 };
        productMap[key].quantity += parseFloat(item.quantity) || 0;
        productMap[key].revenue += (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
      }
    }

    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    res.json({ topProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get top products' });
  }
});

// ─── GET /api/reports/top-categories ─────────────
router.get('/top-categories', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where, select: { items: true } });
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId },
      select: { id: true, category: true },
    });

    const productCategoryMap = {};
    products.forEach(p => { productCategoryMap[p.id] = p.category || 'Uncategorized'; });

    const categoryMap = {};
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const cat = productCategoryMap[item.productId] || item.category || 'Uncategorized';
        if (!categoryMap[cat]) categoryMap[cat] = { name: cat, quantity: 0, revenue: 0 };
        categoryMap[cat].quantity += parseFloat(item.quantity) || 0;
        categoryMap[cat].revenue += (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
      }
    }

    const topCategories = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);
    res.json({ topCategories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get top categories' });
  }
});

// ─── GET /api/reports/expenses ───────────────────
router.get('/expenses', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const expenses = await prisma.expense.findMany({ where, orderBy: { createdAt: 'desc' } });

    const categoryTotals = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    res.json({ expenses, categoryTotals, totalExpenses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get expense report' });
  }
});

// ─── GET /api/reports/tax ────────────────────────
router.get('/tax', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where });

    const totalTax = sales.reduce((sum, s) => sum + s.taxTotal, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);

    // Tax breakdown by item taxes
    const taxBreakdown = {};
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const taxes = item.taxes || [];
        for (const tax of taxes) {
          const key = `${tax.name} @${tax.percentage}%`;
          if (!taxBreakdown[key]) taxBreakdown[key] = { name: tax.name, percentage: tax.percentage, amount: 0 };
          // Calculate individual tax amount
          const itemTotal = (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
          const taxAmt = itemTotal * ((tax.percentage || 0) / 100);
          taxBreakdown[key].amount += taxAmt;
        }
      }
    }

    res.json({ totalTax, totalSales, salesCount: sales.length, taxBreakdown: Object.values(taxBreakdown) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tax report' });
  }
});

// ─── GET /api/reports/staff-sales ────────────────
router.get('/staff-sales', async (req, res) => {
  try {
    const dateFilter = parseDateRange(req.query);
    const where = { storeId: req.storeId };
    if (dateFilter) where.createdAt = dateFilter;

    const sales = await prisma.sale.findMany({ where });

    const staffMap = {};
    for (const sale of sales) {
      const key = sale.staffName || sale.staffId || 'Unknown';
      if (!staffMap[key]) staffMap[key] = { name: key, salesCount: 0, totalAmount: 0 };
      staffMap[key].salesCount += 1;
      staffMap[key].totalAmount += sale.total;
    }

    res.json({ staffSales: Object.values(staffMap).sort((a, b) => b.totalAmount - a.totalAmount) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get staff sales' });
  }
});

// ─── GET /api/reports/analytics ──────────────────
router.get('/analytics', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todaySales, totalProducts, totalCustomers, totalSalesEver] = await Promise.all([
      prisma.sale.findMany({ where: { storeId: req.storeId, createdAt: { gte: today, lt: tomorrow } } }),
      prisma.product.count({ where: { storeId: req.storeId, isActive: true } }),
      prisma.customer.count({ where: { storeId: req.storeId } }),
      prisma.sale.count({ where: { storeId: req.storeId } }),
    ]);

    const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);

    res.json({
      todaySalesCount: todaySales.length,
      todaySalesTotal: todayTotal,
      totalProducts,
      totalCustomers,
      totalSalesEver,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

module.exports = router;
