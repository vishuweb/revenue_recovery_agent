import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

export async function runPgMigrations(connectionString = process.env.DATABASE_URL) {
  loadEnvFile();
  const dbUrl = connectionString || process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required to run PostgreSQL migrations.');
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.pg.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await client.query(schemaSql);
    console.log('✓ PostgreSQL / Supabase schema migrations applied successfully.');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map(r => r.table_name);
    console.log(`✓ Verified ${tableNames.length} tables in database:`, tableNames.join(', '));
    return { success: true, tables: tableNames };
  } finally {
    await client.end();
  }
}

// Allow direct execution: node src/lib/db/migrate.js
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runPgMigrations()
    .then(() => {
      console.log('PostgreSQL migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
