import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../../lib/db/database.js';
import { runRecoveryAgent, resumeRecoveryAgent } from '../../../../lib/agent/graph.js';
import { processRecoveryOutcome } from '../../../../lib/engine/orchestrator.js';

// Transient/soft-decline reasons (category 'temporary' — retry-eligible,
// usually resolved automatically) vs hard/behavioral declines (category
// 'permanent'/'behavioral' — retry doesn't help, the agent must switch
// strategies or stop). Deliberately balanced so both show up in every demo.
const TRANSIENT_REASONS = ['insufficient_funds', 'gateway_error', 'payment_timed_out', 'bank_server_down', 'network_error'];
const HARD_REASONS = ['card_expired', 'authentication_failed', 'payment_cancelled'];
const ALL_REASONS = [...TRANSIENT_REASONS, ...HARD_REASONS, 'card_declined'];

/**
 * Realistic failed-payment amounts, in paise, tied to customer plan tier —
 * NOT the seeded customer.mrr (₹50–₹2,000, too small for any fixed-cost
 * action like payment_link/email/escalate to make economic sense against).
 * All bands stay safely under the ₹50,000 policy escalation threshold, so
 * "escalation" stays a distinct, deliberately small slice (see below)
 * instead of accidentally swallowing most of the recoverable population —
 * exactly what was inflating amount_at_risk without any matching
 * recovered_amount in the previous run (escalated cases require human
 * approval and never auto-complete in a batch).
 */
function sampleAmountForPlan(plan) {
  if (plan === 'enterprise') return 500000 + Math.floor(Math.random() * 4500000);   // ₹5,000 – ₹50,000
  if (plan === 'growth') return 150000 + Math.floor(Math.random() * 1350000);      // ₹1,500 – ₹15,000
  return 50000 + Math.floor(Math.random() * 450000);                              // starter: ₹500 – ₹5,000
}

/**
 * POST /api/agent/batch — batch-simulate N failed payments through the
 * LangGraph agent for the buildathon demo. Results are clearly labeled
 * `simulated: true`; nothing here talks to a real payment gateway — the
 * SAME lib/agent/graph.js used for real Razorpay webhooks (when
 * RECOVERY_ENGINE=agent) processes every case.
 *
 * Body: { count?: number } (default 100, max 300). The mix is deliberately
 * engineered, not purely random, so a single run reliably contains: low-
 * and high-value customers, transient and hard failures, at least a few
 * amounts large enough to force policy escalation, and repeat customers
 * (so later cases in the same run can be memory-influenced by earlier
 * ones — see decideRecoveryAction.js's applyMemoryAdjustment).
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const n = Math.min(300, Math.max(1, parseInt(body.count, 10) || 100));
    const db = getDb();

    let customers = await db.prepare('SELECT id, mrr, payment_method, plan FROM customers ORDER BY RANDOM() LIMIT 500').all();
    if (!customers || customers.length === 0) {
      const { generateSimulationData } = await import('../../../../lib/simulation/generator.js');
      await generateSimulationData();
      customers = await db.prepare('SELECT id, mrr, payment_method, plan FROM customers ORDER BY RANDOM() LIMIT 500').all();
    }
    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: 'No customers available — seed the database first' }, { status: 400 });
    }

    const usedThisRun = [];
    const paymentIds = [];

    for (let i = 0; i < n; i++) {
      // ~25% of cases (after the first few) deliberately reuse a customer
      // already seen earlier in this run, so repeat-failure and
      // memory-influenced scenarios are guaranteed to appear.
      const reuse = usedThisRun.length > 3 && Math.random() < 0.25;
      const customer = reuse
        ? usedThisRun[Math.floor(Math.random() * usedThisRun.length)]
        : customers[Math.floor(Math.random() * customers.length)];
      usedThisRun.push(customer);

      // ~4% of cases are deliberately just above the ₹50,000 policy
      // escalation threshold — enough to reliably demonstrate the
      // escalation path without letting it dominate total amount_at_risk
      // (kept close to the threshold, not 10-100x over it).
      const forceEscalation = Math.random() < 0.04;
      const amount = forceEscalation
        ? 5200000 + Math.floor(Math.random() * 1800000)
        : sampleAmountForPlan(customer.plan);

      const reason = ALL_REASONS[Math.floor(Math.random() * ALL_REASONS.length)];
      const paymentId = uuidv4();

      await db.prepare(`
        INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
        VALUES (?, ?, ?, 'INR', 'failed', ?, ?, 'simulated_batch', datetime('now'), datetime('now'))
      `).run(paymentId, customer.id, amount, customer.payment_method || 'card', reason);
      paymentIds.push(paymentId);
    }

    // Batch runs skip the LLM entirely (llmEnabled: false) — 100+ live
    // Ollama calls would make this slow and dependent on a model being up,
    // and would not materially change candidates that are already
    // deterministically NEV-ranked and memory-adjusted. Individual runs
    // (/api/agent/run, the simulator's "Run via Agent") leave it enabled,
    // which is where live AI reasoning should actually be demonstrated.
    const results = [];
    for (const paymentId of paymentIds) {
      try {
        const result = await runRecoveryAgent(paymentId, { llmEnabled: false });
        results.push({ paymentId, ...result });
      } catch (err) {
        results.push({ paymentId, error: err.message });
      }
    }

    const caseIds = results.map((r) => r.caseId).filter(Boolean);
    let summary = null;

    if (caseIds.length > 0) {
      const placeholders = caseIds.map(() => '?').join(',');

      // Dispatched-but-unconfirmed actions (email, payment link, discount
      // offer, etc.) pause rather than complete — see observe_outcome.js —
      // so within a single batch pass they'd show a structurally
      // impossible 0% success rate with no chance to ever "come back".
      // Simulate the real-world customer response using the exact
      // probability the agent itself computed for the action it picked
      // (from candidate_actions, already memory/LLM-adjusted) — a fair
      // dice roll, not a hardcoded number. A miss is left paused, exactly
      // as it would be in production awaiting the cron sweep.
      //
      // Scoped strictly to cases runRecoveryAgent itself reported as
      // genuinely PAUSED (outcome RETRYABLE + stopReason
      // 'awaiting_customer_response') — status alone ('open'/'in_progress')
      // is not enough: an ESCALATED case sits in that same status while it
      // genuinely awaits human approval, and must never be auto-resolved
      // by this simulation.
      const pausedCaseIds = new Set(
        results.filter((r) => r.decision?.outcome === 'RETRYABLE' && r.decision?.stopReason === 'awaiting_customer_response').map((r) => r.caseId)
      );
      const pausedCases = pausedCaseIds.size > 0
        ? (await db.prepare(`SELECT * FROM recovery_cases WHERE id IN (${placeholders}) AND status IN ('open', 'in_progress')`).all(...caseIds))
            .filter((c) => pausedCaseIds.has(c.id))
        : [];
      for (const c of pausedCases) {
        let actionProbability = c.recovery_probability || 0;
        try {
          const candidates = JSON.parse(c.candidate_actions || '[]');
          const picked = candidates.find((cand) => cand.action === c.recommended_action);
          if (picked) actionProbability = picked.probability;
        } catch { /* fall back to case-level probability */ }

        if (Math.random() < actionProbability) {
          await processRecoveryOutcome(c.id, { success: true });
          await resumeRecoveryAgent(`case_${c.payment_id}`);
        }
      }

      const rows = await db.prepare(`SELECT * FROM recovery_cases WHERE id IN (${placeholders})`).all(...caseIds);

      const totalRevenueAtRisk = rows.reduce((sum, r) => sum + (r.amount_at_risk || 0), 0);
      const totalRecovered = rows.reduce((sum, r) => sum + (r.recovered_amount || 0), 0);
      const recoveredCount = rows.filter((r) => r.status === 'recovered').length;

      // The customer-response simulation above can move a case from
      // "paused" to "recovered" after its initial decision — re-derive
      // these counts from final persisted state (latest agent_stopped
      // audit entry + case status), the same way /api/agent/metrics does,
      // rather than trusting the now-stale per-call `results[].decision`.
      const stoppedEntries = await db.prepare(`
        SELECT entity_id, details FROM audit_log WHERE actor = 'agent' AND event_type = 'decision.agent_stopped'
        AND entity_id IN (${placeholders})
      `).all(...caseIds);
      const latestByCase = new Map();
      for (const e of stoppedEntries) {
        try { latestByCase.set(e.entity_id, JSON.parse(e.details)); } catch { /* ignore */ }
      }
      const finalLoopStats = [...latestByCase.values()];
      const rowsById = new Map(rows.map((r) => [r.id, r]));
      const stillPaused = (caseId) => ['open', 'in_progress'].includes(rowsById.get(caseId)?.status);

      const escalatedCount = [...latestByCase.entries()].filter(([id, l]) => l.outcome === 'ESCALATE' && stillPaused(id)).length;
      const stoppedCount = finalLoopStats.filter((l) => l.outcome === 'STOPPED').length;
      const failedCount = finalLoopStats.filter((l) => l.outcome === 'FAILED').length;
      const pausedCount = rows.filter((r) => ['open', 'in_progress'].includes(r.status)).length - escalatedCount;
      const llmGuidedCount = results.filter((r) => r.decision?.llmUsed).length;
      const memoryInfluencedCount = results.filter((r) => r.decision?.memoryInfluenced).length;

      const actionDistribution = {};
      for (const row of rows) {
        actionDistribution[row.recommended_action] = (actionDistribution[row.recommended_action] || 0) + 1;
      }

      summary = {
        simulated: true,
        casesProcessed: rows.length,
        totalRevenueAtRisk,
        totalRecovered,
        // Case Recovery Rate: what fraction of cases ended recovered.
        recoveryRate: rows.length > 0 ? (recoveredCount / rows.length) * 100 : 0,
        // Revenue Recovery Rate: what fraction of at-risk rupees came back
        // — a different, equally real number; a handful of large escalated
        // cases can pull this well below the case rate, which is honest,
        // not a bug (escalations require a human and never auto-complete).
        revenueRecoveryRate: totalRevenueAtRisk > 0 ? (totalRecovered / totalRevenueAtRisk) * 100 : 0,
        recoveredCount,
        stoppedCount,
        failedCount,
        pausedCount,
        escalatedCount,
        llmGuidedCount,
        memoryInfluencedCount,
        actionDistribution,
      };
    }

    return NextResponse.json({ success: true, requested: n, results, summary });
  } catch (error) {
    console.error('Agent Batch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
