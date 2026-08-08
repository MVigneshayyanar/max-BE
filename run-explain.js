const { query, pool } = require('./config/db');

async function runExplain() {
  console.log('🔍 Running EXPLAIN ANALYZE on Sales query...');
  
  const sampleStoreId = '100047';
  
  const explainSql = `
    EXPLAIN ANALYZE
    SELECT id, "invoiceNumber", total, "paymentMode", "createdAt"
    FROM "Sale"
    WHERE "storeId" = $1 AND "paymentMode" = $2
    ORDER BY "createdAt" DESC
    LIMIT 50;
  `;

  const res = await query(explainSql, [sampleStoreId, 'Cash'], 'explain-sales');
  
  console.log('\n📊 Query Execution Plan:');
  res.rows.forEach(r => console.log(r['QUERY PLAN']));

  await pool.end();
}

runExplain().catch(console.error);
