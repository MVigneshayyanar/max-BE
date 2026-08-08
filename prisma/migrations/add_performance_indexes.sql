-- High-Performance Composite Indexes for Standalone Node.js + Neon Postgres

CREATE INDEX IF NOT EXISTS "Sale_storeId_paymentMode_createdAt_idx"
  ON "Sale" ("storeId", "paymentMode", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Expense_storeId_category_createdAt_idx"
  ON "Expense" ("storeId", "category", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Product_storeId_isActive_category_idx"
  ON "Product" ("storeId", "isActive", "category");

CREATE INDEX IF NOT EXISTS "Customer_storeId_totalSales_idx"
  ON "Customer" ("storeId", "totalSales" DESC);

CREATE INDEX IF NOT EXISTS "StockPurchase_storeId_date_idx"
  ON "StockPurchase" ("storeId", "date" DESC);

CREATE INDEX IF NOT EXISTS "Quotation_storeId_createdAt_idx"
  ON "Quotation" ("storeId", "createdAt" DESC);
