import { z } from 'zod';

/**
 * Structured-output contracts for every LLM call the agent makes.
 * The LLM's output is validated against these schemas before it is trusted
 * for anything. Invalid output is treated exactly like an unavailable model:
 * the caller falls back to a deterministic result and the run continues.
 *
 * Enums are deliberately closed over the values the deterministic engine
 * already knows how to handle (see lib/engine/classifier.js and
 * lib/engine/economics.js's ACTION_COST_MODEL) — the LLM can only choose
 * among options the system is actually prepared to execute.
 */

export const FAILURE_CATEGORIES = ['temporary', 'behavioral', 'permanent', 'abandonment', 'opportunity', 'unknown'];

export const FailureAnalysisSchema = z.object({
  rootCause: z.string().min(1).max(400),
  category: z.enum(FAILURE_CATEGORIES),
  confidence: z.number().min(0).max(1),
});

export const RecoveryActionCatalog = [
  'no_action', 'retry', 'payment_link', 'email', 'sms', 'cart_reminder',
  'discount', 'free_shipping', 'targeted_campaign', 'escalate',
];

/**
 * The LLM picks ONE action from the candidate list it was given (a subset
 * of RecoveryActionCatalog computed deterministically by the decider) —
 * never an arbitrary string, never a retry count, never a URL or amount.
 */
export const ActionRecommendationSchema = z.object({
  recommendedAction: z.enum(RecoveryActionCatalog),
  reasoning: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export function safeParseStructured(schema, raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw;
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err.message}` };
  }
}

/** LLMs frequently wrap JSON in prose or markdown fences — pull the first {...} block out. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}
