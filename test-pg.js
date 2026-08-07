const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_IxCOhQgrFy82@ep-curly-violet-ahefin9h-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => {
    console.log('✅ Connected to Neon DB via pg driver!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('Query result:', res.rows[0]);
    return client.end();
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
  });
