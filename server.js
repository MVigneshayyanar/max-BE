const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const prisma = require('./config/db');
const { initializeFirebaseAdmin } = require('./config/firebase');
const { initializeSocket } = require('./services/socket');

// ─── Initialize ──────────────────────────────────
const app = express();
const server = http.createServer(app);

// Make prisma available globally
app.set('prisma', prisma);

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();

// Initialize Socket.IO
const io = initializeSocket(server);
app.set('io', io);

// ─── Middleware ───────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health Check ────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/expense-categories', require('./routes/expenseCategories'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/stock-purchases', require('./routes/stockPurchases'));
app.use('/api/credit-notes', require('./routes/creditNotes'));
app.use('/api/credit-logs', require('./routes/creditLogs'));
app.use('/api/saved-orders', require('./routes/savedOrders'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/tax-profiles', require('./routes/taxProfiles'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/admin', require('./routes/admin'));

// ─── Error Handling ──────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// ─── Start Server ────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MAXmybill API running on port ${PORT}`);
      console.log(`📡 Socket.IO ready for real-time connections`);
    });

    // Connect DB in background so healthcheck passes immediately
    prisma.$connect()
      .then(() => console.log('✅ Connected to Neon PostgreSQL'))
      .catch((err) => console.error('❌ Neon PostgreSQL connection error:', err));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start();

module.exports = app;
