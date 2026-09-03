import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, buildInitialState } from './state.js';
import { getCheckpointer } from './checkpointer.js';
import { normalizePaymentEvent } from './eventNormalizer.js';
import { getDb } from '../db/database.js';
import { logDecision } from '../engine/observability.js';

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

function buildGraph() {
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

  return graph.compile({ checkpointer: getCheckpointer() });
}

function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph();
  return compiledGraph;
}

/**
 * Run the autonomous recovery agent for a failed payment, start to finish
 * (internally looping decide -> policy -> execute -> observe -> learn up to
 * the state's bounded max_attempts / max_iterations).
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
  const threadId = opts.threadId || `case_${paymentId}`;
  const initialState = buildInitialState(event, { ...opts, threadId });

  const graph = getGraph();
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
      llmUsed: finalState.llm_used,
    },
  };
}

/**
 * Resume a previously checkpointed thread (e.g. a case that exited the
 * graph awaiting a scheduled retry or human approval) from wherever it
 * left off. Used by the cron/pending-automations sweep.
 */
export async function resumeRecoveryAgent(threadId) {
  const graph = getGraph();
  const finalState = await graph.invoke(null, {
    configurable: { thread_id: threadId },
    recursionLimit: 50,
  });
  return finalState;
}

export function __resetGraphForTests() {
  compiledGraph = null;
}
