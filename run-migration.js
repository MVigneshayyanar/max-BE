/**
 * Execute Prisma-generated SQL directly on Neon DB using explicit IPv4 to bypass DNS/IPv6 issues.
 */
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Connecting to Neon DB directly via IPv4 (23.21.74.185)...');

  const client = new Client({
    host: '23.21.74.185',
    port: 5432,
    user: 'neondb_owner',
    password: 'npg_IxCOhQgrFy82',
    database: 'neondb',
    ssl: {
      rejectUnauthorized: false,
      servername: 'ep-curly-violet-ahefin9h.c-3.us-east-1.aws.neon.tech',
    },
  });

  try {
    await client.connect();
    console.log('✅ Connected to Neon DB via direct IPv4!');

    // First, drop all existing tables (clean slate)
    console.log('🗑️  Dropping existing tables...');
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('✅ Old tables dropped');

    // Read and execute the Prisma-generated SQL
    console.log('📝 Creating new tables from Prisma schema...');
    let sql = fs.readFileSync(path.join(__dirname, 'prisma', 'init.sql'), 'utf-8');
    
    // Strip UTF-8 BOM if present
    sql = sql.replace(/^\uFEFF/, '').trim();

    // Execute full DDL script in one transaction
    await client.query(sql);

    console.log('✅ DDL script executed successfully!');

    // Verify tables created
    const tables = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `);
    console.log(`\n📊 Tables created (${tables.rows.length}):`);
    tables.rows.forEach(r => console.log(`   • ${r.tablename}`));

    await client.end();
    console.log('\n🎉 Database schema initialized successfully!');
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
}

run();
