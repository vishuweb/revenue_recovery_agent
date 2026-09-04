import { getDb } from './src/lib/db/database.js';
import { getCheckpointer } from './src/lib/agent/checkpointer.js';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

getDb();
console.log('DATABASE_URL loaded:', Boolean(process.env.DATABASE_URL));

const TestState = Annotation.Root({
  counter: Annotation({ reducer: (_c, u) => u, default: () => 0 }),
});

const graph = new StateGraph(TestState)
  .addNode('step1', async (state) => { console.log('  [step1] running, counter=', state.counter); return { counter: state.counter + 1 }; })
  .addNode('step2', async (state) => { console.log('  [step2] running, counter=', state.counter); return { counter: state.counter + 1 }; })
  .addEdge(START, 'step1')
  .addEdge('step1', 'step2')
  .addEdge('step2', END);

console.log('Getting checkpointer...');
const checkpointer = await getCheckpointer();
console.log('Got:', checkpointer.constructor.name);

console.log('Compiling graph...');
const compiled = graph.compile({ checkpointer });

console.log('Invoking graph...');
const t0 = Date.now();
try {
  const result = await Promise.race([
    compiled.invoke({ counter: 0 }, { configurable: { thread_id: `minimal_${Date.now()}` } }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('invoke() timed out after 20s')), 20000)),
  ]);
  console.log(`invoke() resolved in ${Date.now() - t0}ms:`, JSON.stringify(result));
} catch (err) {
  console.log(`invoke() FAILED after ${Date.now() - t0}ms:`, err.message);
}

console.log('DONE');
process.exit(0);
