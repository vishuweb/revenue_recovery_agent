# Recovr — Autonomous AI Revenue Recovery & Payment Orchestration Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/Database-better--sqlite3-003B57?style=flat-square&logo=sqlite)](https://github.com/WiseLibs/better-sqlite3)
[![Hugeicons](https://img.shields.io/badge/Icons-Hugeicons-blue?style=flat-square)](https://hugeicons.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=flat-square)](LICENSE)

**Recovr** is an enterprise-grade autonomous revenue recovery and dunning orchestration engine designed for SaaS, subscription businesses, and modern billing infrastructure. It intelligently diagnoses payment failures, predicts recovery probability using customer lifetime value (LTV) and historical reliability, schedules optimal retries, and delivers personalized multi-channel dunning workflows with strict compliance guardrails.

---

## 📑 Table of Contents

- [The Problem & Solution](#-the-problem--the-solution)
- [System Architecture & Workflow](#-system-architecture--workflow)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Database Schema & Data Models](#-database-schema--data-models)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
- [Simulation & Testing Sandbox](#-simulation--testing-sandbox)
- [Contributing & License](#-contributing--license)

---

## 💡 The Problem & The Solution

### The Problem
* **Involuntary Churn**: Over 40% of SaaS customer churn is involuntary, caused by expired credit cards, transient bank network timeouts, or temporary insufficient funds.
* **Naive Dunning & Retries**: Blindly retrying payments immediately or spamming generic email notices burns customer trust, causes payment processor fraud flags, and loses high-value accounts.

### The Recovr Solution
* **Deterministic Classification**: Categorizes payment declines into Hard vs Soft errors, fraud indicators, customer-side issues, and technical gateway faults.
* **Predictive Recovery Scoring**: Weighs MRR, Lifetime Value (LTV), discount affinity, and transaction frequency to prioritize high-impact interventions.
* **Dynamic Decision Engine**: Selects the optimal recovery path (smart exponential retry delays, tokenized payment method update links, courteous retention concessions, or human analyst escalation).
* **Immutable Compliance Audit Trail**: Every automated evaluation, discount offer, and retry attempt is logged with full transparency.

---

## 🏗️ System Architecture & Workflow

```
                               ┌────────────────────────┐
                               │ Payment Gateway Webhook│
                               │   or Synthetic Event   │
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 1. Failure Classifier  │
                               │  (Soft / Hard / Risk)  │
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 2. Predictive Modeler  │
                               │ (LTV, History, Prob %) │
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 3. Priority Matrix     │
                               │  (P0 Critical to P3)   │
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 4. Strategy Decider    │
                               │ (Retry, Dunning, Offer)│
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 5. Safety Guardrails   │
                               │ (Max retry, Cooldown)  │
                               └───────────┬────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
             ┌─────────────────────┐               ┌─────────────────────┐
             │ Automated Execution │               │  Operator Review    │
             │ (Retry/Email/Link)  │               │  (Manual Override)  │
             └──────────┬──────────┘               └──────────┬──────────┘
                        │                                     │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ 6. Immutable Audit Log │
                               │   & Telemetry Stream   │
                               └────────────────────────┘
```

---

## ✨ Key Features

### 1. Executive Telemetry Dashboard (`/`)
* **Real-time Financial KPIs**: Instant tracking of Total Volume Processed, Volume At Risk, Net Recovered Revenue, and Recovery Conversion Rate.
* **Interactive Visualizations**: 30-Day trend graphs, gateway decline root cause breakdowns, and pipeline stage distribution using [Recharts](https://recharts.org/).
* **Priority Queue**: High-density table of active recovery cases with one-click intervention triggers.

### 2. Recovery Case Workbench (`/cases`, `/cases/[id]`)
* **Multi-stage Triage**: Filter by Open, In-Progress, Recovered, Failed, or Stopped status.
* **AI Decision Inspector**: Transparent reasoning explaining why a specific retry cadence or outreach tone was selected.
* **Step-by-step Execution Timeline**: Complete chronicle of retries, email/SMS dispatches, and gateway responses.
* **Manual Override**: Operators can approve, immediately charge, escalate to a human analyst, or dismiss cases.

### 3. Customer Portfolio & Risk Profiler (`/customers`, `/customers/[id]`)
* **360° Account Telemetry**: Lifetime Value (LTV), Monthly Recurring Revenue (MRR), and payment success history.
* **Churn Risk Gauge**: Quantitative risk score calculating default probability.
* **Historical Ledger**: Unified log of past subscriptions, invoices, and payment attempts.

### 4. Orchestrator Sandbox & Simulator (`/simulator`)
* **Synthetic Failure Injection**: Test engine behavior against real-world scenarios:
  * `Temporary Insufficient Funds` (Soft decline)
  * `Chronic Failure Over Time` (High risk)
  * `Enterprise High-Value Alert` (P0 critical)
  * `Expired Card Hard Decline` (Payment update link)
  * `Cart & Session Dropoffs` (Checkout timeouts)
* **One-Click Batch Simulation**: Generate up to 50 concurrent cases or execute a scheduled pipeline sweep.

### 5. Compliance & Immutable Audit Trail (`/audit`)
* **Full Operational Auditability**: Structured log recording actor (`engine`, `system`, or `operator`), event type, description, and raw JSON payload.
* **Copyable Payloads**: Inspect and copy event metadata for compliance reviews and debugging.

---

## 🛠️ Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
* **Frontend**: [React 19](https://react.dev/), Custom Enterprise FinTech CSS Design System
* **Iconography**: [Hugeicons React](https://hugeicons.com/) (`@hugeicons/react`, `@hugeicons/core-free-icons`)
* **Charts & Analytics**: [Recharts](https://recharts.org/)
* **Database**: [SQLite](https://sqlite.org/) via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) with foreign key enforcement and indexed queries
* **Utilities**: `uuid` for deterministic entity identification

---

## 📂 Project Directory Structure

```
revenue_recovery_agent/
├── data/
│   └── revenue_recovery.db       # Embedded SQLite database
├── src/
│   ├── app/
│   │   ├── api/                  # REST API Route Handlers
│   │   │   ├── audit/            # Audit trail stream
│   │   │   ├── cases/            # Case retrieval & action dispatcher
│   │   │   ├── cron/             # Background pipeline sweep runner
│   │   │   ├── customers/        # Customer portfolio data
│   │   │   ├── dashboard/        # High-level KPIs & chart feeds
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
│       │   └── simulation.js     # Mock gateway execution provider
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

The database schema is defined in [`src/lib/db/schema.sql`](src/lib/db/schema.sql). Monetary amounts are stored in **paise** ($1\text{ INR} = 100\text{ paise}$) to avoid floating-point inaccuracies.

### Core Tables
* **`customers`**: Subscriber records, MRR, Lifetime Value, payment method tokens, churn risk scores, and discount affinity.
* **`subscriptions`**: Active billing plans, recurring intervals, and failure counters.
* **`invoices`**: Billing statements and payment due dates.
* **`payments`**: Payment attempts, gateway decline codes, and transaction statuses.
* **`recovery_cases`**: Active dunning cases, amount at risk, predicted recovery score, priority rating, and assigned strategy.
* **`recovery_actions`**: Individual dispatched interventions (scheduled retries, dunning notices, discounts offered).
* **`audit_log`**: Immutable chronological history of all engine evaluations and operator overrides.
* **`events`**: Ingested webhook and lifecycle events.

---

## 🔌 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| **`/api/dashboard`** | `GET` | Fetches aggregate recovery KPIs, 30-day trends, decline reasons, and recent cases. |
| **`/api/cases`** | `GET` | Lists recovery cases with support for `status`, `sortBy`, and `search` query parameters. |
| **`/api/cases/[id]`** | `GET` | Retrieves full diagnostic data, audit trail, customer info, and action steps for a case. |
| **`/api/cases/[id]`** | `PATCH` | Executes an action (`approve`, `execute`, `escalate`, `stop`, or appends notes). |
| **`/api/customers`** | `GET` | Returns the customer directory with risk scores and LTV metrics. |
| **`/api/customers/[id]`** | `GET` | Returns 360° customer profile, past payments, and case history. |
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

3. **Initialize & Start the Development Server**:
   ```bash
   npm run dev
   ```

4. **Access the Dashboard**:
   Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)**. The database will automatically initialize and seed with realistic simulation cases on first launch.

### Production Build
To create an optimized production build:
```bash
npm run build
npm run start
```

---

## 🧪 Simulation & Testing Sandbox

To test how the engine reacts to various payment issues without connecting a live billing gateway:

1. Navigate to **`/simulator`** in the application.
2. Click **"Re-seed Dataset"** to reset the environment with a clean set of test subscribers.
3. Click any **"Inject Event"** button on the scenario cards to simulate real-world failures (e.g. *Temporary Insufficient Funds*, *Expired Card*, *Cart Abandonment*).
4. Watch the engine compute recovery probabilities, assign priority scores, and select the optimal dunning sequence in real time.
5. Click **"Run Pipeline"** in the top navigation bar to simulate automated retry evaluation cycles.

---

## 🤝 Contributing & License

Contributions, issues, and feature requests are welcome! Feel free to open a pull request or issue.

Distributed under the **MIT License**. See `LICENSE` for more information.
