document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('incidentForm');
  const btnSample = document.getElementById('btnSampleError');
  const btnSubmit = document.getElementById('btnSubmit');

  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const resultsContainer = document.getElementById('resultsContainer');

  const patternBanner = document.getElementById('patternBanner');
  const patternText = document.getElementById('patternText');
  const patternTitle = document.getElementById('patternTitle');

  const metricRecalled = document.getElementById('metricRecalled');
  const metricPattern = document.getElementById('metricPattern');
  const metricTimeSaved = document.getElementById('metricTimeSaved');

  const diagnosisContent = document.getElementById('diagnosisContent');
  const suggestedFixContent = document.getElementById('suggestedFixContent');
  const recalledIncidentsList = document.getElementById('recalledIncidentsList');
  const recallBadge = document.getElementById('recallBadge');

  const historyTableBody = document.getElementById('historyTableBody');
  const historyCountBadge = document.getElementById('historyCountBadge');

  const confidenceBarContainer = document.getElementById('confidenceBarContainer');
  const affectedServicesDiv = document.getElementById('affectedServices');
  const btnRunbook = document.getElementById('btnRunbook');
  const runbookModal = document.getElementById('runbookModal');
  const closeModal = document.getElementById('closeModal');
  const runbookContent = document.getElementById('runbookContent');
  const timelineContainer = document.getElementById('timelineContainer');
  
  const statTotal = document.getElementById('statTotal');
  const statHours = document.getElementById('statHours');
  const statCommon = document.getElementById('statCommon');

  const chatInput = document.getElementById('chatInput');
  const chatSubmit = document.getElementById('chatSubmit');
  const chatMessages = document.getElementById('chatMessages');

  let currentPatternRootCause = null;

  // Severity selector toggle
  const severityBtns = document.querySelectorAll('.severity-btn');
  severityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      severityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sample error loader button
  if (btnSample) {
    btnSample.addEventListener('click', () => {
      document.getElementById('serviceAffected').value = 'checkout-service';
      document.getElementById('errorLog').value = 
`Error: TimeoutAcquiringConnectionError: Timeout acquiring connection from pool. Pool size: 20, active: 20, waiting: 142.
    at Pool.acquire (node_modules/knex/lib/execution/internal/pool.js:45:12)
    at Transaction.acquireConnection (node_modules/knex/lib/execution/transaction.js:89:28)
    at async CheckoutController.processPayment (src/controllers/checkout.js:112:5)
[CRITICAL] High database connection latency causing HTTP 504 gateway timeouts in checkout checkout-service`;
      
      severityBtns.forEach(b => b.classList.remove('active'));
      const p1Btn = document.querySelector('.p1-btn');
      if (p1Btn) p1Btn.classList.add('active');
      const radio = document.querySelector('input[name="severity"][value="P1"]');
      if (radio) radio.checked = true;
    });
  }

  // Runbook Modal Handler
  if (btnRunbook) {
    btnRunbook.addEventListener('click', async () => {
      if (!currentPatternRootCause) return;
      if (runbookModal) runbookModal.style.display = 'flex';
      if (runbookContent) runbookContent.innerHTML = '<p>Generating runbook using Groq LLM...</p>';
      try {
        const res = await fetch('/api/generate-runbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootCause: currentPatternRootCause })
        });
        const data = await res.json();
        if (runbookContent) runbookContent.innerHTML = formatMarkdown(data.runbook);
      } catch (e) {
        if (runbookContent) runbookContent.innerHTML = `<span class="text-danger">Error generating runbook: ${e.message}</span>`;
      }
    });
  }

  if (closeModal && runbookModal) {
    closeModal.addEventListener('click', () => {
      runbookModal.style.display = 'none';
    });
  }

  // Quick Chat Handler
  if (chatSubmit && chatInput && chatMessages) {
    chatSubmit.addEventListener('click', async () => {
      const question = chatInput.value.trim();
      if (!question) return;
      chatMessages.innerHTML += `<div class="chat-bubble-user"><strong>You:</strong> ${escapeHtml(question)}</div>`;
      chatInput.value = '';
      
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question })
        });
        const data = await res.json();
        chatMessages.innerHTML += `<div class="chat-bubble-agent"><strong>Agent:</strong> ${formatMarkdown(data.answer)}</div>`;
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } catch (err) {
        chatMessages.innerHTML += `<div class="chat-bubble-agent text-danger">Error: ${err.message}</div>`;
      }
    });
  }

  // Load Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (data) {
        if (statTotal) statTotal.textContent = data.totalIncidents || 0;
        if (statHours) statHours.textContent = `${data.estimatedHoursSaved || 0} hrs`;
        if (statCommon) statCommon.textContent = data.mostCommonRootCause || 'N/A';
      }
    } catch (e) {}
  }

  // Incident Investigation Form Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const serviceAffected = document.getElementById('serviceAffected').value;
      const errorLog = document.getElementById('errorLog').value.trim();
      const severity = document.querySelector('input[name="severity"]:checked')?.value || 'P2';

      if (!errorLog) return;

      if (emptyState) emptyState.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'none';
      if (loadingState) loadingState.style.display = 'flex';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.querySelector('.btn-text').textContent = 'Analyzing...';
      }
      
      if (timelineContainer) timelineContainer.innerHTML = '';

      try {
        const res = await fetch('/api/incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceAffected, errorLog, severity })
        });

        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        const data = await res.json();

        if (loadingState) loadingState.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';

        renderResults(data, serviceAffected, data.diagnosis);
      } catch (err) {
        console.error('API submit failed:', err);
        if (loadingState) loadingState.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
        if (diagnosisContent) {
          diagnosisContent.innerHTML = `<div class="text-danger" style="color:var(--severity-p1); padding:1rem; background:rgba(239,68,68,0.1); border-radius:8px;">⚠️ <strong>Analysis Request Failed:</strong> ${escapeHtml(err.message)}</div>`;
        }
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.querySelector('.btn-text').textContent = 'Analyze Incident';
        }
        await loadHistory();
        await loadStats();
      }
    });
  }

  // Render Investigation Results
  function renderResults(data, serviceAffected, diagnosisText) {
    if (!resultsContainer) return;
    resultsContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    if (loadingState) loadingState.style.display = 'none';

    const {
      suggestedFix,
      similarIncidents,
      patternDetected,
      recalledIncidentDetails,
      confidenceScore,
      affectedServices,
      urgentPatternMatch
    } = data;

    currentPatternRootCause = patternDetected ? (recalledIncidentDetails && recalledIncidentDetails[0]?.rootCause) : null;

    if (patternDetected) {
      if (patternBanner) patternBanner.style.display = 'flex';
      
      if (urgentPatternMatch) {
        if (patternBanner) patternBanner.className = 'pattern-banner critical-banner';
        if (patternTitle) patternTitle.textContent = '🚨 CRITICAL — KNOWN FIX AVAILABLE';
      } else {
        if (patternBanner) patternBanner.className = 'pattern-banner';
        if (patternTitle) patternTitle.textContent = '🧠 Pattern Detected';
      }

      if (patternText) {
        patternText.textContent = typeof patternDetected === 'string'
          ? patternDetected
          : 'Recurring root cause pattern identified across historical memories.';
      }

      if (metricPattern) {
        metricPattern.textContent = 'RECURRING RISK';
        metricPattern.className = 'metric-value text-accent';
      }
      if (metricTimeSaved) metricTimeSaved.textContent = '~45 mins saved';

      if (confidenceBarContainer) {
        if (confidenceScore) {
          confidenceBarContainer.innerHTML = `
            <div class="confidence-bar"><div class="confidence-fill" style="width:${confidenceScore}%"></div></div>
            <span style="font-size:0.8rem; color:var(--text-muted);">Confidence Score: <strong>${confidenceScore}%</strong> (derived from ${similarIncidents || 0} historical matches)</span>
          `;
        } else {
          confidenceBarContainer.innerHTML = '';
        }
      }

      if (affectedServicesDiv) {
        if (affectedServices && affectedServices.length > 0) {
          affectedServicesDiv.innerHTML = `<strong>This root cause has also affected:</strong> ${affectedServices.join(', ')}`;
        } else {
          affectedServicesDiv.innerHTML = '';
        }
      }

      if (currentPatternRootCause) {
        fetchTimeline(currentPatternRootCause);
      }
    } else {
      if (patternBanner) patternBanner.style.display = 'none';
      if (metricPattern) {
        metricPattern.textContent = 'Unique Event';
        metricPattern.className = 'metric-value';
      }
      if (metricTimeSaved) metricTimeSaved.textContent = 'N/A';
    }

    if (metricRecalled) metricRecalled.textContent = similarIncidents || 0;
    if (recallBadge) {
      recallBadge.style.display = 'inline-block';
      recallBadge.textContent = `${similarIncidents || 0} Memories Recalled`;
    }

    if (diagnosisContent) diagnosisContent.innerHTML = formatMarkdown(diagnosisText || 'No diagnosis available.');
    if (suggestedFixContent) suggestedFixContent.innerHTML = formatMarkdown(suggestedFix || 'No fix plan generated.');

    renderRecalledList(recalledIncidentDetails || []);
  }

  // Fetch and Render Timeline
  async function fetchTimeline(rootCause) {
    if (!timelineContainer) return;
    try {
      const res = await fetch(`/api/timeline/${encodeURIComponent(rootCause)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.incidents && data.incidents.length > 0) {
        const dots = data.incidents.map(i => {
          const dStr = i.date ? new Date(i.date).toLocaleDateString() : 'Past Incident';
          return `<div class="timeline-dot" title="${dStr} - ${i.serviceAffected || ''}"></div>`;
        }).join('');
        
        timelineContainer.innerHTML = `
          <div style="margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border-color);">
            <div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:0.5rem; text-transform:uppercase;">
              Timeline of Recurrence for "${escapeHtml(rootCause)}"
            </div>
            <div class="timeline-dots">${dots}<div class="timeline-dot timeline-today" title="TODAY (Current Incident)"></div></div>
          </div>
        `;
      }
    } catch(e) {}
  }

  // Render Recalled Past Incident Cards
  function renderRecalledList(incidents) {
    if (!recalledIncidentsList) return;
    recalledIncidentsList.innerHTML = '';
    if (!incidents || incidents.length === 0) {
      recalledIncidentsList.innerHTML = '<p class="text-dim">No historical incidents matched these exact symptoms.</p>';
      return;
    }
    incidents.forEach(inc => {
      const dateStr = inc.date ? new Date(inc.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const mttr = inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} mins` : 'N/A';
      const steps = Array.isArray(inc.resolutionSteps) && inc.resolutionSteps.length > 0 ? inc.resolutionSteps.join(' → ') : 'Resolution steps not available.';
      
      const card = document.createElement('div');
      card.className = 'recalled-item';
      card.innerHTML = `
        <div class="recalled-header">
          <span class="recalled-title">${escapeHtml(inc.incidentId || 'N/A')} (${escapeHtml(inc.serviceAffected || 'Unknown')})</span>
          <span class="recalled-time">MTTR: ${mttr} | ${dateStr}</span>
        </div>
        <div class="recalled-body">
          <strong>Root Cause:</strong> ${escapeHtml(inc.rootCause || 'Unknown')}<br>
          <strong>Resolution:</strong> ${escapeHtml(steps)}
        </div>
      `;
      recalledIncidentsList.appendChild(card);
    });
  }

  // Robust Markdown Formatter
  function formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headings
      .replace(/^### (.*$)/gim, '<h3 style="font-size:1.05rem; color:var(--accent-blue); margin-top:1rem; margin-bottom:0.5rem;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="font-size:1.15rem; color:#ffffff; margin-top:1.2rem; margin-bottom:0.5rem;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="font-size:1.25rem; color:#ffffff; margin-top:1.5rem; margin-bottom:0.6rem;">$1</h1>')
      // Bold & Italic
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`([^`]+)`/g, '<code class="chat-code">$1</code>')
      // Bullet points
      .replace(/^\* (.*$)/gim, '• $1')
      .replace(/^- (.*$)/gim, '• $1')
      // Newlines
      .replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Load History Table (if present on page)
  async function loadHistory() {
    if (!historyTableBody) return;
    try {
      const res = await fetch('/api/incidents');
      if (!res.ok) return;
      const data = await res.json();
      const incidents = data.incidents || [];
      if (historyCountBadge) historyCountBadge.textContent = `${incidents.length} Incidents Logged`;
      
      if (incidents.length === 0) {
        historyTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No past incidents recorded.</td></tr>';
        return;
      }
      historyTableBody.innerHTML = incidents.map(inc => {
        const dateStr = inc.date ? new Date(inc.date).toLocaleDateString() : 'N/A';
        const sevClass = inc.severity === 'P1' ? 'sev-p1' : (inc.severity === 'P2' ? 'sev-p2' : 'sev-p3');
        return `<tr><td class="font-mono"><strong>${escapeHtml(inc.incidentId || 'N/A')}</strong></td><td>${dateStr}</td><td class="font-mono">${escapeHtml(inc.serviceAffected || 'N/A')}</td><td><span class="sev-tag ${sevClass}">${inc.severity || 'P3'}</span></td><td>${escapeHtml(inc.rootCause || 'Under Investigation')}</td><td>${escapeHtml(inc.resolvedBy || 'DevOps Team')}</td><td class="font-mono">${inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} m` : '30 m'}</td></tr>`;
      }).join('');
    } catch (err) {}
  }

  // Initialize
  loadHistory();
  loadStats();
});
