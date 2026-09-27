const path = require('path');
const fs = require('fs');
const { retainIncident } = require('../src/memory');

async function loadIncidents() {
  try {
    const dataPath = path.join(__dirname, '../data/incidents.json');
    console.log(`[Load Data] Reading incidents dataset from: ${dataPath}`);

    const fileContent = fs.readFileSync(dataPath, 'utf8');
    const incidents = JSON.parse(fileContent);

    console.log(`[Load Data] Found ${incidents.length} incidents to load into Hindsight memory.\n---`);

    let loadedCount = 0;
    for (const incident of incidents) {
      loadedCount++;
      console.log(`[${loadedCount}/${incidents.length}] Loading ${incident.incidentId} (${incident.serviceAffected} | Severity: ${incident.severity})...`);
      
      await retainIncident(incident);

      console.log(`[${loadedCount}/${incidents.length}] Successfully stored ${incident.incidentId} [Root Cause: "${incident.rootCause}"]\n`);
    }

    console.log(`--------------------------------------------------`);
    console.log(`[Load Data] Finished processing. Total ${loadedCount} incidents loaded into memory.`);
  } catch (error) {
    console.error(`[Load Data Error] Failed to load incident dataset:`, error.message);
    process.exit(1);
  }
}

loadIncidents();
