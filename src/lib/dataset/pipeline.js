import { getDb, auditLog } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { runRecoveryAgent, resumeRecoveryAgent } from '../agent/graph.js';
import { processRecoveryOutcome } from '../engine/orchestrator.js';
import { detectDatasetArchetype } from './parser.js';

const SEGMENT_KEYS = ['enterprise', 'growth', 'starter'];

/** Bounded-concurrency async map — same pattern as api/agent/batch/route.js. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

/**
 * Runs a validated, normalized CSV dataset through the SAME LangGraph
 * recovery agent used by the Razorpay webhook and the simulator (see
 * lib/agent/graph.js, lib/agent/nodes/*). This file does NOT classify,
 * score, or decide anything itself — it is purely an event source adapter:
 *
 *   1. Turn each row into a `customers` row (create or reuse) and a
 *      `payments` row — the exact same shape any other payment.failed
 *      event produces (see lib/agent/eventNormalizer.js).
 *   2. Hand the payment id to runRecoveryAgent().
 *   3. If the agent dispatched an action that's awaiting a real customer
 *      response (email, payment link, ...), immediately roll the SAME
 *      probability-weighted "did the customer respond" dice
 *      /api/agent/batch already uses for its own demo — using the agent's
 *      own computed probability for the actual candidate it picked, never
 *      a hardcoded number. This resolves the row in-line, so a LATER row
 *      for the same customer_id sees this one's real, settled outcome in
 *      long-term memory instead of a still-pending one — the mechanic
 *      that makes the "memory-driven repeat customer" scenario real
 *      rather than staged.
 *
 * llmEnabled is left off deliberately (deterministic + memory only), for
 * the same reason /api/agent/batch does: a dataset can be hundreds of
 * rows, and making that many live Ollama calls would be slow and would
 * make the whole import depend on a model being reachable.
 */
export async function executeDatasetPipeline(normalizedRows, datasetMeta = {}) {
  const db = getDb();
  // Accepted from the caller (the frontend generates this before firing the
  // request) so it can start polling GET /api/dataset/runs/[id] for real
  // progress the moment the run starts, instead of only after it finishes.
  const runId = datasetMeta.runId || uuidv4();
  const runName = datasetMeta.name || 'Dataset Run ' + new Date().toLocaleDateString();
  const filename = datasetMeta.filename || 'uploaded_data.csv';
  const archetype = detectDatasetArchetype(normalizedRows);
  const now = new Date();

  const caseResults = [];
  const uniqueCustomersSet = new Set();
  const funnel = {
    uploadedRecords: normalizedRows.length,
    revenueRiskEvents: 0,
    eligibleForRecovery: 0,
    agentDecisions: 0,
    actionsExecuted: 0,
    successfulRecoveries: 0,
  };
  const actionBreakdown = {};
  const segmentPerformance = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, { atRisk: 0, recovered: 0, cases: 0 }]));

  // Real progress, polled by the frontend via the EXISTING
  // GET /api/dataset/runs/[id] endpoint while this function is still
  // running — two separate requests hitting the same Postgres row, no new
  // infrastructure. `processed`/`currentCustomer` are updated after every
  // row genuinely finishes (see processRow's finally-block below), never
  // on a timer, so a paused/slow row is reflected honestly.
  const progress = { status: 'running', processed: 0, total: normalizedRows.length, currentCustomer: null };

  async function writeProgress(status = 'running') {
    progress.status = status;
    const revenueAtRiskSoFar = caseResults.reduce((s, c) => s + (c.amountAtRisk || 0), 0);
    const recoveredSoFar = caseResults.reduce((s, c) => s + (c.recoveredAmount || 0), 0);
    await db.prepare(`
      UPDATE dataset_runs
      SET revenue_at_risk = ?, recovered_amount = ?, interventions_count = ?, run_summary = ?
      WHERE id = ?
    `).run(revenueAtRiskSoFar, recoveredSoFar, funnel.actionsExecuted, JSON.stringify({ progress }), runId);
  }

  await db.prepare(`
    INSERT INTO dataset_runs (
      id, name, filename, dataset_type, total_records, unique_customers,
      total_volume, revenue_at_risk, recovered_amount, intervention_cost,
      net_recovered, recovery_rate, interventions_count, escalations_count,
      stopped_count, run_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)
  `).run(runId, runName, filename, archetype.type, normalizedRows.length, JSON.stringify({ progress }), now.toISOString());

  // Rows for the SAME customer must run in order — a later row needs to see
  // an earlier row's real, settled memory outcome (see module doc above).
  // Rows for DIFFERENT customers have no such dependency, so group by
  // customer_id and run the groups concurrently — this is what keeps a
  // realistic multi-customer CSV from timing out on Vercel while still
  // making the memory-driven repeat-customer scenario genuine rather than
  // staged. Concurrency is bounded (not per-row) precisely so it can never
  // reorder two rows that share a customer_id.
  const rowsByCustomer = new Map();
  normalizedRows.forEach((row, i) => {
    const key = row.customer_id;
    if (!rowsByCustomer.has(key)) rowsByCustomer.set(key, []);
    rowsByCustomer.get(key).push({ row, i });
  });

  async function processRow(row, i) {
    try {
      await processRowInner(row, i);
    } finally {
      progress.processed++;
      progress.currentCustomer = row.customer_name || row.customer_id;
      await writeProgress();
    }
  }

  async function processRowInner(row, i) {
    uniqueCustomersSet.add(row.customer_id);
    funnel.revenueRiskEvents++;

    // 1. Ensure the customer exists — a repeated customer_id across rows
    // intentionally reuses the same customer, which is what lets the
    // agent's own memory (lib/memory/) recall this customer's real prior
    // outcome on a later row.
    let customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id);
    if (!customer) {
      await db.prepare(`
        INSERT INTO customers (
          id, name, email, company, plan, mrr, lifetime_value, payment_method,
          risk_score, total_payments, successful_payments, failed_payments,
          discount_affinity, avg_order_value, opted_out, intervention_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.customer_id, row.customer_name, row.customer_email, row.customer_company || 'Independent Account',
        row.customer_segment || 'starter', row.mrr || row.amount, row.lifetime_value || (row.amount * 5),
        row.payment_method || 'card', 0.5,
        (row.previous_successful_payments || 10) + (row.previous_failed_payments || 1),
        row.previous_successful_payments || 10, row.previous_failed_payments || 1,
        row.discount_affinity ?? 0.5, row.amount, row.opted_out || 0, 0,
        now.toISOString(), now.toISOString()
      );
      customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id);
    }

    // 2. A payment id derived from transaction_id gives idempotency across
    // re-runs of the same file for free — runRecoveryAgent() already skips
    // a payment_id that already has a case (see lib/agent/graph.js).
    const paymentId = row.transaction_id ? `csv_${row.transaction_id}` : `csv_${runId}_row${i}`;
    const existingPayment = await db.prepare('SELECT id FROM payments WHERE id = ?').get(paymentId);
    if (!existingPayment) {
      // Spread attempted_at over the past so the dataset reads as a real
      // history rather than 200 events at the exact same instant.
      const attemptedAt = new Date(now.getTime() - (normalizedRows.length - i) * 60000).toISOString();
      await db.prepare(`
        INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, 'csv_import', ?, ?)
      `).run(paymentId, customer.id, row.amount, row.currency || 'INR', row.payment_method || 'card', row.failure_reason, attemptedAt, attemptedAt);
    }

    // 3. The SAME LangGraph agent used by the Razorpay webhook and the simulator.
    let result;
    try {
      result = await runRecoveryAgent(paymentId, { llmEnabled: false });
    } catch (err) {
      caseResults.push({
        caseId: null, customerId: customer.id, customerName: customer.name,
        amountAtRisk: row.amount, failureReason: row.failure_reason,
        status: 'error', error: err.message, openedAt: now.toISOString(), source: 'csv',
      });
      return;
    }
    funnel.agentDecisions++;

    if (!result.caseId) {
      // Policy denied the very first candidate before any case was ever
      // created (e.g. CUSTOMER_FATIGUE) — a real, valid outcome, not a
      // pipeline error. Nothing further to record for this row.
      return;
    }

    // 4. Resolve a dispatched-but-unconfirmed action immediately, using
    // the agent's OWN computed probability for the action it actually
    // picked — never a hardcoded number. Scoped strictly to a genuinely
    // PAUSED case (dispatched, awaiting the customer) via the exact
    // outcome/stopReason runRecoveryAgent just returned — status alone
    // ('open'/'in_progress') is not enough: an ESCALATED case sits in
    // that same status while it genuinely awaits human approval, and
    // must never be auto-resolved by this simulation.
    const isPaused = result.decision?.outcome === 'RETRYABLE' && result.decision?.stopReason === 'awaiting_customer_response';
    let caseRow = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(result.caseId);
    if (isPaused && caseRow && ['open', 'in_progress'].includes(caseRow.status)) {
      let actionProbability = caseRow.recovery_probability || 0;
      try {
        const candidates = JSON.parse(caseRow.candidate_actions || '[]');
        const picked = candidates.find((c) => c.action === caseRow.recommended_action);
        if (picked) actionProbability = picked.probability;
      } catch { /* fall back to the case-level probability */ }

      if (Math.random() < actionProbability) {
        await processRecoveryOutcome(caseRow.id, { success: true });
        await resumeRecoveryAgent(`case_${paymentId}`);
      }
      caseRow = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(result.caseId);
    }

    funnel.eligibleForRecovery++;
    funnel.actionsExecuted++;
    if (caseRow.status === 'recovered') funnel.successfulRecoveries++;

    actionBreakdown[caseRow.recommended_action] = (actionBreakdown[caseRow.recommended_action] || 0) + 1;
    const seg = SEGMENT_KEYS.includes(customer.plan) ? customer.plan : 'starter';
    segmentPerformance[seg].atRisk += caseRow.amount_at_risk;
    segmentPerformance[seg].recovered += caseRow.recovered_amount;
    segmentPerformance[seg].cases++;

    // 5. The real, persisted audit trail for this case — not hand-crafted prose.
    const stoppedEntry = await db.prepare(`
      SELECT details FROM audit_log WHERE entity_id = ? AND event_type = 'decision.agent_stopped'
      ORDER BY created_at DESC LIMIT 1
    `).get(caseRow.id);
    let loopOutcome = null, loopPaused = false;
    if (stoppedEntry) {
      try { const parsed = JSON.parse(stoppedEntry.details); loopOutcome = parsed.outcome; loopPaused = Boolean(parsed.paused); } catch { /* ignore */ }
    }

    const auditRows = await db.prepare('SELECT * FROM audit_log WHERE entity_id = ? ORDER BY created_at ASC').all(caseRow.id);
    const auditTimeline = auditRows.map((r) => ({ time: r.created_at, event: r.description, actor: r.actor, detail: r.description }));

    caseResults.push({
      caseId: caseRow.id,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerCompany: customer.company,
      segment: customer.plan,
      mrr: customer.mrr,
      lifetimeValue: customer.lifetime_value,
      amountAtRisk: caseRow.amount_at_risk,
      failureReason: caseRow.failure_reason,
      failureCategory: caseRow.failure_category,
      recoveryProbability: caseRow.recovery_probability,
      priorityScore: caseRow.priority_score,
      recommendedAction: caseRow.recommended_action,
      aiReasoning: caseRow.ai_reasoning,
      interventionCost: caseRow.intervention_cost,
      status: caseRow.status,
      loopOutcome,
      awaitingResponse: loopPaused && ['open', 'in_progress'].includes(caseRow.status),
      recoveredAmount: caseRow.recovered_amount,
      openedAt: caseRow.opened_at,
      source: 'csv',
      simulated: true,
      auditTimeline,
    });
  }

  // Bound concurrency across customer-groups (not across all rows) — 10
  // matches the Postgres pool's own `max` (pg-adapter.js, checkpointer.js),
  // so this uses the pool fully without oversubscribing it. Going higher
  // wouldn't add real parallelism (extra chains would just queue for a
  // pool connection) and risks pressuring Supabase's pooler under real
  // concurrent traffic — not something to guess upward without load
  // testing against production. Rows within a single group still run
  // strictly in the array's original order via the plain for-loop below.
  await mapWithConcurrency(Array.from(rowsByCustomer.values()), 10, async (group) => {
    for (const { row, i } of group) {
      await processRow(row, i);
    }
  });

  const revenueAtRisk = caseResults.reduce((s, c) => s + (c.amountAtRisk || 0), 0);
  const recoveredAmount = caseResults.reduce((s, c) => s + (c.recoveredAmount || 0), 0);
  const totalInterventionCost = caseResults.reduce((s, c) => s + (c.interventionCost || 0), 0);
  const escalationsCount = caseResults.filter((c) => c.loopOutcome === 'ESCALATE' && !c.awaitingResponse).length;
  const stoppedCount = caseResults.filter((c) => c.loopOutcome === 'STOPPED').length;
  const failedCount = caseResults.filter((c) => c.loopOutcome === 'FAILED').length;
  const pausedCount = caseResults.filter((c) => c.awaitingResponse).length;
  const recoveryRate = revenueAtRisk > 0 ? (recoveredAmount / revenueAtRisk) * 100 : 0;
  const netRecovered = recoveredAmount - totalInterventionCost;
  const totalVolume = normalizedRows.reduce((s, r) => s + (r.amount || 0), 0);

  progress.status = 'completed';
  progress.processed = normalizedRows.length;
  const runSummary = {
    archetype, funnel, actionBreakdown, segmentPerformance,
    escalationsCount, stoppedCount, failedCount, pausedCount,
    averageProbability: caseResults.length > 0
      ? caseResults.reduce((acc, c) => acc + (c.recoveryProbability || 0), 0) / caseResults.length
      : 0,
    progress,
  };

  // UPDATE, not INSERT — the placeholder row from the top of this function
  // already exists; this is the same row's final state, not a new run.
  await db.prepare(`
    UPDATE dataset_runs SET
      unique_customers = ?, total_volume = ?, revenue_at_risk = ?, recovered_amount = ?,
      intervention_cost = ?, net_recovered = ?, recovery_rate = ?, interventions_count = ?,
      escalations_count = ?, stopped_count = ?, run_summary = ?
    WHERE id = ?
  `).run(
    uniqueCustomersSet.size, totalVolume, revenueAtRisk, recoveredAmount, totalInterventionCost,
    netRecovered, parseFloat(recoveryRate.toFixed(2)), funnel.actionsExecuted,
    escalationsCount, stoppedCount, JSON.stringify(runSummary), runId
  );

  await auditLog({
    entityType: 'dataset_run', entityId: runId, eventType: 'dataset_imported',
    description: `CSV dataset "${runName}" processed: ${normalizedRows.length} records through the LangGraph recovery agent`,
    details: { filename, totalRecords: normalizedRows.length, revenueAtRisk, recoveredAmount },
    actor: 'agent', amount: revenueAtRisk,
  });

  return {
    runId,
    runName,
    filename,
    datasetType: archetype,
    metrics: {
      totalRecords: normalizedRows.length,
      uniqueCustomers: uniqueCustomersSet.size,
      totalVolume,
      revenueAtRisk,
      recoveredAmount,
      remainingRisk: revenueAtRisk - recoveredAmount,
      interventionCost: totalInterventionCost,
      netRecovered,
      recoveryRate: parseFloat(recoveryRate.toFixed(1)),
      revenueRecoveryRate: parseFloat(recoveryRate.toFixed(1)),
      interventionsCount: funnel.actionsExecuted,
      escalationsCount,
      stoppedCount,
      failedCount,
      pausedCount,
    },
    funnel,
    actionBreakdown,
    segmentPerformance,
    cases: caseResults,
  };
}
