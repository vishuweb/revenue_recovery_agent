import { getDb } from './src/lib/db/database.js'; // triggers .env.local loading
import { getCheckpointer } from './src/lib/agent/checkpointer.js';

getDb();
console.log('DATABASE_URL loaded:', Boolean(process.env.DATABASE_URL));
console.log('Getting checkpointer...');
const cp = await getCheckpointer();
console.log('Got checkpointer:', cp.constructor.name);

const threadId = `probe_${Date.now()}`;
console.log('Attempting a manual put()...');
const t0 = Date.now();

const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
const checkpoint = {
  v: 1,
  id: 'test-checkpoint-1',
  ts: new Date().toISOString(),
  channel_values: { foo: 'bar' },
  channel_versions: { foo: 1 },
  versions_seen: {},
  pending_sends: [],
};
const metadata = { source: 'input', step: -1, writes: null, parents: {} };

try {
  const result = await Promise.race([
    cp.put(config, checkpoint, metadata, {}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('put() timed out after 15s')), 15000)),
  ]);
  console.log(`put() resolved in ${Date.now() - t0}ms:`, JSON.stringify(result));
} catch (err) {
  console.log(`put() FAILED after ${Date.now() - t0}ms:`, err.message);
}

console.log('Attempting getTuple() on what we just wrote...');
const t1 = Date.now();
try {
  const tuple = await Promise.race([
    cp.getTuple(config),
    new Promise((_, reject) => setTimeout(() => reject(new Error('getTuple() timed out after 15s')), 15000)),
  ]);
  console.log(`getTuple() resolved in ${Date.now() - t1}ms:`, Boolean(tuple));
} catch (err) {
  console.log(`getTuple() FAILED after ${Date.now() - t1}ms:`, err.message);
}

console.log('DONE');
process.exit(0);
