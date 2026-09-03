import { ChatOllama } from '@langchain/ollama';
import { safeParseStructured } from '../schemas.js';

/**
 * LLM provider abstraction.
 *
 * The agent talks to exactly one interface — `getStructuredCompletion` —
 * so the underlying model can be swapped (Ollama today, a hosted provider
 * tomorrow) without touching any graph node. Nothing here ever executes
 * anything: it only returns validated JSON or a typed failure.
 *
 * Configuration is entirely environment-driven:
 *   OLLAMA_BASE_URL — e.g. http://localhost:11434 (default)
 *   OLLAMA_MODEL    — e.g. llama3.1 (default)
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_TIMEOUT_MS = 15000;

let cachedModel = null;

function getChatModel() {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const cacheKey = `${baseUrl}::${model}`;

  if (cachedModel?.key === cacheKey) return cachedModel.instance;

  const instance = new ChatOllama({
    baseUrl,
    model,
    temperature: 0.1,
    format: 'json',
  });

  cachedModel = { key: cacheKey, instance };
  return instance;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Request a structured, schema-validated JSON completion from the LLM.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {import('zod').ZodSchema} params.schema
 * @param {number} [params.timeoutMs]
 * @param {{ invoke: Function }} [params.client] - test seam; defaults to the shared Ollama client
 * @returns {Promise<{ ok: true, data: any } | { ok: false, reason: string }>}
 *   Never throws. A failure here is always a normal, expected outcome that
 *   callers must handle by falling back to deterministic logic.
 */
export async function getStructuredCompletion({ systemPrompt, userPrompt, schema, timeoutMs = DEFAULT_TIMEOUT_MS, client }) {
  let raw;
  try {
    const model = client || getChatModel();
    const response = await withTimeout(
      model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]),
      timeoutMs,
      'Ollama completion'
    );
    raw = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.content ?? '');
  } catch (err) {
    return { ok: false, reason: `llm_unavailable: ${err.message}` };
  }

  const parsed = safeParseStructured(schema, raw);
  if (!parsed.ok) {
    return { ok: false, reason: `invalid_llm_output: ${parsed.error}` };
  }

  return { ok: true, data: parsed.data };
}

/** Exposed for tests that need to swap in a fake model. */
export function __resetCachedModel() {
  cachedModel = null;
}
