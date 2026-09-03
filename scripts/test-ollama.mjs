#!/usr/bin/env node
// npm run test:ollama
//
// Live Ollama smoke test + a controlled A/B/C comparison (deterministic
// baseline vs memory-informed vs Ollama-guided) for one realistic
// payment-failure case. Never touches Supabase (preloaded with the same
// test-DB guard the automated suite uses) and never executes a financial
// action — it stops after policy_gate, one step before execute_action.
//
// This script builds its own synthetic customer/case state rather than
// writing anything to the business database, so it is safe to run against
// any environment regardless of DATABASE_URL.

import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');
const p = (rel) => pathToFileURL(path.join(SRC, rel)).href;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

function line() { console.log('-'.repeat(60)); }

async function checkOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    return { available: true, models: (data.models || []).map((m) => m.name) };
  } catch {
    return { available: false, models: [] };
  }
}

function buildDemoScenario() {
  // A realistic, moderate-value SaaS subscription failure — deliberately
  // the exact category/amount shape where 'email' wins on raw NEV but
  // 'payment_link' wins once personal history is considered (verified
  // against lib/engine/decider.js's real numbers), so the comparison
  // below has a genuine chance to show a difference, not a coin flip.
  const customer = {
    id: 'demo_cust_ollama_smoke_test',
    plan: 'growth',
    lifetime_value: 300000,
    discount_affinity: 0.6,
    opted_out: 0,
    total_payments: 12,
    successful_payments: 10,
  };
  const event = { eventType: 'payment.failed', paymentId: null, customerId: customer.id, amount: 40000, failureReason: 'authentication_failed', source: 'system' };
  return { customer, event, amountAtRisk: 40000 };
}

async function runThroughDecision({ customer, event, amountAtRisk, llmEnabled, memory }) {
  const { analyzeFailure } = await import(p('lib/agent/nodes/analyzeFailure.js'));
  const { calculateRisk } = await import(p('lib/agent/nodes/calculateRisk.js'));
  const { decideRecoveryAction } = await import(p('lib/agent/nodes/decideRecoveryAction.js'));
  const { policyGate } = await import(p('lib/agent/nodes/policyGate.js'));

  let state = {
    customerId: customer.id,
    customer,
    payment: null,
    event,
    amount_at_risk: amountAtRisk,
    customer_value: customer.lifetime_value,
    attempt_count: 0,
    max_attempts: 5,
    failure_reason: event.failureReason,
    retrieved_memory: memory || { preferredChannel: null, priorSuccessfulActions: [], priorFailedActions: [], topStrategiesForCategory: [], sampleSize: 0 },
    llm_enabled: llmEnabled,
    timestamps: { startedAt: new Date().toISOString() },
    action_params: {},
  };

  state = { ...state, ...(await analyzeFailure(state)) };
  state = { ...state, ...(await calculateRisk(state)) };
  const decision = await decideRecoveryAction(state);
  state = { ...state, ...decision };

  const policy = await policyGate({ ...state, caseId: null });

  return { state, decision, policy };
}

async function main() {
  console.log('=== Live Ollama Smoke Test ===\n');

  const { available, models } = await checkOllamaAvailable();
  console.log(`Ollama: ${available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  console.log(`Base URL: ${OLLAMA_BASE_URL}`);
  console.log(`Model (configured): ${OLLAMA_MODEL}`);
  if (available) {
    const hasModel = models.some((m) => m === OLLAMA_MODEL || m.startsWith(`${OLLAMA_MODEL}:`));
    console.log(`Model (installed?): ${hasModel ? 'YES' : `NOT FOUND in [${models.join(', ') || 'none'}] — pull it with: ollama pull ${OLLAMA_MODEL}`}`);
  }
  line();

  if (!available) {
    console.log('Ollama is not reachable — running the deterministic-only path instead.');
    console.log('(This is the safe fallback behavior, not a failure of the harness.)\n');
  }

  const scenario = buildDemoScenario();

  // llmEnabled is always true here — we want a REAL attempt against
  // OLLAMA_BASE_URL and an honest report of what happened, not a
  // pre-emptive skip based on our own ping above (getStructuredCompletion
  // fails fast and safely on its own when unreachable).
  const { state, decision, policy } = await runThroughDecision({ ...scenario, llmEnabled: true });

  const structuredOutputPass = available ? state.decision_ai_assisted === true : null;
  const candidateNames = state.candidate_actions.map((c) => c.action);
  const candidateValidationPass = candidateNames.includes(state.selected_action);
  const policyValidationPass = typeof policy.policy_result?.allowed === 'boolean';

  console.log('=== Single Case: Structured Decision ===');
  console.log(`Failure: ${scenario.event.failureReason} | Amount at risk: Rs.${(scenario.amountAtRisk / 100).toFixed(0)} | Customer: ${scenario.customer.plan} tier`);
  console.log(`Candidate actions (deterministic, memory-adjusted): ${candidateNames.join(', ')}`);
  console.log(`Selected action: ${state.selected_action}`);
  console.log(`AI-assisted: ${state.decision_ai_assisted} ${state.decision_ai_assisted ? '' : `(fallback reason: ${state.decision_ai_fallback_reason})`}`);
  console.log(`Reasoning: ${state.action_reason}`);
  console.log(`Policy result: ${policy.policy_result.allowed ? 'ALLOWED' : `DENIED (${policy.policy_result.violations.join('; ')})`}`);
  line();

  console.log('Structured output:      ' + (structuredOutputPass === null ? 'SKIPPED (Ollama unavailable)' : structuredOutputPass ? 'PASS' : 'FAIL'));
  console.log('Candidate validation:   ' + (candidateValidationPass ? 'PASS' : 'FAIL'));
  console.log('Policy validation:      ' + (policyValidationPass ? 'PASS' : 'FAIL'));
  console.log('AI decision:            ' + (structuredOutputPass === true ? 'PASS' : structuredOutputPass === false ? 'FAIL' : 'SKIPPED (Ollama unavailable)'));
  line();

  // ---- A/B/C comparison: deterministic vs memory vs Ollama ----
  console.log('\n=== A/B/C Comparison: does AI/memory actually change anything? ===\n');

  const memoryContext = {
    preferredChannel: 'payment_link',
    priorSuccessfulActions: ['payment_link'],
    priorFailedActions: ['email'],
    topStrategiesForCategory: [{ action: 'payment_link', successRate: 65 }],
    sampleSize: 3,
  };

  const runA = await runThroughDecision({ ...scenario, llmEnabled: false, memory: null });
  const runB = await runThroughDecision({ ...scenario, llmEnabled: false, memory: memoryContext });
  const runC = await runThroughDecision({ ...scenario, llmEnabled: true, memory: memoryContext });

  console.log(`A. Deterministic baseline (no memory, no AI):  ${runA.decision.selected_action}`);
  console.log(`   Reasoning: ${runA.decision.action_reason}`);
  console.log(`B. + Long-term memory (no AI):                 ${runB.decision.selected_action}`);
  console.log(`   Reasoning: ${runB.decision.action_reason}`);
  console.log(`C. + Ollama (memory-adjusted candidates):      ${runC.decision.selected_action} ${runC.state.decision_ai_assisted ? '(AI-assisted)' : '(AI unavailable/skipped — deterministic pick used)'}`);
  console.log(`   Reasoning: ${runC.decision.action_reason}`);
  line();

  const memoryChangedIt = runB.decision.selected_action !== runA.decision.selected_action;
  console.log(`Memory changed the decision (B vs A): ${memoryChangedIt ? 'YES' : 'no'}`);
  if (available) {
    const ollamaChangedIt = runC.decision.selected_action !== runB.decision.selected_action;
    console.log(`Ollama changed the decision (C vs B): ${ollamaChangedIt ? 'YES' : 'no'}`);
    if (!ollamaChangedIt && runC.state.decision_ai_assisted) {
      console.log('  -> Ollama agreed with the memory-informed pick. Its reasoning text is still genuine model output (see above), not a fabricated label — agreement is a valid, honest outcome, not a failure.');
    }
  } else {
    console.log('Ollama changed the decision (C vs B): SKIPPED — Ollama unavailable, C used the deterministic fallback.');
  }

  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('Ollama smoke test crashed:', err);
  process.exitCode = 1;
});
