document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('incidentForm');
  const btnSample = document.getElementById('btnSampleError');
  const btnSubmit = document.getElementById('btnSubmit');

  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const resultsContainer = document.getElementById('resultsContainer');

  const patternBanner = document.getElementById('patternBanner');
  const patternText = document.getElementById('patternText');

  const metricRecalled = document.getElementById('metricRecalled');
  const metricPattern = document.getElementById('metricPattern');
  const metricTimeSaved = document.getElementById('metricTimeSaved');

  const diagnosisContent = document.getElementById('diagnosisContent');
  const suggestedFixContent = document.getElementById('suggestedFixContent');
  const recalledIncidentsList = document.getElementById('recalledIncidentsList');
  const recallBadge = document.getElementById('recallBadge');

  const historyTableBody = document.getElementById('historyTableBody');
  const historyCountBadge = document.getElementById('historyCountBadge');

  // Severity selector toggle
  const severityBtns = document.querySelectorAll('.severity-btn');
  severityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      severityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sample error loader button
  btnSample.addEventListener('click', () => {
    document.getElementById('serviceAffected').value = 'checkout-service';
    document.getElementById('errorLog').value = 
`Error: TimeoutAcquiringConnectionError: Timeout acquiring connection from pool. Pool size: 20, active: 20, waiting: 142.
    at Pool.acquire (node_modules/knex/lib/execution/internal/pool.js:45:12)
    at Transaction.acquireConnection (node_modules/knex/lib/execution/transaction.js:89:28)
    at async CheckoutController.processPayment (src/controllers/checkout.js:112:5)
[CRITICAL] High database connection latency causing HTTP 504 gateway timeouts in checkout checkout-service`;
    
    // Select P1
    severityBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('.p1-btn').classList.add('active');
    document.querySelector('input[name="severity"][value="P1"]').checked = true;
  });

  // ... 
  const confidenceBarContainer = document.getElementById('confidenceBarContainer');
  const affectedServicesDiv = document.getElementById('affectedServices');
  const btnRunbook = document.getElementById('btnRunbook');
  const runbookModal = document.getElementById('runbookModal');
  const closeModal = document.getElementById('closeModal');
  const runbookContent = document.getElementById('runbookContent');
  const patternTitle = document.getElementById('patternTitle');
  const timelineContainer = document.getElementById('timelineContainer');
  
  const statTotal = document.getElementById('statTotal');
  const statHours = document.getElementById('statHours');
  const statCommon = document.getElementById('statCommon');

  const chatInput = document.getElementById('chatInput');
  const chatSubmit = document.getElementById('chatSubmit');
  const chatMessages = document.getElementById('chatMessages');

  let currentPatternRootCause = null;

  btnRunbook.addEventListener('click', async () => {
    if (!currentPatternRootCause) return;
    runbookModal.style.display = 'flex';
    runbookContent.innerHTML = 'Generating runbook...';
    try {
      const res = await fetch('/api/generate-runbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCause: currentPatternRootCause })
      });
      const data = await res.json();
      runbookContent.innerHTML = formatMarkdown(data.runbook);
    } catch (e) {
      runbookContent.innerHTML = 'Error generating runbook: ' + e.message;
    }
  });

  closeModal.addEventListener('click', () => {
    runbookModal.style.display = 'none';
  });

  chatSubmit.addEventListener('click', async () => {
    const question = chatInput.value.trim();
    if (!question) return;
    chatMessages.innerHTML += `<div class="chat-bubble-user"><strong>You:</strong> ${question}</div>`;
    chatInput.value = '';
    
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const data = await res.json();
      chatMessages.innerHTML += `<div class="chat-bubble-agent"><strong>Agent:</strong> ${data.answer}</div>`;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {}
  });

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data) {
        statTotal.textContent = data.totalIncidents;
        statHours.textContent = data.estimatedHoursSaved;
        statCommon.textContent = data.mostCommonRootCause || 'N/A';
      }
    } catch (e) {}
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const serviceAffected = document.getElementById('serviceAffected').value;
    const errorLog = document.getElementById('errorLog').value.trim();
    const severity = document.querySelector('input[name="severity"]:checked')?.value || 'P2';

    if (!errorLog) return;

    emptyState.style.display = 'none';
    resultsContainer.style.display = 'none';
    loadingState.style.display = 'flex';
    btnSubmit.disabled = true;
    btnSubmit.querySelector('.btn-text').textContent = 'Analyzing...';
    
    timelineContainer.innerHTML = '';
    diagnosisContent.innerHTML = 'Analyzing...';
    suggestedFixContent.innerHTML = 'Thinking...';

    // Try Streaming
    try {
      await tryStreamDiagnosis(serviceAffected, errorLog, severity);
    } catch (err) {
      console.warn('Streaming failed, falling back', err);
      // Fallback
      await fallbackPostDiagnosis(serviceAffected, errorLog, severity);
    } finally {
      loadingState.style.display = 'none';
      resultsContainer.style.display = 'block';
      btnSubmit.disabled = false;
      btnSubmit.querySelector('.btn-text').textContent = 'Analyze Incident';
      await loadHistory();
      await loadStats();
    }
  });

  async function tryStreamDiagnosis(serviceAffected, errorLog, severity) {
    return new Promise((resolve, reject) => {
      const url = `/api/incident/stream?serviceAffected=${encodeURIComponent(serviceAffected)}&errorLog=${encodeURIComponent(errorLog)}&severity=${severity}`;
      const source = new EventSource(url);
      
      let fullDiagnosis = '';
      diagnosisContent.innerHTML = '';
      
      source.onmessage = async (e) => {
        if (e.data === '[DONE]') {
          source.close();
          // After streaming completes, we need to fetch the full JSON to get patterns/recalled etc since streaming only gives text
          // Alternatively, we fallback silently to fetch the full JSON but keep streaming for UI responsiveness.
          const res = await fetch('/api/incident', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceAffected, errorLog, severity })
          });
          const data = await res.json();
          renderResults(data, serviceAffected, fullDiagnosis); // use streamed text
          resolve();
        } else {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              fullDiagnosis += parsed.content;
              diagnosisContent.innerHTML = formatMarkdown(fullDiagnosis);
            }
          } catch(err) {
            source.close();
            reject(err);
          }
        }
      };
      source.onerror = (err) => {
        source.close();
        reject(err);
      };
    });
  }

  async function fallbackPostDiagnosis(serviceAffected, errorLog, severity) {
    const res = await fetch('/api/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceAffected, errorLog, severity })
    });
    const data = await res.json();
    renderResults(data, serviceAffected, data.diagnosis);
  }

  function renderResults(data, serviceAffected, diagnosisText) {
    resultsContainer.style.display = 'block';
    const { suggestedFix, similarIncidents, patternDetected, recalledIncidentDetails, confidenceScore, affectedServices, urgentPatternMatch } = data;

    currentPatternRootCause = patternDetected ? recalledIncidentDetails[0]?.rootCause : null;

    if (patternDetected) {
      patternBanner.style.display = 'flex';
      
      if (urgentPatternMatch) {
        patternBanner.className = 'pattern-banner critical-banner';
        patternTitle.textContent = '🚨 CRITICAL — KNOWN FIX AVAILABLE';
      } else {
        patternBanner.className = 'pattern-banner';
        patternTitle.textContent = 'Pattern Detected';
      }

      patternText.textContent = typeof patternDetected === 'string' ? patternDetected : 'Recurring root cause pattern identified.';
      metricPattern.textContent = 'RECURRING RISK';
      metricPattern.className = 'metric-value text-accent';
      metricTimeSaved.textContent = '~45 mins saved';

      if (confidenceScore) {
        confidenceBarContainer.innerHTML = `<div class="confidence-bar"><div class="confidence-fill" style="width:${confidenceScore}%"></div></div><span>Confidence: ${confidenceScore}% (based on past incidents)</span>`;
      } else {
        confidenceBarContainer.innerHTML = '';
      }

      if (affectedServices && affectedServices.length > 0) {
        affectedServicesDiv.innerHTML = `This root cause has also affected: ${affectedServices.join(', ')}`;
      } else {
        affectedServicesDiv.innerHTML = '';
      }

      if (currentPatternRootCause) {
        fetchTimeline(currentPatternRootCause);
      }
    } else {
      patternBanner.style.display = 'none';
      metricPattern.textContent = 'Unique Event';
      metricPattern.className = 'metric-value';
      metricTimeSaved.textContent = 'N/A';
    }

    metricRecalled.textContent = similarIncidents || 0;
    recallBadge.style.display = 'inline-block';
    recallBadge.textContent = `${similarIncidents || 0} Memories Recalled`;
    diagnosisContent.innerHTML = formatMarkdown(diagnosisText || 'No diagnosis available.');
    suggestedFixContent.innerHTML = formatMarkdown(suggestedFix || 'No fix plan generated.');
    renderRecalledList(recalledIncidentDetails || []);
  }

  async function fetchTimeline(rootCause) {
    try {
      const res = await fetch(`/api/timeline/${encodeURIComponent(rootCause)}`);
      const data = await res.json();
      if (data.incidents && data.incidents.length > 0) {
        const dots = data.incidents.map(i => `<div class="timeline-dot" title="${new Date(i.date).toLocaleDateString()}"></div>`).join('');
        timelineContainer.innerHTML = `<div class="timeline-track"></div><div class="timeline-dots">${dots}<div class="timeline-dot timeline-today" title="TODAY"></div></div>`;
      }
    } catch(e) {}
  }

  function renderRecalledList(incidents) {
    recalledIncidentsList.innerHTML = '';
    if (!incidents || incidents.length === 0) {
      recalledIncidentsList.innerHTML = '<p class="text-dim">No historical incidents matched these exact symptoms.</p>';
      return;
    }
    incidents.forEach(inc => {
      const dateStr = inc.date ? new Date(inc.date).toLocaleDateString() : 'N/A';
      const mttr = inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} mins` : 'N/A';
      const steps = Array.isArray(inc.resolutionSteps) && inc.resolutionSteps.length > 0 ? inc.resolutionSteps.join(' → ') : 'Resolution steps not available.';
      const card = document.createElement('div');
      card.className = 'recalled-item';
      card.innerHTML = `<div class="recalled-header"><span class="recalled-title">${inc.incidentId || 'N/A'} (${inc.serviceAffected || 'Unknown'})</span><span class="recalled-time">MTTR: ${mttr} | ${dateStr}</span></div><div class="recalled-body"><strong>Root Cause:</strong> ${inc.rootCause || 'Unknown'}<br><strong>Resolution:</strong> ${steps}</div>`;
      recalledIncidentsList.appendChild(card);
    });
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return text.replace(/^### (.*$)/gim, '3. <strong>$1</strong>').replace(/^## (.*$)/gim, '2. <strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/incidents');
      if (!res.ok) return;
      const data = await res.json();
      const incidents = data.incidents || [];
      historyCountBadge.textContent = `${incidents.length} Incidents Logged`;
      if (incidents.length === 0) {
        historyTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No past incidents recorded.</td></tr>';
        return;
      }
      historyTableBody.innerHTML = incidents.map(inc => {
        const dateStr = inc.date ? new Date(inc.date).toLocaleDateString() : 'N/A';
        const sevClass = inc.severity === 'P1' ? 'sev-p1' : (inc.severity === 'P2' ? 'sev-p2' : 'sev-p3');
        return `<tr><td class="font-mono"><strong>${inc.incidentId || 'N/A'}</strong></td><td>${dateStr}</td><td class="font-mono">${inc.serviceAffected || 'N/A'}</td><td><span class="sev-tag ${sevClass}">${inc.severity || 'P3'}</span></td><td>${inc.rootCause || 'Under Investigation'}</td><td>${inc.resolvedBy || 'DevOps Team'}</td><td class="font-mono">${inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} m` : '30 m'}</td></tr>`;
      }).join('');
    } catch (err) {}
  }

  loadHistory();
  loadStats();
});
