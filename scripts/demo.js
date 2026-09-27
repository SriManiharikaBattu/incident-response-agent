const app = require('../src/server');
const { retainIncident } = require('../src/memory');
const incidentsData = require('../data/incidents.json');

// Console formatting helpers
const divider = '='.repeat(70);
const subDivider = '-'.repeat(70);

async function runDemo() {
  console.log(`\n${divider}`);
  console.log(`🎬  INCIDENT RESPONSE AGENT — DEMO SCENARIO SIMULATION`);
  console.log(`    Powered by Hindsight Biomimetic Memory`);
  console.log(`${divider}\n`);

  // Start internal Express server for demo simulation
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, async () => {
    console.log(`[Demo Setup] Express Server listening on http://localhost:${PORT}`);
    
    try {
      // Step 0: Pre-load historical memory dataset
      console.log(`[Demo Setup] Loading 15 past production incidents into Hindsight Memory...`);
      for (const inc of incidentsData) {
        await retainIncident(inc);
      }
      console.log(`[Demo Setup] Memory Graph initialized successfully.\n`);

      // --------------------------------------------------------------------
      // SCENARIO 1: Brand NEW Incident (No prior memory match)
      // --------------------------------------------------------------------
      console.log(`${divider}`);
      console.log(`📌 SCENARIO 1: Investigating a BRAND NEW Incident (Unseen Error)`);
      console.log(`${divider}`);

      const newIncidentPayload = {
        serviceAffected: 'quantum-billing-engine',
        severity: 'P3',
        errorLog: `SyntaxError: Unexpected token '?' in JSON at position 42
    at JSON.parse (<anonymous>)
    at ConfigLoader.parsePayload (src/config/loader.js:14:22)`
      };

      console.log(`[Input Incident] Service: ${newIncidentPayload.serviceAffected} | Severity: ${newIncidentPayload.severity}`);
      console.log(`[Input Error] ${newIncidentPayload.errorLog.split('\n')[0]}`);
      console.log(`\n[Agent Work] Recalling past memories & evaluating pattern match...`);

      const res1 = await fetch(`http://localhost:${PORT}/api/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIncidentPayload)
      });
      const data1 = await res1.json();

      console.log(`\n${subDivider}`);
      console.log(`📊 AGENT DIAGNOSIS OUTPUT (Scenario 1):`);
      console.log(`- Recalled Memories: ${data1.similarIncidents}`);
      console.log(`- Pattern Detected:  ${data1.patternDetected ? 'YES' : 'NONE (First occurrence)'}`);
      console.log(`\n[Agent Diagnosis]:\n${data1.diagnosis}`);
      console.log(`${subDivider}\n`);

      // Small pause before Scenario 2
      await new Promise(r => setTimeout(r, 1500));

      // --------------------------------------------------------------------
      // SCENARIO 2: Incident Matching Recurring Pattern (Connection Pool Exhaustion)
      // --------------------------------------------------------------------
      console.log(`${divider}`);
      console.log(`🚨 SCENARIO 2: Investigating Incident with RECURRING ROOT CAUSE`);
      console.log(`${divider}`);

      const recurringIncidentPayload = {
        serviceAffected: 'checkout-service',
        severity: 'P1',
        errorLog: `Error: TimeoutAcquiringConnectionError: Timeout acquiring connection from pool. Pool size: 20, active: 20, waiting: 142.
    at Pool.acquire (node_modules/knex/lib/execution/internal/pool.js:45:12)
    at Transaction.acquireConnection (node_modules/knex/lib/execution/transaction.js:89:28)
    at async CheckoutController.processPayment (src/controllers/checkout.js:112:5)`
      };

      console.log(`[Input Incident] Service: ${recurringIncidentPayload.serviceAffected} | Severity: ${recurringIncidentPayload.severity}`);
      console.log(`[Input Error] ${recurringIncidentPayload.errorLog.split('\n')[0]}`);
      console.log(`\n[Agent Work] Recalling past memories & evaluating pattern match...`);

      const res2 = await fetch(`http://localhost:${PORT}/api/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recurringIncidentPayload)
      });
      const data2 = await res2.json();

      console.log(`\n${subDivider}`);
      console.log(`🧠 AGENT PATTERN RECOGNITION OUTPUT (Scenario 2):`);
      console.log(`- Recalled Memories: ${data2.similarIncidents} past incidents matching symptoms`);
      console.log(`- PATTERN FLAG:      ${data2.patternDetected}`);
      console.log(`\n[Recommended Fix]:\n${data2.suggestedFix}`);
      console.log(`\n[Agent Detailed Diagnosis]:\n${data2.diagnosis}`);
      console.log(`${subDivider}\n`);

      console.log(`${divider}`);
      console.log(`✅ DEMO SIMULATION COMPLETE`);
      console.log(`   Hindsight Memory demonstrated pattern recognition & fast resolution reuse.`);
      console.log(`${divider}\n`);

    } catch (err) {
      console.error('[Demo Error]:', err);
    } finally {
      server.close();
      setTimeout(() => process.exit(0), 100);
    }
  });
}

runDemo();
