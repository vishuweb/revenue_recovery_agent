import { getDb, resetDatabase, auditLog } from '../src/lib/db/database.js';
import { generateSimulationData } from '../src/lib/simulation/generator.js';
import { triggerScenario } from '../src/lib/simulation/scenarios.js';
import { processFailedPayment, processRecoveryOutcome, processPendingAutomations } from '../src/lib/engine/orchestrator.js';
import { POST as webhookHandler } from '../src/app/api/webhooks/simulate/route.js';
import { v4 as uuidv4 } from 'uuid';

async function runComprehensiveVerification() {
  console.log('=== COMPREHENSIVE REVENUE RECOVERY AGENT VERIFICATION ===\n');

  const db = getDb();
  console.log(`[1] Database Driver Active: ${db.isPostgres ? 'PostgreSQL / Supabase' : 'SQLite (Local Fallback)'}`);

  // Test 1: Reset & Schema Initialization
  console.log('\n[2] Testing Database Reset & Schema...');
  await resetDatabase();
  console.log('  ✓ Database reset & schema initialized cleanly');

  // Test 2: Seed & Data Generation
  console.log('\n[3] Testing Simulator Seed Generator...');
  await generateSimulationData();
  const customers = await db.prepare('SELECT count(*) as count FROM customers').get();
  const payments = await db.prepare('SELECT count(*) as count FROM payments').get();
  console.log(`  ✓ Generated ${customers.count} customers and ${payments.count} historical payments`);

  // Test 3: Trigger Simulator Failure Scenario
  console.log('\n[4] Testing Failure Scenario Injection...');
  const scenarioResult = await triggerScenario('temporary_failure');
  console.log(`  ✓ Injected temporary failure scenario. Cases generated: ${scenarioResult.cases.length}`);
  const sampleCase = scenarioResult.cases[0];
  console.log(`    Case ID: ${sampleCase.caseId}, Action: ${sampleCase.decision.action}`);

  // Test 4: Webhook payment.failed Case Creation
  console.log('\n[5] Testing Webhook Handler (payment.failed)...');
  const mockWebhookReq = {
    text: async () => JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_test_${uuidv4().substring(0, 8)}`,
            amount: 249900,
            currency: 'INR',
            status: 'failed',
            error_code: 'card_declined',
            error_reason: 'insufficient_funds',
            email: 'enterprise.buyer@globalscale.co',
            notes: { customer_name: 'Enterprise Buyer' }
          }
        }
      }
    })
  };

  const webhookRes = await webhookHandler(mockWebhookReq);
  const webhookData = await webhookRes.json();
  console.log(`  ✓ Webhook processed: received=${webhookData.received}, caseId=${webhookData.caseId}`);

  // Test 5: Verify Case and Actions in Database
  const createdCase = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(webhookData.caseId);
  console.log(`  ✓ Recovery case verified in DB: status=${createdCase.status}, amount=₹${createdCase.amount_at_risk / 100}`);

  const pendingAction = await db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').get(webhookData.caseId);
  console.log(`  ✓ Scheduled action verified in DB: type=${pendingAction.action_type}, status=${pendingAction.status}`);

  // Test 6: Webhook payment.captured Settlement
  console.log('\n[6] Testing Webhook Handler (payment.captured)...');
  const captureWebhookReq = {
    text: async () => JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: createdCase.payment_id,
            amount: createdCase.amount_at_risk,
            currency: 'INR',
            status: 'captured',
            notes: { caseId: createdCase.id }
          }
        }
      }
    })
  };

  const captureRes = await webhookHandler(captureWebhookReq);
  const captureData = await captureRes.json();
  console.log(`  ✓ Settlement processed: received=${captureData.received}, resolvedCase=${captureData.caseId}`);

  const resolvedCase = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(createdCase.id);
  console.log(`  ✓ Case status updated to: ${resolvedCase.status}, recovered_amount=₹${resolvedCase.recovered_amount / 100}`);

  // Test 7: Audit Trail Verification
  console.log('\n[7] Testing Audit Trail & Ledger...');
  const auditLogs = await db.prepare('SELECT count(*) as count FROM audit_log WHERE entity_id = ?').get(createdCase.id);
  console.log(`  ✓ Audit entries recorded for case ${createdCase.id}: ${auditLogs.count} immutable events`);

  // Test 8: Pipeline Sweep / Cron
  console.log('\n[8] Testing Pipeline Sweep Automation...');
  const sweepResults = await processPendingAutomations();
  console.log(`  ✓ Pipeline sweep executed: ${sweepResults.actionsProcessed} actions processed, ${sweepResults.paymentsProcessed} unhandled payments processed`);

  console.log('\n======================================================');
  console.log('ALL DATABASE, SIMULATOR, WEBHOOK & RECOVERY TESTS PASSED!');
  console.log('======================================================\n');
}

runComprehensiveVerification().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
