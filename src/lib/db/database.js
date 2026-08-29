import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get the singleton database instance.
 * Initializes schema on first call. Uses WAL mode for concurrency.
 */
export function getDb() {
  if (globalThis.__revenueRecoveryDb) {
    return globalThis.__revenueRecoveryDb;
  }

  const dbPath = path.join(process.cwd(), 'data', 'revenue_recovery.db');
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Apply schema and migrations
  applySchemaAndMigrations(db);

  globalThis.__revenueRecoveryDb = db;
  return db;
}

function applySchemaAndMigrations(db) {
  // First run column migrations on any existing tables to ensure index creation succeeds
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
 * Used by the simulator to start completely fresh with new schema.
 */
export function resetDatabase() {
  const db = getDb();
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

  applySchemaAndMigrations(db);
}

/**
 * Log an entry to the audit trail.
 * @param {Object} entry - { entityType, entityId, eventType, description, details, actor, amount }
 */
export function auditLog(entry) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, event_type, description, details, actor, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    uuidv4(),
    entry.entityType,
    entry.entityId,
    entry.eventType,
    entry.description,
    typeof entry.details === 'string' ? entry.details : (entry.details ? JSON.stringify(entry.details) : null),
    entry.actor || 'system',
    entry.amount || null
  );
}
