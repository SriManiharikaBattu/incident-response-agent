const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api', routes);

const agent = require('./agent');
const memory = require('./memory');

app.get('/api/incident/stream', async (req, res) => {
  const { serviceAffected, errorLog, severity } = req.query;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const recalledIncidents = await memory.recallSimilar(errorLog, serviceAffected);
    const pattern = agent.detectRootCausePattern(recalledIncidents);
    const patternNotice = pattern ? pattern.flagMessage : '';

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

    await agent.streamGroqDiagnosis([systemMessage, userMessage], res);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Fallback route serving index.html for single-page dashboard
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Express server if script is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Incident Response Agent Server listening on port ${PORT}`);
    console.log(`👉 API Endpoints:`);
    console.log(`   - POST http://localhost:${PORT}/api/incident`);
    console.log(`   - GET  http://localhost:${PORT}/api/incidents`);
    console.log(`==================================================`);
  });
}

module.exports = app;
