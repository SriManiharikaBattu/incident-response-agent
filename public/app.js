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

  // Form submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const serviceAffected = document.getElementById('serviceAffected').value;
    const errorLog = document.getElementById('errorLog').value.trim();
    const severity = document.querySelector('input[name="severity"]:checked')?.value || 'P2';

    if (!errorLog) return;

    // Show Loading State
    emptyState.style.display = 'none';
    resultsContainer.style.display = 'none';
    loadingState.style.display = 'flex';
    btnSubmit.disabled = true;
    btnSubmit.querySelector('.btn-text').textContent = 'Analyzing...';

    try {
      const response = await fetch('/api/incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAffected, errorLog, severity })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      renderResults(data, serviceAffected);

      // Refresh incident history table
      await loadHistory();
    } catch (err) {
      console.error('Error submitting incident:', err);
      alert('Failed to analyze incident: ' + err.message);
    } finally {
      loadingState.style.display = 'none';
      btnSubmit.disabled = false;
      btnSubmit.querySelector('.btn-text').textContent = 'Analyze Incident';
    }
  });

  // Render investigation results
  function renderResults(data, serviceAffected) {
    resultsContainer.style.display = 'block';

    const { diagnosis, suggestedFix, similarIncidents, patternDetected, recalledIncidentDetails } = data;

    // 1. Pattern Recognition Banner
    if (patternDetected) {
      patternBanner.style.display = 'flex';
      const textNotice = typeof patternDetected === 'string' 
        ? patternDetected 
        : 'Recurring root cause pattern identified across multiple services.';
      patternText.textContent = textNotice;

      metricPattern.textContent = 'RECURRING RISK';
      metricPattern.className = 'metric-value text-accent';
      metricTimeSaved.textContent = '~45 mins saved';
    } else {
      patternBanner.style.display = 'none';
      metricPattern.textContent = 'Unique Event';
      metricPattern.className = 'metric-value';
      metricTimeSaved.textContent = 'N/A';
    }

    // 2. Metrics
    metricRecalled.textContent = similarIncidents || 0;
    recallBadge.style.display = 'inline-block';
    recallBadge.textContent = `${similarIncidents || 0} Memories Recalled`;

    // 3. Diagnosis & Suggested Fix Content
    diagnosisContent.innerHTML = formatMarkdown(diagnosis || 'No diagnosis available.');
    suggestedFixContent.innerHTML = formatMarkdown(suggestedFix || 'No fix plan generated.');

    // 4. Recalled Incidents List — use real data from Hindsight API
    renderRecalledList(recalledIncidentDetails || []);
  }

  // Render recalled past incident cards using real data from Hindsight API
  function renderRecalledList(incidents) {
    recalledIncidentsList.innerHTML = '';

    if (!incidents || incidents.length === 0) {
      recalledIncidentsList.innerHTML = '<p class="text-dim">No historical incidents matched these exact symptoms.</p>';
      return;
    }

    incidents.forEach(inc => {
      const dateStr = inc.date ? new Date(inc.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const mttr = inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} mins` : 'N/A';
      const steps = Array.isArray(inc.resolutionSteps) && inc.resolutionSteps.length > 0
        ? inc.resolutionSteps.join(' → ')
        : 'Resolution steps not available.';

      const card = document.createElement('div');
      card.className = 'recalled-item';
      card.innerHTML = `
        <div class="recalled-header">
          <span class="recalled-title">${inc.incidentId || 'N/A'} (${inc.serviceAffected || 'Unknown'})</span>
          <span class="recalled-time">MTTR: ${mttr} | ${dateStr}</span>
        </div>
        <div class="recalled-body">
          <strong>Root Cause:</strong> ${inc.rootCause || 'Unknown'}<br>
          <strong>Resolution:</strong> ${steps}
        </div>
      `;
      recalledIncidentsList.appendChild(card);
    });
  }

  // Helper to format basic markdown headers & bolding into HTML
  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '3. <strong>$1</strong>')
      .replace(/^## (.*$)/gim, '2. <strong>$1</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // Fetch and populate bottom incident history table
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
        return `
          <tr>
            <td class="font-mono"><strong>${inc.incidentId || 'N/A'}</strong></td>
            <td>${dateStr}</td>
            <td class="font-mono">${inc.serviceAffected || 'N/A'}</td>
            <td><span class="sev-tag ${sevClass}">${inc.severity || 'P3'}</span></td>
            <td>${inc.rootCause || 'Under Investigation'}</td>
            <td>${inc.resolvedBy || 'DevOps Team'}</td>
            <td class="font-mono">${inc.timeToResolveMinutes ? `${inc.timeToResolveMinutes} m` : '30 m'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load incident history:', err);
    }
  }

  // Load history on page init
  loadHistory();
});
