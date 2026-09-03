// Test-time safety guard — preloaded via `node --import` before any test
// file runs (see package.json's "test"/"test:unit"/"test:agent" scripts).
//
// The test suite calls resetDatabase(), which DROPs every table. That must
// never be able to reach a real database. This guard forces two things
// regardless of what .env.local contains:
//
//   1. DATABASE_URL is neutralized, so getDb() can never select the
//      PostgreSQL/Supabase branch during tests.
//   2. SQLITE_DB_PATH is redirected to a disposable file under data/, so
//      resetDatabase() can't even touch a developer's real local
//      data/revenue_recovery.db.
//
// This runs as its own preload step, so by the time any test file's own
// `import '../src/lib/db/database.js'` executes, database.js is already
// cached with these settings locked in.
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Block database.js's ".env.local next to cwd" auto-loader from setting
// DATABASE_URL (it only fills in vars that are currently unset/falsy).
process.env.DATABASE_URL = process.env.DATABASE_URL || '__test_guard_blocked__';
process.env.SQLITE_DB_PATH = path.join(__dirname, '..', 'data', 'test_revenue_recovery.db');
// Same reasoning for the agent's own stores — test runs must never mix
// ephemeral test customers/threads into the real long-term memory or
// checkpoint files used by the actual demo.
process.env.AGENT_MEMORY_DB_PATH = path.join(__dirname, '..', 'data', 'test_agent_memory.db');
process.env.AGENT_CHECKPOINT_DB_PATH = path.join(__dirname, '..', 'data', 'test_agent_checkpoints.db');

// Trigger database.js's module-level env loader now, while DATABASE_URL is
// still the truthy placeholder above, then clear it before any test
// actually calls getDb().
await import('../src/lib/db/database.js');
process.env.DATABASE_URL = '';

console.log(`[test-guard] DATABASE_URL neutralized; using disposable SQLite at ${process.env.SQLITE_DB_PATH}`);
