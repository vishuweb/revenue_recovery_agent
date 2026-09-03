import { NextResponse } from 'next/server.js';
import { runRecoveryAgent } from '../../../../lib/agent/graph.js';

/**
 * POST /api/agent/run — run the bounded LangGraph recovery agent for one
 * failed payment, start to finish. Used by the simulator's "Run via Agent"
 * action and can be wired into the webhook path via RECOVERY_ENGINE=agent
 * (see lib/engine/orchestrator.js).
 */
export async function POST(request) {
  try {
    const { paymentId } = await request.json();
    if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 });

    const result = await runRecoveryAgent(paymentId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Agent Run Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
