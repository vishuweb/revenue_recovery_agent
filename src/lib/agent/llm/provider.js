import { ChatOllama } from '@langchain/ollama';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { safeParseStructured } from '../schemas.js';

/**
 * LLM provider abstraction.
 *
 * The agent talks to exactly one interface — `getStructuredCompletion` —
 * so the underlying model can be swapped without touching any graph node
 * (analyzeFailure.js, decideRecoveryAction.js import only this function).
 * Nothing here ever executes anything: it only returns validated JSON or a
 * typed failure.
 *
 * Configuration is entirely environment-driven:
 *   LLM_PROVIDER    — "ollama" (default) or "gemini"
 *   OLLAMA_BASE_URL — e.g. http://localhost:11434 (default) — ollama only
 *   OLLAMA_MODEL    — e.g. llama3.1 (default) — ollama only
 *   GEMINI_API_KEY  — required when LLM_PROVIDER=gemini
 *   GEMINI_MODEL    — e.g. gemini-2.0-flash (default) — gemini only
 *
 * LLM_PROVIDER=gemini never instantiates ChatOllama, and vice versa — each
 * branch below constructs exactly one client class, so there is no path by
 * which a production deployment configured for Gemini could still attempt
 * to reach a local Ollama instance.
 */

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_TIMEOUT_MS = 15000;

let cachedModel = null;

function getProviderName() {
  const provider = (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
  return provider === 'gemini' ? 'gemini' : 'ollama'; // anything unrecognized falls back to ollama
}

function buildOllamaClient() {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
  return {
    key: `ollama::${baseUrl}::${model}`,
    instance: new ChatOllama({
      baseUrl,
      model,
      temperature: 0.1,
      format: 'json',
    }),
  };
}

function buildGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Thrown here (inside getStructuredCompletion's try block via
    // getChatModel()) so a missing key fails exactly like an unreachable
    // model — the existing llm_enabled/fallback path in analyzeFailure.js
    // and decideRecoveryAction.js handles it unchanged.
    throw new Error('GEMINI_API_KEY is not set');
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  return {
    key: `gemini::${model}`,
    instance: new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature: 0.1,
      json: true,
    }),
  };
}

function getChatModel() {
  const provider = getProviderName();
  const built = provider === 'gemini' ? buildGeminiClient() : buildOllamaClient();

  if (cachedModel?.key === built.key) return cachedModel.instance;

  cachedModel = built;
  return built.instance;
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
 * @param {{ invoke: Function }} [params.client] - test seam; defaults to the configured provider's shared client
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
      'LLM completion'
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

/** Exposed for tests that need to assert which provider is active without constructing a client. */
export function __getProviderNameForTests() {
  return getProviderName();
}
