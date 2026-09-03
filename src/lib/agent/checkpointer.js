import path from 'path';
import fs from 'fs';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

/**
 * Short-term memory: LangGraph checkpoint persistence.
 *
 * This stores in-flight graph state only — the ability to resume the exact
 * point a given recovery case's run stopped at (e.g. a scheduled retry
 * waiting on a delay). It is intentionally a separate SQLite file from:
 *   - the business database (data/revenue_recovery.db)
 *   - long-term agent memory (data/agent_memory.db, lib/memory/)
 * so checkpoint state is never confused with durable customer facts.
 */

let saver = null;

export function getCheckpointer() {
  if (saver) return saver;

  const dbPath = process.env.AGENT_CHECKPOINT_DB_PATH || path.join(process.cwd(), 'data', 'agent_checkpoints.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  saver = SqliteSaver.fromConnString(dbPath);
  saver.setup();
  return saver;
}

export function __resetForTests() {
  saver = null;
}
