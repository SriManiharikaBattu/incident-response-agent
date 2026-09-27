const axios = require('axios');
const memory = require('./memory');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

/**
 * Format ordinal number (e.g. 1st, 2nd, 3rd, 4th, 5th)
 */
function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Call Groq Chat Completion API with retry logic (max 2 retries)
 */
async function callGroqAPI(messages, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!GROQ_API_KEY || GROQ_API_KEY.includes('your_groq_api_key')) {
        throw new Error('GROQ_API_KEY is not configured or is placeholder');
      }

      console.log(`[Groq API] Sending request to ${MODEL} (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      
      const response = await axios.post(
        GROQ_ENDPOINT,
        {
          model: MODEL,
          messages: messages,
          temperature: 0.2
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
          },
          timeout: 20000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data || error.message;
      console.error(`[Groq API Error] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${errMsg}`);

      if (attempt < maxRetries && !errMsg.includes('not configured')) {
        const delay = 1000 * (attempt + 1);
        console.log(`[Groq API Retry] Waiting ${delay}ms before retry...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        if (attempt === maxRetries) {
          console.warn('[Groq API Fallback] Max retries reached. Switching to rule-assisted heuristic analysis.');
        }
        return null;
      }
    }
  }
}

/**
 * Detect root cause patterns in recalled past incidents
 */
function detectRootCausePattern(recalledIncidents) {
  const causeCounts = {};
  
  for (const inc of recalledIncidents) {
    const cause = inc.rootCause || inc.metadata?.rootCause || inc.data?.rootCause;
    if (cause) {
      causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    }
  }

  let patternFlag = null;
  for (const [cause, count] of Object.entries(causeCounts)) {
    if (count >= 2) {
      const nth = count + 1; // Nth occurrence including current incident
      patternFlag = {
        rootCause: cause,
        matchedCount: count,
        nthOccurrence: nth,
        flagMessage: `This looks like the ${getOrdinal(nth)} occurrence of ${cause}.`
      };
      break;
    }
  }

  return patternFlag;
}

/**
 * Process and analyze a new incoming production incident
 * @param {Object} incidentPayload - { serviceAffected, errorLog, severity, incidentId? }
 */
async function processIncident(incidentPayload) {
  const { serviceAffected, errorLog, severity, incidentId } = incidentPayload;

  console.log(`\n==================================================`);
  console.log(`[Agent] Processing Incident for service: '${serviceAffected}' (Severity: ${severity})`);
  console.log(`==================================================`);

  // Step 1: Recall similar past incidents from Hindsight memory
  const recalledIncidents = await memory.recallSimilar(errorLog, serviceAffected);
  console.log(`[Agent] Recalled ${recalledIncidents.length} matching past incidents.`);

  // Step 2: Check for root cause patterns across recalled incidents (2+ matches)
  const pattern = detectRootCausePattern(recalledIncidents);
  let patternNotice = '';
  if (pattern) {
    patternNotice = pattern.flagMessage;
    console.log(`[Agent Pattern Detected] ⚠️ ${patternNotice}`);
  }

  // Step 3: Construct prompt and call Groq API
  const systemMessage = {
    role: 'system',
    content: `You are an expert Incident Response AI Agent for a SaaS platform. Analyze incoming software incidents using historical incidents context.
Provide your response in clear Markdown with:
1. Incident Summary & Root Cause Pattern Identification
2. Recommended Resolution Steps (actionable bullet points)
3. Estimated Resolution Time (in minutes)`
  };

  const userMessage = {
    role: 'user',
    content: `NEW INCIDENT REPORT:
- Service Affected: ${serviceAffected}
- Severity: ${severity}
- Error Log:
${errorLog}

RECALLED PAST INCIDENTS (${recalledIncidents.length} matched):
${recalledIncidents.map((inc, i) => `
Match ${i + 1}:
- Service: ${inc.serviceAffected}
- Root Cause: ${inc.rootCause}
- Resolution Steps: ${Array.isArray(inc.resolutionSteps) ? inc.resolutionSteps.join('; ') : inc.resolutionSteps}
- Time to Resolve: ${inc.timeToResolveMinutes} mins
- Error Log snippet: ${inc.errorLog}
`).join('\n')}

${patternNotice ? `CRITICAL PATTERN NOTE: ${patternNotice}` : ''}`
  };

  let aiAnalysis = await callGroqAPI([systemMessage, userMessage]);

  // Fallback heuristic generator if LLM is unavailable
  if (!aiAnalysis) {
    const avgTime = recalledIncidents.length > 0 
      ? Math.round(recalledIncidents.reduce((sum, inc) => sum + (inc.timeToResolveMinutes || 30), 0) / recalledIncidents.length) 
      : 40;

    const suggestedSteps = recalledIncidents.length > 0 && recalledIncidents[0].resolutionSteps
      ? (Array.isArray(recalledIncidents[0].resolutionSteps) ? recalledIncidents[0].resolutionSteps : [recalledIncidents[0].resolutionSteps])
      : ['Isolate affected component', 'Check service metrics and database connections', 'Notify on-call engineering team'];

    aiAnalysis = [
      `### Incident Assessment & Pattern Recognition`,
      patternNotice ? `**Warning:** ${patternNotice}` : `Matches symptoms observed in past incidents for ${serviceAffected}.`,
      `**Probable Root Cause:** ${pattern ? pattern.rootCause : (recalledIncidents[0]?.rootCause || 'Service Resource Constraint')}`,
      ``,
      `### Recommended Resolution Steps`,
      ...suggestedSteps.map((step, idx) => `${idx + 1}. ${step}`),
      ``,
      `### Estimated Resolution Time`,
      `Estimated **${avgTime} minutes** based on ${recalledIncidents.length} past incident references.`
    ].join('\n');
  }

  // Prepend explicit pattern flag if 2+ past incidents share the same root cause
  let finalResponseText = aiAnalysis;
  if (patternNotice && !finalResponseText.includes(patternNotice)) {
    finalResponseText = `⚠️ **PATTERN RECOGNITION FLAG:** ${patternNotice}\n\n` + finalResponseText;
  }

  // Step 4: Retain this new incident into Hindsight Memory
  const newIncidentEntry = {
    incidentId: incidentId || `INC-${Date.now()}`,
    date: new Date().toISOString(),
    serviceAffected: serviceAffected,
    severity: severity,
    errorLog: errorLog,
    rootCause: pattern ? pattern.rootCause : (recalledIncidents[0]?.rootCause || 'Under Investigation'),
    resolutionSteps: recalledIncidents[0]?.resolutionSteps || ['Investigated and resolved'],
    resolvedBy: 'Incident-Response-Agent',
    timeToResolveMinutes: recalledIncidents[0]?.timeToResolveMinutes || 35
  };

  console.log(`[Agent] Storing processed incident ${newIncidentEntry.incidentId} back into Hindsight memory...`);
  await memory.retainIncident(newIncidentEntry);

  return {
    incidentId: newIncidentEntry.incidentId,
    serviceAffected,
    severity,
    patternDetected: !!pattern,
    patternNotice: patternNotice || null,
    analysis: finalResponseText,
    recalledIncidentsCount: recalledIncidents.length,
    recalledIncidents: recalledIncidents
  };
}

module.exports = {
  processIncident,
  detectRootCausePattern,
  callGroqAPI
};
