const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const agent = require('./agent');
const memory = require('./memory');

/**
 * POST /api/incident
 * Accepts { serviceAffected, errorLog, severity }
 * Processes incident using AI Agent & Hindsight Memory
 * Returns { diagnosis, suggestedFix, similarIncidents, patternDetected }
 */
router.post('/incident', async (req, res) => {
  try {
    const { serviceAffected, errorLog, severity } = req.body;

    if (!serviceAffected || !errorLog) {
      return res.status(400).json({
        error: 'Missing required parameters: serviceAffected and errorLog are required.'
      });
    }

    const result = await agent.processIncident({
      serviceAffected,
      errorLog,
      severity: severity || 'P2'
    });

    // Map recalled Hindsight memory results to structured incident details for the frontend
    const recalledIncidentDetails = (result.recalledIncidents || []).map(inc => ({
      incidentId: inc.incidentId || inc.metadata?.incidentId || 'N/A',
      serviceAffected: inc.serviceAffected || inc.metadata?.serviceAffected || 'Unknown',
      rootCause: inc.rootCause || inc.metadata?.rootCause || 'Unknown',
      date: inc.date || inc.metadata?.date || null,
      timeToResolveMinutes: inc.timeToResolveMinutes ?? null,
      resolutionSteps: inc.resolutionSteps || []
    }));

    res.json({
      incidentId: result.incidentId,
      diagnosis: result.analysis,
      suggestedFix: result.patternNotice
        ? `PATTERN ALERT: ${result.patternNotice}\n\nRecommended Fix:\n- Expand database connection pool limits\n- Patch missing release() in transaction handlers\n- Add pool metrics alert`
        : 'Review application stack trace and verify downstream dependency status.',
      similarIncidents: result.recalledIncidentsCount,
      patternDetected: result.patternDetected ? (result.patternNotice || true) : false,
      recalledIncidentDetails,
      confidenceScore: result.patternDetails?.confidenceScore,
      affectedServices: result.patternDetails?.affectedServices,
      urgentPatternMatch: result.urgentPatternMatch
    });
  } catch (error) {
    console.error('[API Error] POST /api/incident failed:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/incidents
 * Returns all stored incidents for a history view
 */
router.get('/incidents', async (req, res) => {
  try {
    const dataPath = path.join(__dirname, '../data/incidents.json');
    let incidents = [];

    if (fs.existsSync(dataPath)) {
      const fileData = fs.readFileSync(dataPath, 'utf8');
      incidents = JSON.parse(fileData);
    }

    // Merge any live retained incidents from memory
    const memoryIncidents = await memory.recallSimilar('', '');
    if (Array.isArray(memoryIncidents) && memoryIncidents.length > 0) {
      const existingIds = new Set(incidents.map(i => i.incidentId));
      for (const item of memoryIncidents) {
        if (item.incidentId && !existingIds.has(item.incidentId)) {
          incidents.unshift(item);
          existingIds.add(item.incidentId);
        }
      }
    }

    res.json({
      count: incidents.length,
      incidents: incidents
    });
  } catch (error) {
    console.error('[API Error] GET /api/incidents failed:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

router.post('/generate-runbook', async (req, res) => {
  try {
    const { rootCause } = req.body;
    if (!rootCause) return res.status(400).json({error: 'rootCause required'});
    const incidents = await memory.recallSimilar(rootCause, '');
    const runbook = await agent.generateRunbook(rootCause, incidents);
    res.json({ runbook });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

router.get('/timeline/:rootCause', async (req, res) => {
  try {
    const { rootCause } = req.params;
    const memoryIncidents = await memory.recallSimilar(rootCause, '');
    const dataPath = path.join(__dirname, '../data/incidents.json');
    let fileIncidents = [];
    if (fs.existsSync(dataPath)) {
      fileIncidents = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    const combined = [...memoryIncidents, ...fileIncidents].filter(i => 
      (i.rootCause || i.metadata?.rootCause) === rootCause
    );
    const unique = [];
    const ids = new Set();
    for (const inc of combined) {
      const id = inc.incidentId || inc.metadata?.incidentId;
      if (!ids.has(id)) {
        ids.add(id);
        unique.push({
          incidentId: id,
          date: inc.date || inc.metadata?.date,
          serviceAffected: inc.serviceAffected || inc.metadata?.serviceAffected,
          severity: inc.severity || inc.metadata?.severity,
          timeToResolveMinutes: inc.timeToResolveMinutes
        });
      }
    }
    unique.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json({ rootCause, incidents: unique });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    const recalledMemories = await memory.recallSimilar(question, '');
    const answer = await agent.answerQuery(question, recalledMemories);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

router.get('/stats', (req, res) => {
  try {
    const dataPath = path.join(__dirname, '../data/incidents.json');
    let incidents = [];
    if (fs.existsSync(dataPath)) {
      incidents = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    const totalIncidents = incidents.length;
    const rootCauses = {};
    let estimatedHoursSaved = 0;
    
    incidents.forEach(inc => {
      rootCauses[inc.rootCause] = (rootCauses[inc.rootCause] || 0) + 1;
      if (inc.timeToResolveMinutes < 45) {
        estimatedHoursSaved += 45 / 60;
      }
    });
    
    let mostCommonRootCause = '';
    let max = 0;
    for (const [cause, count] of Object.entries(rootCauses)) {
      if (count > max) { max = count; mostCommonRootCause = cause; }
    }
    
    res.json({
      totalIncidents,
      mostCommonRootCause,
      estimatedHoursSaved: estimatedHoursSaved.toFixed(1),
      patternMatchedCount: max
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
