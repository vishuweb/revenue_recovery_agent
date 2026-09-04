import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';

/**
 * PostgreSQL-backed long-term memory adapter — used automatically whenever
 * DATABASE_URL is set (see memoryService.js). Same interface as
 * sqliteMemory.js (insert/query/aggregateStrategyEffectiveness), storing
 * into the `agent_memory` table (schema.pg.js) via the same connection
 * pool the business database already uses (lib/db/database.js).
 *
 * This exists because a standalone SQLite file is not a reliable
 * production store: on Vercel (and any other stateless serverless
 * platform), the filesystem is read-only outside of a per-invocation,
 * non-shared /tmp — a fact local development can't surface, since the
 * local filesystem really is persistent. Reusing the already-provisioned
 * Postgres instance (Supabase) avoids introducing a second production
 * datastore for a feature this small.
 */

export async function insert(fact) {
  const db = getDb();
  await db.prepare(`
    INSERT INTO agent_memory (id, customer_id, case_id, failure_category, action_type, outcome, discount_percent, channel, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    fact.id || uuidv4(), fact.customerId, fact.caseId || null, fact.failureCategory || 'unknown',
    fact.actionType, fact.outcome || 'unknown', fact.discountPercent ?? null,
    fact.channel || null, fact.detail ? JSON.stringify(fact.detail) : null
  );
}

export async function query(filters = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (filters.customerId) { clauses.push('customer_id = ?'); params.push(filters.customerId); }
  if (filters.failureCategory) { clauses.push('failure_category = ?'); params.push(filters.failureCategory); }
  if (filters.actionType) { clauses.push('action_type = ?'); params.push(filters.actionType); }
  if (filters.outcome) { clauses.push('outcome = ?'); params.push(filters.outcome); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, filters.limit || 10));

  const rows = await db.prepare(`SELECT * FROM agent_memory ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit);
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

export async function aggregateStrategyEffectiveness(failureCategory, limit = 5) {
  const db = getDb();
  const rows = await db.prepare(`
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
