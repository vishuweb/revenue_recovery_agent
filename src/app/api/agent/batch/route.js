import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../../lib/db/database.js';
import { runRecoveryAgent } from '../../../../lib/agent/graph.js';

// Transient/soft-decline reasons (category 'temporary' — retry-eligible,
// usually resolved automatically) vs hard/behavioral declines (category
// 'permanent'/'behavioral' — retry doesn't help, the agent must switch
// strategies or stop). Deliberately balanced so both show up in every demo.
const TRANSIENT_REASONS = ['insufficient_funds', 'gateway_error', 'payment_timed_out', 'bank_server_down', 'network_error'];
const HARD_REASONS = ['card_expired', 'authentication_failed', 'payment_cancelled'];
const ALL_REASONS = [...TRANSIENT_REASONS, ...HARD_REASONS, 'card_declined'];

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

      // ~5% of cases are deliberately high-value enough to force policy
      // escalation (amount_at_risk > ₹50,000 / 5,000,000 paise) regardless
      // of the customer's own MRR — otherwise this scenario is rare by
      // chance alone (seeded MRR tops out well under that threshold).
      const forceEscalation = Math.random() < 0.05;
      const amount = forceEscalation
        ? 6000000 + Math.floor(Math.random() * 4000000)
        : (customer.mrr || (5000 + Math.floor(Math.random() * 95000)));

      const reason = ALL_REASONS[Math.floor(Math.random() * ALL_REASONS.length)];
      const paymentId = uuidv4();

      await db.prepare(`
        INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
        VALUES (?, ?, ?, 'INR', 'failed', ?, ?, 'simulated_batch', datetime('now'), datetime('now'))
      `).run(paymentId, customer.id, amount, customer.payment_method || 'card', reason);
      paymentIds.push(paymentId);
    }

    const results = [];
    for (const paymentId of paymentIds) {
      try {
        const result = await runRecoveryAgent(paymentId);
        results.push({ paymentId, ...result });
      } catch (err) {
        results.push({ paymentId, error: err.message });
      }
    }

    const caseIds = results.map((r) => r.caseId).filter(Boolean);
    let summary = null;

    if (caseIds.length > 0) {
      const placeholders = caseIds.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT * FROM recovery_cases WHERE id IN (${placeholders})`).all(...caseIds);

      const totalRevenueAtRisk = rows.reduce((sum, r) => sum + (r.amount_at_risk || 0), 0);
      const totalRecovered = rows.reduce((sum, r) => sum + (r.recovered_amount || 0), 0);
      const recoveredCount = rows.filter((r) => r.status === 'recovered').length;
      const escalatedCount = results.filter((r) => r.decision?.outcome === 'ESCALATE').length;
      const stoppedCount = results.filter((r) => r.decision?.outcome === 'STOPPED').length;
      const failedCount = results.filter((r) => r.decision?.outcome === 'FAILED').length;
      const pausedCount = results.filter((r) => r.decision?.outcome === 'RETRYABLE').length;
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
        recoveryRate: rows.length > 0 ? (recoveredCount / rows.length) * 100 : 0,
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
