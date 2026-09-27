const axios = require('axios');
require('dotenv').config();

const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY;
const HINDSIGHT_API_URL = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
const BANK_ID = process.env.HINDSIGHT_BANK_ID || 'incident-response-agent';

// Configured axios instance for Hindsight API
const hindsightClient = axios.create({
  baseURL: HINDSIGHT_API_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(HINDSIGHT_API_KEY
      ? { 'Authorization': `Bearer ${HINDSIGHT_API_KEY}`, 'X-API-Key': HINDSIGHT_API_KEY }
      : {})
  },
  timeout: 15000
});

// In-process fallback store (used when Hindsight API is unavailable)
const fallbackStore = [];

/**
 * Stores an incident into Hindsight memory, tagged by serviceAffected and rootCause.
 * @param {Object} incident
 * @returns {Promise<Object>}
 */
async function retainIncident(incident) {
  try {
    // Build a rich natural-language content string for LLM fact extraction
    const content = [
      `Incident ID: ${incident.incidentId || 'N/A'}`,
      `Date: ${incident.date || new Date().toISOString()}`,
      `Service Affected: ${incident.serviceAffected || 'Unknown'}`,
      `Severity: ${incident.severity || 'P3'}`,
      `Root Cause: ${incident.rootCause || 'Unknown'}`,
      `Error Log:\n${incident.errorLog || ''}`,
      `Resolution Steps:\n${Array.isArray(incident.resolutionSteps) ? incident.resolutionSteps.join('\n') : (incident.resolutionSteps || '')}`,
      `Resolved By: ${incident.resolvedBy || 'Unknown'}`,
      `Time to Resolve: ${incident.timeToResolveMinutes || 0} minutes`
    ].join('\n\n');

    console.log(`[Hindsight] Retaining ${incident.incidentId || 'NEW'} | Service: ${incident.serviceAffected} | Root Cause: ${incident.rootCause}`);

    // Correct Hindsight API payload: items array wrapper
    const response = await hindsightClient.post(`/v1/default/banks/${BANK_ID}/memories`, {
      items: [{
        content,
        context: 'incident_response',
        metadata: {
          incidentId: incident.incidentId,
          serviceAffected: incident.serviceAffected,
          rootCause: incident.rootCause,
          severity: incident.severity,
          date: incident.date
        }
      }]
    });

    console.log(`[Hindsight] ✅ Retained ${incident.incidentId || 'NEW'} — tokens used: ${response.data?.usage?.total_tokens || 'N/A'}`);

    // Mirror to fallback store for local recall
    fallbackStore.push({ ...incident, retainedAt: new Date().toISOString() });
    return response.data;
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[Hindsight] ❌ Retain failed for ${incident?.incidentId || 'NEW'}:`, errMsg);

    // Fallback: save locally
    const fallbackEntry = { ...incident, retainedAt: new Date().toISOString(), status: 'fallback_stored' };
    fallbackStore.push(fallbackEntry);
    console.log(`[Hindsight] ⚠️  Stored ${incident.incidentId} in local fallback store.`);
    return fallbackEntry;
  }
}

/**
 * Retrieves past incidents relevant to a new incident's symptoms.
 * @param {string} errorLog
 * @param {string} serviceAffected
 * @returns {Promise<Array>}
 */
async function recallSimilar(errorLog, serviceAffected) {
  try {
    const query = `Service: ${serviceAffected || 'any'}. Error symptoms: ${errorLog || ''}`;
    console.log(`[Hindsight] Recalling memories for service '${serviceAffected}'...`);

    // Correct endpoint: POST /memories/recall
    const response = await hindsightClient.post(`/v1/default/banks/${BANK_ID}/memories/recall`, {
      query,
      budget: 'high'
    });

    const results = response.data?.results || [];
    console.log(`[Hindsight] ✅ Recalled ${results.length} memory entries from Hindsight API.`);
    return results;
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[Hindsight] ❌ Recall failed:`, errMsg);

    // Keyword-based fallback matching against local store
    const logLower = (errorLog || '').toLowerCase();
    const logTokens = logLower
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['error', 'http', 'https', 'node', 'null', 'from', 'with'].includes(w));

    const fallbackResults = fallbackStore.filter(inc => {
      const incText = `${inc.serviceAffected} ${inc.rootCause} ${inc.errorLog}`.toLowerCase();
      const matchesService = serviceAffected && inc.serviceAffected?.toLowerCase() === serviceAffected.toLowerCase();
      const matchingTokens = logTokens.filter(token => incText.includes(token));
      return matchesService || matchingTokens.length >= 2;
    });

    console.log(`[Hindsight] ⚠️  Fallback: retrieved ${fallbackResults.length} incidents from local store.`);
    return fallbackResults;
  }
}

module.exports = { retainIncident, recallSimilar };
