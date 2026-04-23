require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to your .env file.');
  }

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await db.query(schemaSql);
  console.log('Database schema initialized successfully.');

  await db.pool.end();
}

main().catch(async (error) => {
  console.error('Failed to initialize database schema:', error.message);
  try {
    await db.pool.end();
  } catch (_err) {
    // Ignore pool close errors during shutdown.
  }
  process.exit(1);
});
