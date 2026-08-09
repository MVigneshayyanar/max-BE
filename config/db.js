const { Pool, Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

// ─── 1. POOLED CONNECTION (Standard Queries) ────────────────
// Uses Neon's `-pooler` connection string for high-throughput, connection-multiplexed queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '20', 10), // Max 20 pool connections for long-running Node server
  idleTimeoutMillis: 30000,                            // Close idle clients after 30s
  connectionTimeoutMillis: 5000,                        // Return error if connection acquisition takes > 5s
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL pool client:', err);
});

// ─── 2. DIRECT CONNECTION (Session-Level Features / LISTEN-NOTIFY) ──
// Uses Neon's unpooled DIRECT_URL for session-dependent features
function createDirectClient() {
  return new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL?.replace('-pooler', ''),
    ssl: { rejectUnauthorized: false },
  });
}

// ─── 3. MEASURED QUERY EXECUTOR ─────────────────────────────
// High-precision timing wrapper using process.hrtime.bigint()
async function query(text, params = [], label = '') {
  const start = process.hrtime.bigint();
  try {
    const res = await pool.query(text, params);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (process.env.NODE_ENV === 'development' || durationMs > 100) {
      console.log(`⏱️ [DB Query${label ? `:${label}` : ''}] ${durationMs.toFixed(2)}ms | Rows: ${res.rowCount}`);
    }
    return res;
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.error(`❌ [DB Error${label ? `:${label}` : ''}] ${durationMs.toFixed(2)}ms | ${err.message}`);
    throw err;
  }
}

// Singleton Prisma instance for existing Prisma compatibility
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Attach helpers to prisma object for 100% backward & forward import compatibility
prisma.pool = pool;
prisma.query = query;
prisma.createDirectClient = createDirectClient;
prisma.prisma = prisma; // Self-reference allows both `require('./config/db')` and `require('./config/db').prisma`

module.exports = prisma;
