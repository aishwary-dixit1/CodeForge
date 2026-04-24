require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function migratePhase4() {
  const schemaPath = path.join(__dirname, '../db/schema-resilience-features.sql');

  try {
    console.log('[Migration] Phase 4 schema migration starting...');

    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const statements = schema.split(';').filter((stmt) => stmt.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('[Migration] Executing:', statement.substring(0, 50).trim() + '...');
        await db.query(statement);
      }
    }

    console.log('[Migration] Phase 4 schema migration completed successfully');
  } catch (error) {
    console.error('[Migration] Migration failed:', error.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

migratePhase4();
