import { NextResponse } from 'next/server';
import { processPendingAutomations } from '@/lib/engine/orchestrator';
import { processPendingAgentResumptions } from '@/lib/agent/graph';

/**
 * Single scheduled sweep for both pipelines: the deterministic engine's
 * pending actions/unhandled payments, and any LangGraph agent cases that
 * paused awaiting a real customer response and are now due for a recheck
 * (see lib/agent/graph.js's processPendingAgentResumptions). No second
 * scheduler — this is the same cron endpoint the deterministic engine
 * already used.
 */
export async function GET() {
  try {
    const deterministicResults = await processPendingAutomations();
    const agentResults = await processPendingAgentResumptions();
    return NextResponse.json({ success: true, results: deterministicResults, agentResults });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
