import { NextResponse } from 'next/server.js';
import { processPendingAgentResumptions } from '../../../../lib/agent/graph.js';

/**
 * POST /api/agent/resume — manually trigger the same sweep /api/cron runs
 * automatically. Body: { force?: boolean }. force=true resumes every
 * eligible paused case immediately regardless of its scheduled recheck
 * time — useful for a live demo, where waiting out a real recheck window
 * (default 30 minutes, see AGENT_RECHECK_DELAY_MS) isn't practical.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const results = await processPendingAgentResumptions({ force: Boolean(body.force) });
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('Agent Resume Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
