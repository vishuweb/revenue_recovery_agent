import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, buildInitialState } from './state.js';
import { getCheckpointer } from './checkpointer.js';
import { normalizePaymentEvent } from './eventNormalizer.js';
import { getDb } from '../db/database.js';
import { logDecision } from '../engine/observability.js';
import { recordOutcome } from '../memory/memoryService.js';
import { NOTIFICATION_CHANNELS } from './tools/actionExecutor.js';

import { detectEvent } from './nodes/detectEvent.js';
import { loadCustomerContext } from './nodes/loadCustomerContext.js';
import { analyzeFailure } from './nodes/analyzeFailure.js';
import { calculateRisk } from './nodes/calculateRisk.js';
import { retrieveMemory } from './nodes/retrieveMemory.js';
import { decideRecoveryAction } from './nodes/decideRecoveryAction.js';
import { policyGate, routePolicyGate } from './nodes/policyGate.js';
import { policyDenied } from './nodes/policyDenied.js';
import { executeAction } from './nodes/executeAction.js';
import { observeOutcome } from './nodes/observeOutcome.js';
import { updateMemory } from './nodes/updateMemory.js';
import { evaluateOutcome, routeEvaluateOutcome } from './nodes/evaluateOutcome.js';

/**
 * The bounded autonomous recovery graph.
 *
 *   START -> detect_event -> load_customer_context -> analyze_failure
 *         -> calculate_risk -> retrieve_memory -> decide_recovery_action
 *         -> policy_gate --DENY--> policy_denied -> update_memory -> evaluate_outcome -> END
 *                        --ALLOW-> execute_action -> observe_outcome -> update_memory -> evaluate_outcome
 *   evaluate_outcome --continue--> decide_recovery_action (loop, bounded)
 *   evaluate_outcome --end------> END
 *
 * Every edge is fixed at build time; the only runtime branching is the two
 * conditional edges below, and both are driven by deterministic state
 * (policy_result.allowed, next_action) that the LLM never writes to.
 */
let compiledGraph = null;

async function buildGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('detect_event', detectEvent)
    .addNode('load_customer_context', loadCustomerContext)
    .addNode('analyze_failure', analyzeFailure)
    .addNode('calculate_risk', calculateRisk)
    .addNode('retrieve_memory', retrieveMemory)
    .addNode('decide_recovery_action', decideRecoveryAction)
    .addNode('policy_gate', policyGate)
    .addNode('policy_denied', policyDenied)
    .addNode('execute_action', executeAction)
    .addNode('observe_outcome', observeOutcome)
    .addNode('update_memory', updateMemory)
    .addNode('evaluate_outcome', evaluateOutcome)

    .addEdge(START, 'detect_event')
    .addEdge('detect_event', 'load_customer_context')
    .addEdge('load_customer_context', 'analyze_failure')
    .addEdge('analyze_failure', 'calculate_risk')
    .addEdge('calculate_risk', 'retrieve_memory')
    .addEdge('retrieve_memory', 'decide_recovery_action')
    .addEdge('decide_recovery_action', 'policy_gate')
    .addConditionalEdges('policy_gate', routePolicyGate, {
      ALLOW: 'execute_action',
      DENY: 'policy_denied',
    })
    .addEdge('policy_denied', 'update_memory')
    .addEdge('execute_action', 'observe_outcome')
    .addEdge('observe_outcome', 'update_memory')
    .addEdge('update_memory', 'evaluate_outcome')
    .addConditionalEdges('evaluate_outcome', routeEvaluateOutcome, {
      continue: 'decide_recovery_action',
      end: END,
    });

  const checkpointer = await getCheckpointer();
  return graph.compile({ checkpointer });
}

async function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph();
  return compiledGraph;
}

function threadIdForPayment(paymentId) {
  return `case_${paymentId}`;
}

/**
 * Run the autonomous recovery agent for a failed payment, start to finish
 * (internally looping decide -> policy -> execute -> observe -> learn up to
 * the state's bounded max_attempts / max_iterations, pausing instead of
 * looping when an action is dispatched but its outcome depends on a real
 * customer response — see observe_outcome / evaluate_outcome).
 *
 * Idempotent: if a recovery_cases row already exists for this payment, the
 * existing case is returned untouched rather than starting a second run.
 *
 * @param {string} paymentId
 * @param {{ threadId?: string, maxAttempts?: number, maxIterations?: number }} [opts]
 * @returns {Promise<{ caseId: string|null, actionId: string|null, decision: any, skipped?: boolean }>}
 */
export async function runRecoveryAgent(paymentId, opts = {}) {
  const db = getDb();

  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment not found');

  const existingCase = await db.prepare('SELECT id FROM recovery_cases WHERE payment_id = ?').get(paymentId);
  if (existingCase) {
    await logDecision(existingCase.id, 'idempotency_skip', { key: paymentId, reason: 'Recovery case already exists' }, { actor: 'agent' });
    return { caseId: existingCase.id, actionId: null, decision: null, skipped: true };
  }

  const event = normalizePaymentEvent(payment, payment.failure_source === 'razorpay' ? 'razorpay_webhook' : 'system');
  const threadId = opts.threadId || threadIdForPayment(paymentId);
  const initialState = buildInitialState(event, { ...opts, threadId });

  const graph = await getGraph();
  const finalState = await graph.invoke(initialState, {
    configurable: { thread_id: threadId },
    recursionLimit: 50,
  });

  return {
    caseId: finalState.caseId,
    actionId: finalState.actionId,
    decision: {
      action: finalState.selected_action,
      reasoning: finalState.action_reason,
      outcome: finalState.outcome,
      stopReason: finalState.stop_reason,
      llmUsed: finalState.decision_ai_assisted,
      analysisAiAssisted: finalState.analysis_ai_assisted,
      memoryInfluenced: finalState.memory_influenced,
      memoryReason: finalState.memory_reason,
    },
  };
}

/**
 * Resume a previously checkpointed thread — either because a dispatched
 * action is now due for a recheck (see executeAction's RECHECK_DELAY_MS),
 * or because it's being resumed manually via /api/agent/resume.
 *
 * If the case already resolved while paused (most commonly: a
 * payment.captured webhook recovered it directly, independent of the
 * agent — see webhooks/route.js), this short-circuits: it attributes the
 * outcome to whichever action was paused, records that fact in long-term
 * memory (deferred exactly for this reason — see update_memory), and
 * returns without re-running the graph. Otherwise it re-invokes the graph
 * from the top on the same thread — LangGraph's checkpointer restores
 * caseId/attempt_count/iteration_count/etc. from the last checkpoint, so
 * counters continue rather than reset, and the fresh pass re-reads
 * current customer/memory data (which may well have changed).
 */
export async function resumeRecoveryAgent(threadId) {
  const db = getDb();
  const paymentId = threadId.startsWith('case_') ? threadId.slice('case_'.length) : null;
  const caseRow = paymentId ? await db.prepare('SELECT * FROM recovery_cases WHERE payment_id = ?').get(paymentId) : null;

  if (caseRow && ['recovered', 'stopped'].includes(caseRow.status)) {
    const lastAction = await db.prepare('SELECT * FROM recovery_actions WHERE case_id = ? ORDER BY created_at DESC LIMIT 1').get(caseRow.id);
    if (lastAction) {
      await recordOutcome({
        customerId: caseRow.customer_id,
        caseId: caseRow.id,
        failureCategory: caseRow.failure_category,
        actionType: lastAction.action_type,
        success: caseRow.status === 'recovered',
        discountPercent: lastAction.discount_percent || null,
        channel: NOTIFICATION_CHANNELS.has(lastAction.action_type) ? lastAction.action_type : null,
        detail: { resolvedWhilePaused: true },
      });
    }
    await logDecision(caseRow.id, 'agent_resumed', {
      alreadyResolved: true, status: caseRow.status,
      message: `Case resolved to '${caseRow.status}' while paused — attributing outcome to '${lastAction?.action_type || 'unknown'}' and recording memory.`,
    }, { actor: 'agent' });
    return { caseId: caseRow.id, resumed: true, alreadyResolved: true, status: caseRow.status };
  }

  if (caseRow) {
    await logDecision(caseRow.id, 'agent_resumed', { alreadyResolved: false }, { actor: 'agent' });
  }

  const graph = await getGraph();
  // NOTE: must be {} here, not null/undefined — LangGraph treats invoke(null)
  // on an existing thread as "nothing to resume" and does no work at all
  // (verified empirically: it just replays the last checkpoint). {} is a
  // real, empty input that still triggers a fresh pass from START while
  // every channel keeps its checkpointed value (each Annotation's reducer
  // in state.js returns `current` when `update` is undefined).
  const finalState = await graph.invoke({}, {
    configurable: { thread_id: threadId },
    recursionLimit: 50,
  });
  return finalState;
}

/**
 * Cron-style sweep: finds every agent-run case that is paused
 * (awaiting_real_world_signal — see observe_outcome) and due for a
 * recheck, and resumes it. Mirrors lib/engine/orchestrator.js's
 * processPendingAutomations() for the deterministic pipeline — wired into
 * the same /api/cron endpoint (see app/api/cron/route.js) rather than a
 * separate scheduler.
 *
 * "Due" means the case's most recent action is complete, does not still
 * require human approval, and its scheduled_at has passed — no other
 * state is needed, since a genuinely resolved case would already be
 * 'recovered' or 'stopped' and therefore excluded by the status filter.
 *
 * @param {{ force?: boolean }} [opts] - force=true ignores scheduled_at
 *   (resumes every eligible paused case right now) — used by the manual
 *   /api/agent/resume demo control, since waiting out a real 30-minute
 *   recheck window isn't practical live. The automatic cron sweep never
 *   passes this.
 */
export async function processPendingAgentResumptions(opts = {}) {
  const db = getDb();
  const scheduleClause = opts.force ? '' : 'AND ra.scheduled_at <= datetime(\'now\')';

  const dueCases = await db.prepare(`
    SELECT rc.id as case_id, rc.payment_id
    FROM recovery_cases rc
    WHERE rc.status IN ('open', 'in_progress')
      AND rc.ai_reasoning LIKE '[Agent%'
      AND EXISTS (
        SELECT 1 FROM recovery_actions ra
        WHERE ra.case_id = rc.id
          AND ra.created_at = (SELECT MAX(created_at) FROM recovery_actions WHERE case_id = rc.id)
          ${scheduleClause}
          AND (ra.requires_approval = 0 OR ra.approved_by IS NOT NULL)
      )
  `).all();

  const results = [];
  for (const row of dueCases) {
    try {
      const finalState = await resumeRecoveryAgent(threadIdForPayment(row.payment_id));
      results.push({ caseId: row.case_id, paymentId: row.payment_id, outcome: finalState?.outcome || finalState?.status || null });
    } catch (err) {
      results.push({ caseId: row.case_id, paymentId: row.payment_id, error: err.message });
    }
  }

  return { checked: dueCases.length, resumed: results.length, results };
}

export function __resetGraphForTests() {
  compiledGraph = null;
}
