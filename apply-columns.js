
const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.ftckqoljlrusbmflezcw',
    password: '1812pobed@nadFRAN',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('Connected!');

    console.log('Adding columns to users_permissions...');
    await client.query(`
      ALTER TABLE users_permissions 
      ADD COLUMN IF NOT EXISTS geo_permission_granted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    console.log('Columns added successfully!');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
