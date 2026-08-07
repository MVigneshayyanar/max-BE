require('dotenv').config();

const { neon } = require('@neondatabase/serverless');
const { PrismaNeonHttp } = require('@prisma/adapter-neon');
const { PrismaClient } = require('@prisma/client');

async function test() {
  try {
    console.log('Connecting to Neon via HTTP...');
    
    const sql = neon(process.env.DATABASE_URL);
    const adapter = new PrismaNeonHttp(sql);
    const prisma = new PrismaClient({ adapter });
    
    const result = await prisma.$queryRaw`SELECT NOW() as now`;
    console.log('✅ Connected! Server time:', result[0].now);
    
    await prisma.$disconnect();
    console.log('✅ Connection test passed!');
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
  }
}

test();