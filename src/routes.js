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
      recalledIncidentDetails
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

module.exports = router;
