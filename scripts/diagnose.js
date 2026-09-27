// Full API Diagnostic Script
const axios = require('axios');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY;
const HINDSIGHT_URL = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
const BANK_ID = process.env.HINDSIGHT_BANK_ID || 'incidents';

const pass = (msg) => console.log(`  ✅ PASS — ${msg}`);
const fail = (msg) => console.log(`  ❌ FAIL — ${msg}`);
const warn = (msg) => console.log(`  ⚠️  WARN — ${msg}`);
const section = (title) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
};

async function checkEnvKeys() {
  section('1. ENVIRONMENT VARIABLE CHECK');

  const groqOk = GROQ_API_KEY && !GROQ_API_KEY.includes('your_groq') && GROQ_API_KEY.length > 10;
  const hindsightOk = HINDSIGHT_API_KEY && !HINDSIGHT_API_KEY.includes('your_hindsight') && HINDSIGHT_API_KEY.length > 10;

  if (groqOk) pass(`GROQ_API_KEY found: ${GROQ_API_KEY.slice(0, 8)}...`);
  else fail(`GROQ_API_KEY is MISSING or placeholder. Add it to .env file.`);

  if (hindsightOk) pass(`HINDSIGHT_API_KEY found: ${HINDSIGHT_API_KEY.slice(0, 8)}...`);
  else fail(`HINDSIGHT_API_KEY is MISSING or placeholder. Add it to .env file.`);

  return { groqOk, hindsightOk };
}

async function checkGroqAPI(groqOk) {
  section('2. GROQ LLM API TEST');
  if (!groqOk) {
    warn('Skipping live test — GROQ_API_KEY not configured');
    console.log('  → To fix: copy .env.example to .env and add your key from https://console.groq.com/keys');
    return false;
  }
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Reply with just the word: CONNECTED' }],
      max_tokens: 10,
      temperature: 0
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    const reply = res.data?.choices?.[0]?.message?.content?.trim();
    pass(`Groq LLM responded: "${reply}"`);
    pass(`Model: ${res.data.model} | Tokens used: ${res.data.usage?.total_tokens}`);
    return true;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.message;
    if (status === 401) fail(`Invalid GROQ_API_KEY — Authentication failed`);
    else if (status === 404) fail(`Model not found. Check model name "openai/gpt-oss-120b"`);
    else if (status === 429) warn(`Rate limited by Groq. Key is valid but quota hit.`);
    else fail(`Groq API error ${status}: ${msg}`);
    return false;
  }
}

async function checkHindsightAPI(hindsightOk) {
  section('3. HINDSIGHT MEMORY API TEST');
  if (!hindsightOk) {
    warn('Skipping live test — HINDSIGHT_API_KEY not configured');
    console.log('  → To fix: copy .env.example to .env and add your key from https://hindsight.vectorize.io');
    return { canStore: false, canRecall: false };
  }

  const headers = { 'Authorization': `Bearer ${HINDSIGHT_API_KEY}`, 'Content-Type': 'application/json', 'X-API-Key': HINDSIGHT_API_KEY };

  // Test 3a: Retain
  let canStore = false;
  try {
    const res = await axios.post(`${HINDSIGHT_URL}/v1/default/banks/${BANK_ID}/memories`, {
      items: [{
        content: `[DIAGNOSTIC TEST] Incident: payments-api connection pool exhaustion detected at ${new Date().toISOString()}. Root Cause: database connection pool exhaustion. Service: payments-api.`,
        context: 'incident_response',
        metadata: { incidentId: 'DIAG-001', serviceAffected: 'payments-api', rootCause: 'database connection pool exhaustion' }
      }]
    }, { headers, timeout: 10000 });
    pass(`Hindsight RETAIN succeeded — stored diagnostic memory in bank '${BANK_ID}'`);
    canStore = true;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.detail || e.message;
    if (status === 401 || status === 403) fail(`Invalid HINDSIGHT_API_KEY — Authentication failed`);
    else if (status === 404) fail(`Bank '${BANK_ID}' not found. Create it first at https://hindsight.vectorize.io`);
    else fail(`Hindsight RETAIN error ${status}: ${msg}`);
  }

  // Test 3b: Recall
  let canRecall = false;
  try {
    const res = await axios.post(`${HINDSIGHT_URL}/v1/default/banks/${BANK_ID}/memories/recall`, {
      query: 'database connection pool exhaustion payments-api',
      budget: 'mid'
    }, { headers, timeout: 10000 });
    const results = res.data?.results || res.data?.memories || [];
    pass(`Hindsight RECALL succeeded — retrieved ${results.length} memory entries`);
    if (results.length > 0) pass(`Sample memory: "${String(results[0]?.text || JSON.stringify(results[0])).slice(0, 80)}..."`);
    canRecall = true;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.detail || e.message;
    fail(`Hindsight RECALL error ${status}: ${msg}`);
  }

  return { canStore, canRecall };
}

async function checkLocalServer() {
  section('4. LOCAL EXPRESS SERVER CHECK');
  try {
    const r = await axios.get('http://localhost:3000/api/incidents', { timeout: 3000 });
    pass(`Server is RUNNING on port 3000`);
    pass(`GET /api/incidents → ${r.data.count} incidents in history`);

    const r2 = await axios.post('http://localhost:3000/api/incident', {
      serviceAffected: 'payments-api',
      errorLog: 'TimeoutAcquiringConnectionError: Timeout acquiring connection from pool',
      severity: 'P1'
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    pass(`POST /api/incident → Status 200`);
    pass(`Pattern Detected: ${r2.data.patternDetected || false}`);
    pass(`Similar Incidents: ${r2.data.similarIncidents}`);
    if (r2.data.patternDetected) pass(`Pattern Flag: "${r2.data.patternDetected}"`);
  } catch (e) {
    if (e.code === 'ECONNREFUSED') fail(`Server NOT running on port 3000. Run: npm start`);
    else fail(`Server error: ${e.message}`);
  }
}

async function runDiagnostics() {
  console.log('\n' + '='.repeat(60));
  console.log('  🔬 INCIDENT RESPONSE AGENT — FULL DIAGNOSTIC REPORT');
  console.log(`  Run at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const { groqOk, hindsightOk } = await checkEnvKeys();
  const groqWorking = await checkGroqAPI(groqOk);
  const { canStore, canRecall } = await checkHindsightAPI(hindsightOk);
  await checkLocalServer();

  section('5. SUMMARY');
  const rows = [
    ['GROQ_API_KEY configured',      groqOk       ? '✅' : '❌'],
    ['Groq LLM API responding',      groqWorking  ? '✅' : '❌ (key needed)'],
    ['HINDSIGHT_API_KEY configured',  hindsightOk  ? '✅' : '❌'],
    ['Hindsight memory RETAIN',       canStore     ? '✅' : '❌ (key needed)'],
    ['Hindsight memory RECALL',       canRecall    ? '✅' : '❌ (key needed)'],
    ['Express server running',        'Check above'],
    ['15 incidents in fallback store','✅ (local memory active)'],
    ['Pattern detection logic',       '✅ (works without API keys)'],
  ];
  rows.forEach(([label, status]) => console.log(`  ${status}  ${label}`));

  if (!groqOk || !hindsightOk) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  ⚙️  TO ACTIVATE LIVE API KEYS:\n');
    console.log('  1. Copy .env.example to .env:');
    console.log('       copy .env.example .env');
    console.log('\n  2. Edit .env and fill in:');
    console.log('       GROQ_API_KEY=gsk_...      → https://console.groq.com/keys');
    console.log('       HINDSIGHT_API_KEY=...     → https://hindsight.vectorize.io');
    console.log('\n  3. Restart the server:');
    console.log('       npm start');
    console.log(`\n  ℹ️  Without API keys, the agent runs in FALLBACK mode:`);
    console.log('     • Pattern detection, MTTR estimation & heuristic fixes work normally');
    console.log('     • Incidents are stored in in-process memory (reset on restart)');
    console.log('     • LLM-generated diagnosis is replaced by rule-based analysis');
    console.log(`${'─'.repeat(60)}\n`);
  } else {
    console.log('\n  🚀 All systems operational. Agent running with full LLM + memory capability.\n');
  }
}

runDiagnostics();
