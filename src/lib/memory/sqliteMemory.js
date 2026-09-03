import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const _require = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  case_id TEXT,
  failure_category TEXT NOT NULL DEFAULT 'unknown',
  action_type TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'unknown',
  discount_percent REAL,
  channel TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_customer ON agent_memory(customer_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON agent_memory(failure_category);
CREATE INDEX IF NOT EXISTS idx_agent_memory_action ON agent_memory(action_type, outcome);
`;

/**
 * Low-level SQLite storage adapter for long-term agent memory.
 *
 * Deliberately isolated from both:
 *  - the LangGraph checkpoint DB (lib/agent/checkpointer.js) — that is
 *    short-term, graph-execution state, not a durable customer fact store.
 *  - the business database (lib/db/database.js) — customers/payments/cases
 *    remain the source of truth there; this file only stores derived
 *    recovery-strategy facts.
 *
 * The interface here (insert/query/aggregate) is intentionally storage-
 * agnostic so MemoryService can later be pointed at a Postgres-backed
 * adapter with the same three functions and nothing above it changes.
 */

let db = null;

function getRawDb() {
  if (db) return db;

  const Database = _require('better-sqlite3');
  const dbPath = process.env.AGENT_MEMORY_DB_PATH || path.join(process.cwd(), 'data', 'agent_memory.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

/** @param {{id:string, customerId:string, caseId?:string, failureCategory:string, actionType:string, outcome:string, discountPercent?:number, channel?:string, detail?:object}} fact */
export function insert(fact) {
  const raw = getRawDb();
  raw.prepare(`
    INSERT INTO agent_memory (id, customer_id, case_id, failure_category, action_type, outcome, discount_percent, channel, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    fact.id, fact.customerId, fact.caseId || null, fact.failureCategory || 'unknown',
    fact.actionType, fact.outcome || 'unknown', fact.discountPercent ?? null,
    fact.channel || null, fact.detail ? JSON.stringify(fact.detail) : null
  );
}

/** @param {{customerId?:string, failureCategory?:string, actionType?:string, outcome?:string, limit?:number}} filters */
export function query(filters = {}) {
  const raw = getRawDb();
  const clauses = [];
  const params = [];

  if (filters.customerId) { clauses.push('customer_id = ?'); params.push(filters.customerId); }
  if (filters.failureCategory) { clauses.push('failure_category = ?'); params.push(filters.failureCategory); }
  if (filters.actionType) { clauses.push('action_type = ?'); params.push(filters.actionType); }
  if (filters.outcome) { clauses.push('outcome = ?'); params.push(filters.outcome); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, filters.limit || 10));

  const rows = raw.prepare(`SELECT * FROM agent_memory ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit);
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

/** Aggregate success rate per action_type for a given failure category. */
export function aggregateStrategyEffectiveness(failureCategory, limit = 5) {
  const raw = getRawDb();
  const rows = raw.prepare(`
    SELECT action_type,
      COUNT(*) as attempts,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes
    FROM agent_memory
    WHERE failure_category = ?
    GROUP BY action_type
    ORDER BY successes DESC, attempts DESC
    LIMIT ?
  `).all(failureCategory, limit);

  return rows.map((r) => ({
    actionType: r.action_type,
    attempts: r.attempts,
    successes: r.successes,
    successRate: r.attempts > 0 ? r.successes / r.attempts : 0,
  }));
}

export function __resetForTests() {
  db = null;
}
