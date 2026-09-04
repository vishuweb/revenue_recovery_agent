import path from 'path';
import fs from 'fs';
import pg from 'pg';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

/**
 * Short-term memory: LangGraph checkpoint persistence.
 *
 * This stores in-flight graph state only — the ability to resume the exact
 * point a given recovery case's run stopped at (e.g. a scheduled retry
 * waiting on a delay). It is intentionally separate from:
 *   - the business database (data/revenue_recovery.db locally, Postgres in production)
 *   - long-term agent memory (lib/memory/) — memoryService.js's own store
 * so checkpoint state is never confused with durable customer facts.
 *
 * Backend: PostgresSaver (its own tables in the same Postgres instance the
 * business database already uses) whenever DATABASE_URL is set; SqliteSaver
 * (a standalone local file) otherwise. A standalone SQLite file is not a
 * reliable production store on serverless platforms — Vercel's filesystem
 * is read-only outside a per-invocation, non-shared /tmp — so production
 * must not depend on it.
 */

let saverPromise = null;

export async function getCheckpointer() {
  if (saverPromise) return saverPromise;

  saverPromise = (async () => {
    if (process.env.DATABASE_URL) {
      // PostgresSaver.fromConnString() builds a plain `new Pool({connectionString})`
      // with no SSL options — Supabase (and most managed Postgres) requires
      // SSL and that pool hangs indefinitely on connect. Build the pool
      // ourselves with the exact same SSL handling lib/db/pg-adapter.js
      // already uses for the business database connection.
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
      const saver = new PostgresSaver(pool);
      await saver.setup();
      return saver;
    }

    const dbPath = process.env.AGENT_CHECKPOINT_DB_PATH || path.join(process.cwd(), 'data', 'agent_checkpoints.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const saver = SqliteSaver.fromConnString(dbPath);
    saver.setup();
    return saver;
  })();

  return saverPromise;
}

export function __resetForTests() {
  saverPromise = null;
}
