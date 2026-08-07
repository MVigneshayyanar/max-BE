const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, requireStore } = require('../middleware/auth');

const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(requireStore);

// ─── GET /api/sales ──────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, status, paymentMode, customer, page = 1, limit = 50 } = req.query;

    const where = { storeId: req.storeId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    if (status) where.paymentStatus = status;
    if (paymentMode) where.paymentMode = paymentMode;
    if (customer) {
      where.OR = [
        { customerPhone: { contains: customer, mode: 'insensitive' } },
        { customerName: { contains: customer, mode: 'insensitive' } },
      ];
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({ sales, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('List sales error:', error);
    res.status(500).json({ error: 'Failed to list sales' });
  }
});

// ─── GET /api/sales/next-number ──────────────────
// Peek at next invoice number without incrementing
router.get('/next-number', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { nextInvoiceNumber: true, invoicePrefix: true },
    });

    res.json({
      nextNumber: store.nextInvoiceNumber,
      prefix: store.invoicePrefix,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get next number' });
  }
});

// ─── POST /api/sales/generate-number ─────────────
// Generate and atomically increment invoice number
router.post('/generate-number', async (req, res) => {
  try {
    const { type = 'invoice' } = req.body;

    const fieldMap = {
      invoice: { number: 'nextInvoiceNumber', prefix: 'invoicePrefix' },
      quotation: { number: 'nextQuotationNumber', prefix: 'quotationPrefix' },
      purchase: { number: 'nextPurchaseNumber', prefix: 'purchasePrefix' },
      expense: { number: 'nextExpenseNumber', prefix: 'expensePrefix' },
      paymentReceipt: { number: 'nextPaymentReceiptNumber', prefix: 'paymentReceiptPrefix' },
    };

    const fields = fieldMap[type];
    if (!fields) return res.status(400).json({ error: 'Invalid type' });

    // Atomic increment using raw SQL to prevent race conditions
    const result = await prisma.$queryRaw`
      UPDATE "Store"
      SET "${prisma.$queryRaw`${fields.number}`}" = "${prisma.$queryRaw`${fields.number}`}" + 1
      WHERE id = ${req.storeId}
      RETURNING ${prisma.$queryRaw`${fields.number}`} - 1 as "currentNumber", ${prisma.$queryRaw`${fields.prefix}`} as prefix
    `;

    // Simpler approach: read then update in transaction
    const store = await prisma.$transaction(async (tx) => {
      const s = await tx.store.findUnique({
        where: { id: req.storeId },
        select: { [fields.number]: true, [fields.prefix]: true },
      });

      const currentNumber = s[fields.number];

      await tx.store.update({
        where: { id: req.storeId },
        data: { [fields.number]: currentNumber + 1 },
      });

      return { number: currentNumber, prefix: s[fields.prefix] };
    });

    res.json({
      number: store.number,
      prefix: store.prefix,
      formatted: `${store.prefix}${store.number}`,
    });
  } catch (error) {
    console.error('Generate number error:', error);
    res.status(500).json({ error: 'Failed to generate number' });
  }
});

// ─── GET /api/sales/:id ─────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });

    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json({ sale });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sale' });
  }
});

// ─── POST /api/sales ─────────────────────────────
// Create a sale — handles ALL side effects atomically in one transaction:
// 1. Create sale record
// 2. Deduct product stock
// 3. Update customer credit (if Credit payment)
// 4. Update customer totalSales & purchaseCount
// 5. Add credit/payment log entry
// 6. Delete saved order (if applicable)
// 7. Mark credit notes as used
// 8. Update quotation status (if applicable)
router.post('/', async (req, res) => {
  try {
    const saleData = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the sale
      const sale = await tx.sale.create({
        data: {
          storeId: req.storeId,
          invoiceNumber: saleData.invoiceNumber,
          items: saleData.items || [],
          subtotal: saleData.subtotal || 0,
          taxTotal: saleData.taxTotal || 0,
          discount: saleData.discount || 0,
          total: saleData.total || 0,
          roundOff: saleData.roundOff || 0,
          paymentMode: saleData.paymentMode,
          paymentStatus: saleData.paymentStatus || 'completed',
          customerPhone: saleData.customerPhone,
          customerName: saleData.customerName,
          cashReceived: saleData.cashReceived_split || saleData.cashReceived || 0,
          onlineReceived: saleData.onlineReceived_split || saleData.onlineReceived || 0,
          creditIssued: saleData.creditIssued_split || saleData.creditIssued || 0,
          quotationId: saleData.quotationId,
          savedOrderId: saleData.savedOrderId,
          unsettledSaleId: saleData.unsettledSaleId,
          staffId: saleData.staffId,
          staffName: saleData.staffName,
          notes: saleData.notes,
          billData: saleData.billData,
        },
      });

      // 2. Deduct product stock
      const items = saleData.items || [];
      for (const item of items) {
        if (item.productId && item.quantity && !item.productId.startsWith('qs_')) {
          await tx.product.updateMany({
            where: { id: item.productId, storeId: req.storeId },
            data: {
              currentStock: { decrement: parseFloat(item.quantity) },
            },
          });
        }
      }

      // 3 & 4. Update customer if present
      const customerPhone = saleData.customerPhone;
      if (customerPhone && customerPhone.trim()) {
        // Find or create customer
        let customer = await tx.customer.findFirst({
          where: { storeId: req.storeId, phone: customerPhone },
        });

        if (customer) {
          const updateData = {
            totalSales: { increment: saleData.total || 0 },
            purchaseCount: { increment: 1 },
            lastPurchaseAt: new Date(),
          };

          // Add credit balance if Credit payment
          if (saleData.paymentMode === 'Credit') {
            updateData.balance = { increment: saleData.total || 0 };
          }

          // Add credit for split payment credit portion
          if (saleData.paymentMode === 'Split' && saleData.creditIssued_split > 0) {
            updateData.balance = { increment: saleData.creditIssued_split };
          }

          await tx.customer.update({
            where: { id: customer.id },
            data: updateData,
          });
        } else {
          // Auto-create customer
          await tx.customer.create({
            data: {
              storeId: req.storeId,
              phone: customerPhone,
              name: saleData.customerName || 'Customer',
              totalSales: saleData.total || 0,
              purchaseCount: 1,
              lastPurchaseAt: new Date(),
              balance: saleData.paymentMode === 'Credit' ? (saleData.total || 0) : 0,
            },
          });
        }

        // 5. Add credit/payment log entry
        if (saleData.paymentMode === 'Credit') {
          await tx.creditLog.create({
            data: {
              storeId: req.storeId,
              customerId: customerPhone,
              customerName: saleData.customerName || 'Customer',
              amount: saleData.total || 0,
              type: 'credit_sale',
              method: 'Credit Sale',
              invoiceNumber: saleData.invoiceNumber,
              note: `Credit sale - Invoice #${saleData.invoiceNumber}`,
            },
          });
        } else if (saleData.paymentMode === 'Split') {
          const cashAmt = saleData.cashReceived_split || 0;
          const onlineAmt = saleData.onlineReceived_split || 0;
          const totalPaid = cashAmt + onlineAmt;

          if (totalPaid > 0) {
            let method = '';
            if (cashAmt > 0 && onlineAmt > 0) method = `Cash (${cashAmt}) + Online (${onlineAmt})`;
            else if (cashAmt > 0) method = 'Cash';
            else method = 'Online';

            await tx.creditLog.create({
              data: {
                storeId: req.storeId,
                customerId: customerPhone,
                customerName: saleData.customerName || 'Customer',
                amount: totalPaid,
                type: 'sale_payment',
                method,
                invoiceNumber: saleData.invoiceNumber,
                note: `Split payment - Invoice #${saleData.invoiceNumber}`,
              },
            });
          }

          // Credit portion log
          if (saleData.creditIssued_split > 0) {
            await tx.creditLog.create({
              data: {
                storeId: req.storeId,
                customerId: customerPhone,
                customerName: saleData.customerName || 'Customer',
                amount: saleData.creditIssued_split,
                type: 'credit_sale',
                method: 'Credit Sale (Split)',
                invoiceNumber: saleData.invoiceNumber,
                note: `Credit portion of split payment - Invoice #${saleData.invoiceNumber}`,
              },
            });
          }
        } else if (saleData.paymentMode) {
          // Cash or Online
          await tx.creditLog.create({
            data: {
              storeId: req.storeId,
              customerId: customerPhone,
              customerName: saleData.customerName || 'Customer',
              amount: saleData.total || 0,
              type: 'sale_payment',
              method: saleData.paymentMode,
              invoiceNumber: saleData.invoiceNumber,
              note: `${saleData.paymentMode} payment - Invoice #${saleData.invoiceNumber}`,
            },
          });
        }
      }

      // 6. Delete saved order if exists
      if (saleData.savedOrderId) {
        await tx.savedOrder.deleteMany({
          where: { id: saleData.savedOrderId, storeId: req.storeId },
        });
      }

      // 7. Mark credit notes as used
      if (saleData.selectedCreditNotes && Array.isArray(saleData.selectedCreditNotes)) {
        let remainingToDeduct = saleData.creditUsed || 0;
        for (const note of saleData.selectedCreditNotes) {
          if (remainingToDeduct <= 0) break;
          const noteAmount = parseFloat(note.amount) || 0;

          if (noteAmount <= remainingToDeduct) {
            await tx.creditNote.updateMany({
              where: { id: note.id, storeId: req.storeId },
              data: {
                status: 'Used',
                usedAt: new Date(),
                usedInInvoice: saleData.invoiceNumber,
                amount: 0,
              },
            });
            remainingToDeduct -= noteAmount;
          } else {
            await tx.creditNote.updateMany({
              where: { id: note.id, storeId: req.storeId },
              data: {
                amount: noteAmount - remainingToDeduct,
                lastPartialUseAt: new Date(),
                lastPartialInvoice: saleData.invoiceNumber,
              },
            });
            remainingToDeduct = 0;
          }
        }
      }

      // 8. Update quotation status
      if (saleData.quotationId) {
        await tx.quotation.updateMany({
          where: { id: saleData.quotationId, storeId: req.storeId },
          data: {
            status: 'settled',
            billed: true,
            settledAt: new Date(),
          },
        });
      }

      return sale;
    });

    res.status(201).json({ sale: result });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Invoice number already exists' });
    }
    console.error('Create sale error:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

// ─── PUT /api/sales/:id ─────────────────────────
// Update sale (settle unsettled, edit, return, cancel)
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.sale.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Sale not found' });

    const { storeId, id, ...updateData } = req.body;

    const sale = await prisma.sale.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ sale });
  } catch (error) {
    console.error('Update sale error:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
});

// ─── POST /api/sales/sync ────────────────────────
// Bulk sync offline sales
router.post('/sync', async (req, res) => {
  try {
    const { sales } = req.body;
    if (!Array.isArray(sales)) {
      return res.status(400).json({ error: 'Sales array required' });
    }

    const results = [];
    for (const saleData of sales) {
      try {
        // Check for duplicate invoice number
        const existing = await prisma.sale.findFirst({
          where: {
            storeId: req.storeId,
            invoiceNumber: saleData.invoiceNumber,
          },
        });

        if (existing) {
          results.push({ id: saleData.id, status: 'duplicate', serverId: existing.id });
          continue;
        }

        // Create using the same logic as POST /api/sales
        // (simplified - in production, reuse the transaction logic)
        const sale = await prisma.sale.create({
          data: {
            storeId: req.storeId,
            invoiceNumber: saleData.invoiceNumber,
            items: saleData.items || [],
            subtotal: saleData.subtotal || 0,
            taxTotal: saleData.taxTotal || 0,
            discount: saleData.discount || 0,
            total: saleData.total || 0,
            roundOff: saleData.roundOff || 0,
            paymentMode: saleData.paymentMode,
            paymentStatus: saleData.paymentStatus || 'completed',
            customerPhone: saleData.customerPhone,
            customerName: saleData.customerName,
            cashReceived: saleData.cashReceived || 0,
            onlineReceived: saleData.onlineReceived || 0,
            creditIssued: saleData.creditIssued || 0,
            staffId: saleData.staffId,
            staffName: saleData.staffName,
            notes: saleData.notes,
            billData: saleData.billData,
            createdAt: saleData.createdAt ? new Date(saleData.createdAt) : new Date(),
          },
        });

        results.push({ id: saleData.id, status: 'synced', serverId: sale.id });
      } catch (err) {
        results.push({ id: saleData.id, status: 'error', error: err.message });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Sync sales error:', error);
    res.status(500).json({ error: 'Failed to sync sales' });
  }
});

module.exports = router;
