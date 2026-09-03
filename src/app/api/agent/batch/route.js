import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../../lib/db/database.js';
import { runRecoveryAgent } from '../../../../lib/agent/graph.js';

const FAILURE_REASONS = [
  'insufficient_funds', 'gateway_error', 'card_declined', 'payment_timed_out',
  'authentication_failed', 'card_expired', 'bank_server_down', 'network_error',
];

/**
 * POST /api/agent/batch — batch-simulate N failed payments through the
 * LangGraph agent for the buildathon demo. Results are clearly labeled
 * `simulated: true`; nothing here talks to a real payment gateway.
 * Body: { count?: number } (default 20, max 200).
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const n = Math.min(200, Math.max(1, parseInt(body.count, 10) || 20));
    const db = getDb();

    let customers = await db.prepare('SELECT id, mrr, payment_method FROM customers ORDER BY RANDOM() LIMIT 500').all();
    if (!customers || customers.length === 0) {
      const { generateSimulationData } = await import('../../../../lib/simulation/generator.js');
      await generateSimulationData();
      customers = await db.prepare('SELECT id, mrr, payment_method FROM customers ORDER BY RANDOM() LIMIT 500').all();
    }
    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: 'No customers available — seed the database first' }, { status: 400 });
    }

    const paymentIds = [];
    for (let i = 0; i < n; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const amount = customer.mrr || (5000 + Math.floor(Math.random() * 95000));
      const reason = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
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
      const stoppedCount = rows.filter((r) => r.status === 'stopped').length;
      const llmGuidedCount = results.filter((r) => r.decision?.llmUsed).length;

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
        escalatedCount,
        llmGuidedCount,
        actionDistribution,
      };
    }

    return NextResponse.json({ success: true, requested: n, results, summary });
  } catch (error) {
    console.error('Agent Batch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
