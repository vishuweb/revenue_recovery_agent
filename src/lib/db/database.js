import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PgDatabase } from './pg-adapter.js';

// ESM-compatible require for loading native CJS modules like better-sqlite3
const _require = createRequire(import.meta.url);

// Auto-load .env.local if present in dev/node execution
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
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
} catch {
  // Ignore error reading env
}

/**
 * No-op stub database — used when neither DATABASE_URL nor better-sqlite3 is available.
 * Returns empty results for all queries so the UI loads in a degraded-but-functional state
 * with a clear "Setup Required" message prompting the user to configure DATABASE_URL.
 */
function createNoOpDb() {
  const noop = () => ({
    all: () => [],
    get: () => undefined,
    run: () => ({ changes: 0 })
  });
  return {
    isPostgres: false,
    isNoOp: true,
    prepare: noop,
    exec: () => {},
    pragma: () => {},
    transaction: (fn) => async (...args) => {
      const txDb = { prepare: noop, exec: () => {}, pragma: () => {} };
      return fn(txDb, ...args);
    },
  };
}

/**
 * Get the singleton database instance.
 * Priority:
 *  1. PostgreSQL via DATABASE_URL env var (required on Vercel)
 *  2. SQLite via better-sqlite3 (local dev only)
 *  3. No-op stub (Vercel / read-only serverless without DATABASE_URL set)
 */
export function getDb() {
  if (globalThis.__revenueRecoveryDb) {
    return globalThis.__revenueRecoveryDb;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const pgDb = new PgDatabase(databaseUrl);
    globalThis.__revenueRecoveryDb = pgDb;
    return pgDb;
  }

  // Try SQLite — works locally, fails on Vercel (native module, read-only fs)
  try {
    const Database = _require('better-sqlite3');

    const dbPath = path.join(process.cwd(), 'data', 'revenue_recovery.db');
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const rawDb = new Database(dbPath);

    // Performance pragmas
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    rawDb.pragma('busy_timeout = 5000');

    // Apply schema and migrations
    applySchemaAndMigrations(rawDb);

    const sqliteAdapter = {
      isPostgres: false,
      isNoOp: false,
      prepare(sql) {
        const stmt = rawDb.prepare(sql);
        return {
          all(...args) {
            const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
            return stmt.all(...params);
          },
          get(...args) {
            const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
            return stmt.get(...params);
          },
          run(...args) {
            const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
            return stmt.run(...params);
          }
        };
      },
      exec(sql) {
        return rawDb.exec(sql);
      },
      pragma(str) {
        return rawDb.pragma(str);
      },
      transaction(fn) {
        return async (...args) => {
          rawDb.exec('BEGIN');
          try {
            const res = await fn(sqliteAdapter, ...args);
            rawDb.exec('COMMIT');
            return res;
          } catch (err) {
            try {
              rawDb.exec('ROLLBACK');
            } catch {
              // ignore rollback error
            }
            throw err;
          }
        };
      },
      rawDb
    };

    globalThis.__revenueRecoveryDb = sqliteAdapter;
    return sqliteAdapter;
  } catch (err) {
    // better-sqlite3 native binary not available (e.g. Vercel serverless, Docker without build tools)
    console.warn('[db] SQLite unavailable:', err.message, '— running in no-op mode. Set DATABASE_URL to enable persistent storage.');
    const stub = createNoOpDb();
    globalThis.__revenueRecoveryDb = stub;
    return stub;
  }
}

function applySchemaAndMigrations(db) {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    
    if (tables.includes('recovery_cases')) {
      const caseCols = db.prepare("PRAGMA table_info(recovery_cases)").all().map(c => c.name);
      if (!caseCols.includes('expected_recovery')) db.exec("ALTER TABLE recovery_cases ADD COLUMN expected_recovery INTEGER NOT NULL DEFAULT 0");
      if (!caseCols.includes('net_expected_value')) db.exec("ALTER TABLE recovery_cases ADD COLUMN net_expected_value INTEGER NOT NULL DEFAULT 0");
      if (!caseCols.includes('candidate_actions')) db.exec("ALTER TABLE recovery_cases ADD COLUMN candidate_actions TEXT");
      if (!caseCols.includes('attribution_type')) db.exec("ALTER TABLE recovery_cases ADD COLUMN attribution_type TEXT NOT NULL DEFAULT 'unknown'");
    }

    if (tables.includes('events')) {
      const eventCols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
      if (!eventCols.includes('idempotency_key')) db.exec("ALTER TABLE events ADD COLUMN idempotency_key TEXT");
    }
  } catch (e) {
    console.warn('[db migration warn]', e.message);
  }

  // Initialize schema with latest version
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }
}

/**
 * Reset the entire database — drops all tables and re-initializes schema.
 * Supports both SQLite and PostgreSQL.
 */
export async function resetDatabase() {
  const db = getDb();

  if (db.isNoOp) {
    throw new Error('No database configured. Add DATABASE_URL (PostgreSQL/Supabase connection string) to your Vercel environment variables and redeploy.');
  }

  if (db.isPostgres) {
    await db.exec(`
      DROP TABLE IF EXISTS dataset_runs CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS recovery_actions CASCADE;
      DROP TABLE IF EXISTS recovery_cases CASCADE;
      DROP TABLE IF EXISTS events CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS invoices CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.pg.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await db.exec(schema);
    }
    return;
  }

  // SQLite path
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS dataset_runs;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS recovery_actions;
    DROP TABLE IF EXISTS recovery_cases;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS customers;
  `);
  db.pragma('foreign_keys = ON');

  const raw = db.rawDb || db;
  applySchemaAndMigrations(raw);
}

/**
 * Log an entry to the audit trail.
 * @param {Object} entry - { entityType, entityId, eventType, description, details, actor, amount }
 */
export async function auditLog(entry) {
  const db = getDb();
  if (db.isNoOp) return null; // Skip logging when no DB is configured
  
  const id = uuidv4();
  const detailsStr = typeof entry.details === 'string' ? entry.details : (entry.details ? JSON.stringify(entry.details) : null);
  const actor = entry.actor || 'system';
  const amount = entry.amount || null;

  const result = await db.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, event_type, description, details, actor, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    entry.entityType,
    entry.entityId,
    entry.eventType,
    entry.description,
    detailsStr,
    actor,
    amount
  );

  return result;
}
