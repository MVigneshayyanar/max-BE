const fs = require('fs');
const path = require('path');
const { query, pool } = require('./config/db');

async function applyIndexes() {
  console.log('🚀 Applying high-performance composite indexes to Neon Postgres...');
  const sql = fs.readFileSync(path.join(__dirname, 'prisma', 'migrations', 'add_performance_indexes.sql'), 'utf8');
  
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const stmt of statements) {
    console.log(`Executing: ${stmt.substring(0, 70)}...`);
    await query(stmt, [], 'apply-index');
  }

  console.log('✅ Composite indexes applied successfully!');
  await pool.end();
}

applyIndexes().catch(err => {
  console.error('❌ Failed to apply indexes:', err);
  process.exit(1);
});
