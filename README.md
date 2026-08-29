# Recovr — Autonomous AI Revenue Recovery & Payment Orchestration Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/Database-better--sqlite3-003B57?style=flat-square&logo=sqlite)](https://github.com/WiseLibs/better-sqlite3)
[![Hugeicons](https://img.shields.io/badge/Icons-Hugeicons-blue?style=flat-square)](https://hugeicons.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=flat-square)](LICENSE)

**Recovr** is an enterprise-grade autonomous revenue recovery and dunning orchestration engine designed for SaaS, e-commerce, subscription businesses, and modern billing infrastructure. It intelligently diagnoses payment failures, predicts recovery probability using customer lifetime value (LTV) and historical reliability, schedules optimal retries, enforces bounded compliance guardrails, and allows operators or judges to **upload and execute their own business datasets in real-time**.

---

## 📑 Table of Contents

- [Key Product Capabilities](#-key-product-capabilities)
- [The "Run Your Business Data" Experience](#-the-run-your-business-data-experience)
- [System Architecture & Workflow](#-system-architecture--workflow)
- [Real Decision Pipeline & Guardrails](#-real-decision-pipeline--guardrails)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Database Schema & Data Models](#-database-schema--data-models)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
- [Razorpay & Gateway Integration Architecture](#-razorpay--gateway-integration-architecture)
- [Contributing & License](#-contributing--license)

---

## 🚀 Key Product Capabilities

1. **"Run Your Business Data" Live Command Center (`/analyze`)**:
   - Upload any custom CSV or choose from 4 curated business datasets (*SaaS Subscriptions*, *E-Commerce Dropoffs*, *B2B Overdue Invoices*, *Multi-Gateway Declines*).
   - Intelligent column recognition maps diverse header conventions (`customer_id`, `amount`, `order_value`, `failure_reason`, `plan`, `ltv`, `discount_affinity`) automatically.
   - Interactive column-mapping review matrix and pre-execution data risk preview.
   - **Zero Hardcoded Numbers**: Every uploaded row flows through the real underlying classification, prediction, decision, and guardrail engines.
2. **Live Agent Execution Telemetry**:
   - Progressive 8-stage execution checklist with live progress counters and real-time streaming decision feeds.
3. **Before vs After Financial Yield & 6-Stage Recovery Funnel**:
   - High-impact Before vs After showcase comparing Gross Revenue at Risk against Net Recovered Revenue.
   - Interactive 6-stage funnel: `Uploaded Records` $\rightarrow$ `Revenue-Risk Events` $\rightarrow$ `Eligible for Recovery` $\rightarrow$ `Agent Decisions` $\rightarrow$ `Actions Executed` $\rightarrow$ `Successful Recoveries`.
4. **Deep Case Diagnostic Drawer**:
   - Click any case to inspect multi-factor probability factors, strategy rationale, guardrail compliance notices, and chronological audit timelines.
5. **Persistent Dataset Run History**:
   - Saves all dataset runs in SQLite (`dataset_runs`) for retrospective benchmarking and comparison.
6. **Executive Telemetry Dashboard (`/`) & Workbench (`/cases`)**:
   - Financial telemetry, active dunning triage, and manual operator overrides.
7. **Orchestrator Sandbox & Simulator (`/simulator`)**:
   - Synthetic failure injection across soft declines, hard declines, high-value alerts, and checkout timeouts.
8. **Compliance & Immutable Audit Ledger (`/audit`)**:
   - Chronological audit trail recording all evaluations, guardrail checks, and actor actions.

---

## 📊 The "Run Your Business Data" Experience

Recovr provides a dynamic evaluation flow designed for business operators and judges:

```
┌───────────────────────────┐
│     1. Upload CSV /       │
│  Select Curated Dataset   │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  2. Intelligent Column    │
│    Mapping & Validation   │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  3. Pre-Run Risk Preview  │
│  (Total Vol, At Risk ₹)   │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  4. Run Recovery Engine   │
│ (Live 8-Stage Telemetry)  │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  5. Dynamic Yield Funnel  │
│  & Case Diagnostic Drawer │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 6. Persistent Run History │
└───────────────────────────┘
```

---

## 🏗️ System Architecture & Workflow

```
                                 ┌──────────────────────────┐
                                 │ Uploaded CSV / Webhook / │
                                 │     Simulator Event      │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  1. Event Normalizer     │
                                 │  & Flexible Schema Mapper│
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  2. Failure Classifier   │
                                 │ (Soft, Hard, Behavioral) │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  3. Customer Context     │
                                 │ (Tenure, LTV, Affinity)  │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  4. Predictive Engine    │
                                 │ (Decay, History, Prob %) │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  5. Priority Matrix      │
                                 │   (P0 Critical to P3)    │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  6. AI Strategy Decider  │
                                 │  (Deterministic Fallback)│
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  7. Policy Guardrails    │
                                 │(10% Disc Cap, Max Retry) │
                                 └────────────┬─────────────┘
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
              ┌─────────────────────┐                   ┌─────────────────────┐
              │ Automated Execution │                   │  Operator Override  │
              │(Retry/Link/Discount)│                   │  (Manual Approval)  │
              └──────────┬──────────┘                   └──────────┬──────────┘
                         │                                         │
                         └────────────────────┬────────────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │ 8. Probabilistic Settle  │
                                 │   & Adaptive Calibration │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │  9. Immutable Audit Log  │
                                 │   & Historical Reports   │
                                 └──────────────────────────┘
```

---

## 🛡️ Real Decision Pipeline & Guardrails

### 1. Differentiated Customer Decisions
The engine never applies a generic one-size-fits-all action:
* **Temporary Soft Declines** (`insufficient_funds`, `gateway_error`, `bank_server_down`): Computes statistical retry delays (e.g. 6 hours / 30 mins) with high recovery probability.
* **Permanent Hard Declines** (`card_expired`, `invalid_card`, `international_blocked`): Halts retries and dispatches self-serve payment link with tokenization.
* **High-LTV Enterprise Accounts**: Flagged as P0 Critical Impact and routed for white-glove support escalation.
* **Checkout Dropoffs with High Discount Affinity**: Offers dynamic promotional courtesy discount.
* **Exhausted Attempts / Low Probability**: Bounded by policy stop to prevent payment processor fees and customer annoyance.

### 2. Business Policy Guardrails
* **`MAX_DISCOUNT_PERCENT`**: Automatically clamps discounts to a maximum 10% ceiling.
* **`MAX_RETRY_ATTEMPTS`**: Caps retries at 5 attempts.
* **`MIN_RETRY_INTERVAL`**: Enforces a 30-minute cooldown between retry charges.
* **`MARGIN_PROTECTION`**: Prevents concession costs from exceeding 15% of the transaction value.
* **`CUSTOMER_OPTED_OUT`**: Automatically suppresses outbound communication for opted-out users.

---

## 🛠️ Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
* **Frontend**: [React 19](https://react.dev/), Custom Enterprise FinTech CSS Design System
* **Iconography**: [Hugeicons React](https://hugeicons.com/) (`@hugeicons/react`, `@hugeicons/core-free-icons`)
* **Charts & Analytics**: [Recharts](https://recharts.org/)
* **Database**: [SQLite](https://sqlite.org/) via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) with WAL mode and performance indexing
* **Utilities**: `uuid` for entity identification

---

## 📂 Project Directory Structure

```
revenue_recovery_agent/
├── data/
│   └── revenue_recovery.db       # Embedded SQLite database
├── src/
│   ├── app/
│   │   ├── analyze/              # "Run Your Business Data" command center
│   │   │   └── page.js           # Upload, mapping, live execution & funnel UI
│   │   ├── api/                  # REST API Route Handlers
│   │   │   ├── audit/            # Audit trail stream
│   │   │   ├── cases/            # Case retrieval & action dispatcher
│   │   │   ├── cron/             # Background pipeline sweep runner
│   │   │   ├── customers/        # Customer portfolio data
│   │   │   ├── dashboard/        # High-level KPIs & chart feeds
│   │   │   ├── dataset/
│   │   │   │   ├── parse/        # CSV parsing & column mapping endpoint
│   │   │   │   ├── run/          # Real engine pipeline execution endpoint
│   │   │   │   └── runs/         # Dataset run history endpoints
│   │   │   ├── events/           # External event ingestion
│   │   │   ├── simulator/        # Sandbox scenario dispatcher
│   │   │   └── webhooks/         # Payment gateway webhook receiver
│   │   ├── audit/                # Audit trail UI
│   │   ├── cases/                # Case listing and detail pages
│   │   ├── components/           # UI Components (Charts, Modals, Avatars, Icons)
│   │   │   ├── ActionModal.js    # Intervention dispatch modal
│   │   │   ├── Charts.js         # Recharts wrappers
│   │   │   ├── CommandPalette.js # ⌘K search & quick action palette
│   │   │   ├── CustomerAvatar.js # Dynamic customer avatar
│   │   │   ├── Icons.js          # Centralized Hugeicons layer
│   │   │   ├── ToastContext.js   # Global toast notifications
│   │   │   └── TopNav.js         # Global navigation header
│   │   ├── customers/            # Customer portfolio and profile pages
│   │   ├── simulator/            # Sandbox test workbench
│   │   ├── globals.css           # Enterprise FinTech styling & variables
│   │   ├── layout.js             # App shell, sidebar & root layout
│   │   └── page.js               # Main Executive Dashboard
│   └── lib/
│       ├── dataset/
│       │   ├── demo-datasets.js  # Curated sample business datasets
│       │   ├── parser.js         # CSV parser & column normalizer
│       │   └── pipeline.js       # Complete recovery pipeline engine
│       ├── db/
│       │   ├── database.js       # SQLite connection manager & seed loader
│       │   └── schema.sql        # Database tables, relationships & indexes
│       ├── engine/               # Core AI Decision Engine
│       │   ├── classifier.js     # Gateway decline classifier
│       │   ├── decider.js        # Action strategy optimizer
│       │   ├── guardrails.js     # Safety & limit enforcement
│       │   ├── orchestrator.js   # Event lifecycle & retry coordinator
│       │   ├── predictor.js      # Recovery probability calculator
│       │   └── prioritizer.js    # Urgency & value ranking matrix
│       ├── providers/
│       │   ├── provider.js       # Base payment gateway interface
│       │   └── simulation.js     # Gateway execution provider
│       └── simulation/
│           ├── generator.js      # Synthetic data generator
│           └── scenarios.js      # Pre-built failure archetypes
├── jsconfig.json                 # Path aliases
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies & scripts
└── README.md                     # Documentation
```

---

## 🗄️ Database Schema & Data Models

The database schema is defined in [`src/lib/db/schema.sql`](src/lib/db/schema.sql). Monetary amounts are stored in **paise** ($1\text{ INR} = 100\text{ paise}$) to eliminate floating-point inaccuracies.

### Core Tables
* **`dataset_runs`**: Historical dataset run records (total volume, revenue at risk, recovered amount, net yield, recovery rate, archetype, and stage summaries).
* **`customers`**: Subscriber accounts, MRR, Lifetime Value, payment method tokens, churn risk scores, and discount affinity.
* **`subscriptions`**: Active billing plans, recurring intervals, and failure counters.
* **`invoices`**: Billing statements and payment due dates.
* **`payments`**: Payment attempts, gateway decline codes, and transaction statuses.
* **`recovery_cases`**: Active dunning cases, amount at risk, predicted recovery score, priority rating, and assigned strategy.
* **`recovery_actions`**: Dispatched interventions (scheduled retries, dunning notices, discounts offered).
* **`audit_log`**: Immutable chronological history of all engine evaluations and operator overrides.
* **`events`**: Ingested webhook and lifecycle events.

---

## 🔌 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| **`/api/dataset/parse`** | `POST` | Parses uploaded CSV, auto-detects column mappings, and generates pre-run risk summary. |
| **`/api/dataset/run`** | `POST` | Executes normalized dataset through the full recovery pipeline and returns dynamic yield metrics. |
| **`/api/dataset/runs`** | `GET` | Lists historical dataset runs with performance statistics. |
| **`/api/dataset/runs/[id]`** | `GET` | Retrieves full run summary and case breakdown for a past dataset evaluation. |
| **`/api/dashboard`** | `GET` | Fetches aggregate recovery KPIs, 30-day trends, decline reasons, and recent cases. |
| **`/api/cases`** | `GET` | Lists recovery cases with support for `status`, `sortBy`, and `search` query parameters. |
| **`/api/cases/[id]`** | `GET` | Retrieves diagnostic data, audit trail, customer info, and action steps for a case. |
| **`/api/cases/[id]`** | `PATCH` | Executes an action (`approve`, `execute`, `escalate`, `stop`, or appends notes). |
| **`/api/customers`** | `GET` | Returns the customer directory with risk scores and LTV metrics. |
| **`/api/simulator`** | `POST` | Dispatches sandbox commands (`seed`, `trigger_scenario`, `bulk_scenarios`, `simulate_recovery`). |
| **`/api/cron`** | `GET` | Executes automated batch retry evaluations across all active recovery cases. |
| **`/api/audit`** | `GET` | Returns chronological audit log entries with optional `entity_type` filter. |
| **`/api/webhooks`** | `POST` | Ingests payment gateway webhooks (`charge.failed`, `invoice.payment_failed`). |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.17.0 or higher
* **npm** / **yarn** / **pnpm**

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/vishuweb/revenue_recovery_agent.git
   cd revenue_recovery_agent
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

4. **Access the Dashboard**:
   Open your browser at **[http://localhost:3000](http://localhost:3000)**.
   - Navigate to **"Run Your Business Data"** (`/analyze`) to upload and run your own datasets.
   - Navigate to **"Orchestrator Sandbox"** (`/simulator`) to inject synthetic real-time failure scenarios.

### Production Build
```bash
npm run build
npm run start
```

---

## 💳 Razorpay & Gateway Integration Architecture

Recovr uses a modular gateway abstraction layer:

```
Uploaded Dataset / Webhook
            ↓
  Normalized Event Model
            ↓
  Revenue Recovery Engine
            ↓
     Payment Provider
     ├── Simulation / Mock Provider
     └── Razorpay Integration Provider
```

* The core engine is decoupled from specific gateways, allowing plug-and-play switching between simulation mode and live payment gateways (e.g. Razorpay, Stripe) without altering recovery logic.

---

## 🤝 Contributing & License

Contributions, issues, and feature requests are welcome!

Distributed under the **MIT License**. See `LICENSE` for more information.
