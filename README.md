# Recovr — Autonomous AI Revenue Recovery & Payment Orchestration Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/Database-better--sqlite3-003B57?style=flat-square&logo=sqlite)](https://github.com/WiseLibs/better-sqlite3)
[![Hugeicons](https://img.shields.io/badge/Icons-Hugeicons-blue?style=flat-square)](https://hugeicons.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=flat-square)](LICENSE)

**Recovr** is an enterprise-grade autonomous revenue recovery and dunning orchestration engine designed for SaaS, e-commerce, subscription billing, and fintech payment infrastructure. 

Unlike naive dunning scripts or AI wrappers that blindly retry payments or spam customers, Recovr optimizes for **Net Incremental Revenue** using **Net Expected Value (NEV)** decision math. It treats **"Do Nothing"** as a first-class financial action, enforces deterministic business guardrails, guarantees payment idempotency, classifies revenue attribution, and provides complete decision transparency.

---

## 📑 Table of Contents

- [Key Product Capabilities](#-key-product-capabilities)
- [Core Architectural Thesis](#-core-architectural-thesis)
- [Net Expected Value (NEV) Decision Engine](#-net-expected-value-nev-decision-engine)
- ["Do Nothing" as First-Class Action](#-do-nothing-as-first-class-action)
- [Policy & Guardrail Safety Layer](#-policy--guardrail-safety-layer)
- [Failure Recovery & Idempotency](#-failure-recovery--idempotency)
- [Revenue Attribution & Strategy Comparison](#-revenue-attribution--strategy-comparison)
- [The "Run Your Business Data" Experience](#-the-run-your-business-data-experience)
- [Database Schema & Data Models](#-database-schema--data-models)
- [API Reference](#-api-reference)
- [Testing & Observability](#-testing--observability)
- [Getting Started](#-getting-started)
- [License](#-license)

---

## 🚀 Key Product Capabilities

1. **Net Expected Value (NEV) Optimization Engine**:
   - Generates all candidate recovery actions (*retry*, *payment_link*, *email*, *discount*, *free_shipping*, *escalate*, *no_action*).
   - Computes $\text{NEV} = (P_{\text{recovery}} \times \text{Amount}) - \text{Intervention Cost}$.
   - Selects the action with highest positive NEV.
2. **"Do Nothing" (`no_action`) as Optimal Decision**:
   - Intentionally selects inaction when recovery probability is too low, intervention cost exceeds expected return, customer has opted out, or customer fatigue cap is reached.
3. **Policy & Guardrail Layer**:
   - Hard limits: retry caps (5 max), minimum retry interval (30m), communication caps (3 emails/2 SMS), discount caps (10% max), customer fatigue limits (max 5 interventions/30d across all cases).
4. **Idempotency & Resilience**:
   - Deduplicates incoming payment webhooks and event streams via `idempotency_key`.
   - Prevents duplicate recovery cases per payment ID.
   - Handles out-of-order webhooks (e.g., success arriving before failure).
   - Wraps database mutations in atomic `db.transaction()`.
   - Deterministic AI fallback mode when primary decision engine fails.
5. **Revenue Attribution Engine**:
   - Classifies resolved recoveries as `organic` (self-cured without intervention), `recovered` (direct retry success), `assisted` (recovered after outreach), or `unrecovered`.
   - Labeled as **Attributed Recovery** to avoid false claims.
6. **Strategy Comparison**:
   - Benchmarks adaptive NEV recovery against a naive "retry everything" baseline to display true incremental value uplift.
7. **Interactive Judge & Business Data Runner (`/analyze`)**:
   - Upload any custom business CSV or test pre-loaded datasets (*SaaS Subscriptions*, *E-Commerce Dropoffs*, *B2B Invoices*, *Fintech Gateways*).
   - Full RFC 4180 CSV parser with 120+ automatic column header aliases.
   - Interactive candidate NEV matrix & diagnostic drawer per case.
8. **Structured Observability**:
   - Machine-parseable decision lifecycle events logged to `audit_log` across all 12 phases (`event_received` $\rightarrow$ `classified` $\rightarrow$ `predicted` $\rightarrow$ `prioritized` $\rightarrow$ `action_selected` $\rightarrow$ `policy_checked` $\rightarrow$ `executed` $\rightarrow$ `recovered`).

---

## 📐 Core Architectural Thesis

Recovr operates on four core engineering principles:

1. **Problem Taste**: Optimize for **Net Incremental Revenue**, not raw transaction retries. Intervention costs (discounts, email delivery, analyst labor, churn fatigue) are subtracted from expected recovery.
2. **Build Quality**: Relational database integrity using SQLite WAL mode, integer paise accounting (no floating-point rounding errors), foreign keys, and atomic transactions.
3. **Deterministic Safety Layer**: AI recommends actions, but a deterministic **Policy Engine** clamps discounts, enforces caps, and checks DND preferences before any action executes.
4. **Failure Recovery**: Financial actions are guaranteed idempotent. Duplicate events yield `HTTP 200 { duplicate: true }`. Network failures route to a dead-letter queue.

---

## 🧮 Net Expected Value (NEV) Decision Engine

Every recovery case evaluates a full candidate matrix rather than following rigid `if/else` rules:

$$\text{NEV}_{\text{action}} = \left( P_{\text{recovery, action}} \times \text{Amount}_{\text{risk}} \right) - \text{Cost}_{\text{intervention}}$$

### Candidate Cost Model

| Action Candidate | Fixed Cost | Variable Cost | Purpose |
|:---|:---|:---|:---|
| `retry` | ₹0 | ₹0 | Gateway re-attempt |
| `payment_link` | ₹50 | ₹0 | Payment update link delivery |
| `email` | ₹25 | ₹0 | Personalized outreach email |
| `sms` | ₹15 | ₹0 | SMS notification |
| `discount` | ₹0 | 5% – 10% of Amount | Margin concession incentive |
| `free_shipping` | ₹150 | ₹0 | Shipping cost absorption |
| `escalate` | ₹500 | ₹0 | Human analyst time (~30 min) |
| `no_action` | ₹0 | ₹0 | Passive hold — zero intervention |

If all candidate actions yield $\text{NEV} \le 0$, the system selects `no_action`.

---

## 🚫 "Do Nothing" as First-Class Action

In fintech operations, **knowing when NOT to act** is a major quality signal:

- **Low Probability**: If recovery chance is 5% on a ₹500 invoice, spending ₹50 on outreach has negative NEV.
- **Customer Fatigue**: If a customer has received 5 interventions across active cases in 30 days, further communication triggers churn.
- **Hard Declines**: If a card is closed or stolen, retrying network charges wastes fees.
- **Opt-Out**: DND compliance blocks automated communication.

In all these cases, Recovr outputs `no_action` with clear financial justification logged in the audit trail:

> *"No action is the optimal decision. ₹1,200 revenue at risk, but estimated recovery probability is 4.2%. Best candidate (retry) has NEV of -₹50 after accounting for customer fatigue. Automated recovery stopped to protect net ROI."*

---

## 🛡️ Policy & Guardrail Safety Layer

Every proposed action must pass through the `checkGuardrails` pipeline:

```
AI RECOMMENDATION ──► POLICY ENGINE ──► APPROVED / MODIFIED / REJECTED ──► ACTION EXECUTOR
```

### Configurable Business Rules

- **MAX_RETRY_ATTEMPTS**: 5 attempts max
- **MIN_RETRY_INTERVAL**: 30 minutes between retries
- **MAX_EMAILS_PER_CASE**: 3 emails max
- **MAX_SMS_PER_CASE**: 2 SMS max
- **MAX_DISCOUNT_PERCENT**: 10% cap (automatically clamped if AI recommends higher)
- **MARGIN_PROTECTION**: Intervention cost must be $< 15\%$ of amount at risk
- **CUSTOMER_FATIGUE**: Max 5 interventions per customer across all cases in 30 days
- **APPROVAL_THRESHOLD**: Risk $> \text{₹50,000}$ requires human analyst sign-off

---

## 🔄 Failure Recovery & Idempotency

- **Database Atomicity**: Multi-table inserts (`payments`, `recovery_cases`, `recovery_actions`, `events`) are wrapped in `db.transaction()`.
- **Event Deduplication**: Webhooks and API events calculate `idempotency_key = ${event}_${payment_id}`. Duplicate webhooks return `HTTP 200 { duplicate: true }`.
- **Out-of-Order Webhooks**: If a `payment.captured` event arrives before `payment.failed`, the system marks payment success and skips failure case creation.
- **AI Fallback**: If the primary decision engine throws an error or LLM services are unreachable, `deterministicFallback()` executes a safe, rules-only policy and logs `isAIFallback: true`.

---

## 📈 Revenue Attribution & Strategy Comparison

### Attribution Types
- **Organic**: Customer paid before any intervention was executed (self-cure).
- **Recovered**: Direct payment recovery via a scheduled retry.
- **Assisted**: Payment succeeded after non-retry outreach (email, payment link, discount).
- **Unrecovered**: Case closed without resolution.

### Strategy Comparison Baseline
Recovr compares its adaptive NEV engine against a **Naive Retry** baseline (retrying all temporary failures with standard category probabilities). The dashboard surfaces **Incremental Value Uplift**:

$$\text{Incremental Uplift} = \text{Adaptive Recovery Actual} - \text{Naive Retry Baseline}$$

---

## 📊 The "Run Your Business Data" Experience

Run custom CSV datasets or pre-loaded benchmarks through `/analyze`:

```
┌───────────────────────────┐
│     1. Upload CSV /       │
│   Select Demo Dataset     │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│   2. Column Auto-Mapping  │  <-- RFC 4180 Parser + 120+ Header Aliases
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│  3. Live Engine Execution │  <-- Classifier -> Predictor -> Decider -> NEV Matrix
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 4. Verified Yield & Funnel│  <-- Before vs After Net ROI + Case Diagnostics
└───────────────────────────┘
```

---

## 💾 Database Schema & Data Models

Stored in SQLite (`data/revenue_recovery.db`) using **integer paise** ($1\text{ INR} = 100\text{ paise}$):

```sql
recovery_cases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount_at_risk INTEGER NOT NULL,
  expected_recovery INTEGER NOT NULL DEFAULT 0,
  net_expected_value INTEGER NOT NULL DEFAULT 0,
  candidate_actions TEXT,          -- JSON array of all NEV candidates
  failure_reason TEXT NOT NULL,
  failure_category TEXT NOT NULL,
  recovery_probability REAL NOT NULL,
  priority_score REAL NOT NULL,
  recommended_action TEXT,
  ai_reasoning TEXT,
  attribution_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'open',
  attempts_made INTEGER NOT NULL DEFAULT 0,
  recovered_amount INTEGER NOT NULL DEFAULT 0
);
```

---

## ⚡ API Reference

| Endpoint | Method | Purpose |
|:---|:---|:---|
| `/api/dashboard` | `GET` | Aggregates volume, NEV metrics, strategy comparison, and attribution breakdown |
| `/api/dataset/parse` | `POST` | Ingests CSV, auto-maps columns, and returns dataset archetype classification |
| `/api/dataset/run` | `POST` | Runs full dataset row-by-row through the engine and persists results |
| `/api/cases` | `GET`, `POST` | List cases with search/filter or initiate new recovery case |
| `/api/cases/[id]` | `GET`, `PATCH` | Deep case diagnostic view or execute operator intervention |
| `/api/webhooks` | `POST` | Idempotent gateway webhook handler (`payment.failed`, `payment.captured`) |
| `/api/events` | `POST` | Ingest business events (`checkout_abandoned`, `near_expiry_inventory`) |
| `/api/simulator` | `POST` | Sandbox data generator, scenario triggers, and recovery testing |
| `/api/cron` | `GET` | Automated background dunning tick (processes scheduled retries) |

---

## 🧪 Testing & Observability

Run the unit test suite:

```bash
node --test tests/engine.test.mjs
```

### Core Tests Verified (8/8 Pass):
1. **NEV Calculation**: Verifies expected recovery and intervention cost math.
2. **Do Nothing Selection**: Verifies `no_action` is selected when all candidates have negative NEV or low probability.
3. **Guardrails & Policy**: Verifies discount clamping (10% max) and opt-out communication blocking.
4. **Idempotency**: Verifies duplicate payment ID returns existing case without duplicate insertion.
5. **AI Fallback**: Verifies deterministic fallback mode executes safe policies during engine failures.
6. **Revenue Attribution**: Verifies organic vs recovered classification.
7. **CSV Parser**: Verifies flexible column mapping across header aliases.
8. **High-Value Escalation**: Verifies threshold $> \text{₹50,000}$ flags `requiresApproval: true`.

---

## 💻 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Run

```bash
# Clone repository
git clone https://github.com/vishuweb/revenue_recovery_agent.git
cd revenue_recovery_agent

# Install dependencies
npm install

# Run unit tests
node --test tests/engine.test.mjs

# Run Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
