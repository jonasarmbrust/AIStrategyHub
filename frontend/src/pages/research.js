/**
 * Research Agent Page — Trigger searches, browse sources, filter by dimension.
 * Enhanced with synchronous feedback, API key status check, and error messages.
 */
import { api, showToast } from '../main.js';

const DIM_LABELS = {
  strategy: { name: 'Strategy', icon: '🎯' },
  data: { name: 'Data & Infra', icon: '🗄️' },
  governance: { name: 'Governance', icon: '⚖️' },
  technology: { name: 'Tech & MLOps', icon: '⚙️' },
  talent: { name: 'Talent', icon: '👥' },
  ethics: { name: 'Ethics', icon: '🛡️' },
  processes: { name: 'Processes', icon: '🔄' },
};

export function renderResearch(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Research Agent</h1>
          <p class="page-description">Discover new AI strategy frameworks, regulations, and best practices — automatically evaluated for relevance to your maturity model.</p>
        </div>
        <button class="btn btn-primary" id="btn-search">🔬 Run Research</button>
      </div>
    </div>

    <div class="card mb-xl" id="ingest-panel">
      <div class="card-header" style="cursor: pointer;" id="ingest-toggle">
        <span class="card-title">📥 Source Ingestion — Analyze & Integrate New Sources</span>
        <span class="expand-icon" id="ingest-arrow">▼</span>
      </div>
      <div id="ingest-content" style="display: none;">
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6;">
          Feed a URL or upload a document (PDF, TXT, DOCX). Gemini extracts key arguments and maps them to the 7 maturity dimensions. You can then selectively integrate them into your model.
        </div>
        <div class="grid-2 mb-lg">
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Analyze URL</label>
            <div class="flex gap-md">
              <input class="input" id="ingest-url" placeholder="https://example.com/ai-framework.pdf" style="flex: 1;" />
              <button class="btn btn-primary btn-sm" id="btn-ingest-url">Analyze</button>
            </div>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Upload File</label>
            <div class="dropzone" id="ingest-dropzone" style="padding: 20px;">
              <div class="dropzone-icon" style="font-size: 2rem; margin-bottom: 8px;">📂</div>
              <div class="dropzone-text" style="font-size: 0.82rem;">Drag & drop or click to browse</div>
              <div class="dropzone-hint">PDF, TXT, DOCX, MD</div>
              <input type="file" id="ingest-file" accept=".pdf,.txt,.md,.docx" style="display: none;" />
            </div>
            <div id="ingest-file-info" style="display: none; margin-top: 8px; padding: 8px 12px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 8px; font-size: 0.8rem;">
              <div class="flex justify-between items-center">
                <span id="ingest-file-name" style="color: var(--text-primary); font-weight: 500;"></span>
                <button class="btn btn-primary btn-sm" id="btn-ingest-file" style="padding: 4px 14px;">🔍 Analyze</button>
              </div>
            </div>
          </div>
        </div>
        <div id="ingest-status" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;"></div>
        <div id="ingest-results"></div>
      </div>
    </div>

    <div class="card mb-lg" id="api-key-warning" style="display: none; border-left: 3px solid #f59e0b;">
      <div style="display: flex; align-items: flex-start; gap: 12px; padding: 4px;">
        <span style="font-size: 1.5rem;">⚠️</span>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">API Keys nicht konfiguriert</div>
          <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;" id="api-key-message">
            Der Research Agent benötigt API-Keys. Erstelle eine <code>.env</code> Datei im Projektroot:
            <pre style="margin-top: 8px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 0.75rem; overflow-x: auto;">TAVILY_API_KEY=dein_key_hier    # https://tavily.com (kostenlos)
GEMINI_API_KEY=dein_key_hier    # https://aistudio.google.com/apikey</pre>
            Dann Backend neu starten.
          </div>
        </div>
      </div>
    </div>

    <div class="card mb-xl" id="search-panel">
      <div class="card-header">
        <span class="card-title">🔎 Research Configuration</span>
      </div>
      <div class="mb-lg">
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Custom Search Query (optional)</label>
        <input class="input" id="search-query" placeholder="e.g., AI governance best practices 2026 enterprise" />
      </div>
      <div class="mb-lg">
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 8px;">Focus Dimensions</label>
        <div class="flex gap-md" style="flex-wrap: wrap;" id="dimension-filters">
          ${Object.entries(DIM_LABELS).map(([id, dim]) => `
            <button class="btn btn-ghost btn-sm dim-toggle" data-dim="${id}">
              ${dim.icon} ${dim.name}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="flex justify-between items-center">
        <span style="font-size: 0.75rem; color: var(--text-muted);" id="search-status">💡 Select dimensions or enter a query, then click "Run Research"</span>
        <div class="flex gap-md items-center">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="search-pdf-only" style="accent-color: var(--accent-blue);" />
            Only search for PDFs
          </label>
          <select class="input select" id="search-language" style="width: 140px;">
            <option value="both">All Languages</option>
            <option value="english" selected>English</option>
            <option value="german">Deutsch</option>
          </select>
          <select class="input select" id="max-results" style="width: 120px;">
            <option value="5">5 results</option>
            <option value="10" selected>10 results</option>
            <option value="20">20 results</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card mb-lg" id="result-summary" style="display: none;">
      <div class="card-header">
        <span class="card-title">📊 Last Search Results</span>
      </div>
      <div id="result-summary-content"></div>
    </div>

    <div class="card mb-lg">
      <div class="flex justify-between items-center" style="margin-bottom: 16px;">
        <div class="card-title">📚 Sources Feed</div>
        <div class="flex gap-md items-center">
          <span style="font-size: 0.75rem; color: var(--text-muted);" id="source-count">—</span>
          <select class="input select btn-sm" id="filter-category" style="width: 140px; padding: 6px 28px 6px 12px;">
            <option value="">All Categories</option>
            <option value="framework">Frameworks</option>
            <option value="regulation">Regulations</option>
            <option value="whitepaper">Whitepapers</option>
            <option value="article">Articles</option>
            <option value="report">Reports</option>
            <option value="tool">Tools</option>
          </select>
          <select class="input select btn-sm" id="filter-dimension" style="width: 140px; padding: 6px 28px 6px 12px;">
            <option value="">All Dimensions</option>
            ${Object.entries(DIM_LABELS).map(([id, dim]) => `<option value="${id}">${dim.icon} ${dim.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="sources-list">
        <div class="loading-overlay" style="padding: 24px;">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  `;

  setupResearchEvents();
  checkApiStatus();
  loadSources();
}

let selectedDimensions = new Set();

function setupResearchEvents() {
  // Dimension toggle buttons
  document.querySelectorAll('.dim-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const dim = btn.dataset.dim;
      if (selectedDimensions.has(dim)) {
        selectedDimensions.delete(dim);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      } else {
        selectedDimensions.add(dim);
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-primary');
      }
    });
  });

  // Run Research button
  document.getElementById('btn-search').addEventListener('click', triggerResearch);

  // Filters
  document.getElementById('filter-category').addEventListener('change', loadSources);
  document.getElementById('filter-dimension').addEventListener('change', loadSources);

  // Ingest panel toggle
  document.getElementById('ingest-toggle')?.addEventListener('click', () => {
    const content = document.getElementById('ingest-content');
    const arrow = document.getElementById('ingest-arrow');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▲';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▼';
    }
  });

  // Ingest URL
  document.getElementById('btn-ingest-url')?.addEventListener('click', ingestUrl);

  // Ingest File — Dropzone
  const ingestDropzone = document.getElementById('ingest-dropzone');
  const ingestFileInput = document.getElementById('ingest-file');

  if (ingestDropzone && ingestFileInput) {
    ingestDropzone.addEventListener('click', () => ingestFileInput.click());

    ingestDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      ingestDropzone.classList.add('dragover');
    });

    ingestDropzone.addEventListener('dragleave', () => {
      ingestDropzone.classList.remove('dragover');
    });

    ingestDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      ingestDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleIngestFile(e.dataTransfer.files[0]);
      }
    });

    ingestFileInput.addEventListener('change', () => {
      if (ingestFileInput.files.length > 0) {
        handleIngestFile(ingestFileInput.files[0]);
      }
    });
  }

  // Analyze button
  document.getElementById('btn-ingest-file')?.addEventListener('click', ingestFile);
}

async function checkApiStatus() {
  const warning = document.getElementById('api-key-warning');
  try {
    const status = await api.get('/research/status');
    if (!status.ready) {
      warning.style.display = 'block';
      const msg = [];
      if (!status.tavily_configured) msg.push('❌ TAVILY_API_KEY fehlt (wird benötigt)');
      if (!status.gemini_configured) msg.push('⚠️ GEMINI_API_KEY fehlt (optional, für KI-Bewertung)');
      document.getElementById('api-key-message').innerHTML = `
        <div style="margin-bottom: 8px;">${msg.join('<br/>')}</div>
        Erstelle eine <code>.env</code> Datei im Projektroot:
        <pre style="margin-top: 8px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 0.75rem; overflow-x: auto;">TAVILY_API_KEY=dein_key_hier    # https://tavily.com (kostenlos)
GEMINI_API_KEY=dein_key_hier    # https://aistudio.google.com/apikey</pre>
        Dann Backend neu starten (<code>python -m uvicorn main:app --reload</code>).
      `;
    }
  } catch {
    // Backend offline — loadSources will show the appropriate message
  }
}

async function triggerResearch() {
  const query = document.getElementById('search-query').value.trim();
  const maxResults = parseInt(document.getElementById('max-results').value);
  const language = document.getElementById('search-language').value;
  const pdfOnly = document.getElementById('search-pdf-only').checked;
  const btn = document.getElementById('btn-search');
  const statusEl = document.getElementById('search-status');

  btn.disabled = true;
  btn.textContent = '⏳ Searching…';
  statusEl.textContent = '🔄 Research agent is searching and evaluating sources…';

  try {
    const result = await api.post('/research/trigger', {
      query: query || null,
      dimensions: Array.from(selectedDimensions),
      max_results: maxResults,
      language: language,
      pdf_only: pdfOnly,
    });

    if (result.status === 'error') {
      showToast(result.errors?.[0] || 'Research failed', 'error');
      statusEl.textContent = `❌ ${result.errors?.[0] || 'Research failed'}`;
      showResultSummary(result);
      return;
    }

    // Success
    const msg = result.stored > 0
      ? `✅ ${result.stored} new sources stored (${result.found} found, ${result.skipped_low_relevance} skipped)`
      : `ℹ️ ${result.found} found, but no new sources to store`;

    showToast(msg, result.stored > 0 ? 'success' : 'info');
    statusEl.textContent = msg;
    showResultSummary(result);

    // Reload source list
    await loadSources();

  } catch (e) {
    showToast(`Research failed: ${e.message}`, 'error');
    statusEl.textContent = `❌ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔬 Run Research';
  }
}

function showResultSummary(result) {
  const card = document.getElementById('result-summary');
  const content = document.getElementById('result-summary-content');
  if (!card || !content) return;

  card.style.display = 'block';

  const stats = [
    { label: 'Found', value: result.found || 0, color: '#3b82f6' },
    { label: 'New', value: result.new || 0, color: '#8b5cf6' },
    { label: 'Stored', value: result.stored || 0, color: '#10b981' },
    { label: 'Low Relevance', value: result.skipped_low_relevance || 0, color: '#f59e0b' },
  ];

  const errors = (result.errors || []).map(e =>
    `<div style="font-size: 0.75rem; color: #f59e0b; padding: 4px 0;">⚠️ ${e}</div>`
  ).join('');

  content.innerHTML = `
    <div class="grid-4 mb-md">
      ${stats.map(s => `
        <div style="text-align: center; padding: 8px;">
          <div style="font-size: 1.4rem; font-weight: 700; color: ${s.color};">${s.value}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${s.label}</div>
        </div>
      `).join('')}
    </div>
    ${errors}
  `;
}

async function loadSources() {
  const category = document.getElementById('filter-category')?.value || '';
  const dimension = document.getElementById('filter-dimension')?.value || '';
  const el = document.getElementById('sources-list');
  const countEl = document.getElementById('source-count');

  try {
    let queryParams = '?limit=50';
    if (category) queryParams += `&category=${category}`;
    if (dimension) queryParams += `&dimension=${dimension}`;

    const data = await api.get(`/research/sources${queryParams}`);

    if (countEl) {
      countEl.textContent = `${data.total_count} sources · ${data.new_count} new`;
    }

    if (!data.sources || data.sources.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔬</div>
          <div class="empty-state-text">No sources yet. Run a research search to discover new AI strategy content.</div>
        </div>
      `;
      return;
    }

    el.innerHTML = data.sources.map(source => renderSourceCard(source)).join('');

    // Mark as read events
    el.querySelectorAll('.btn-mark-read').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await api.patch(`/research/sources/${id}/read`);
          btn.closest('.source-card').querySelector('.source-indicator').classList.replace('unread', 'read');
          btn.remove();
          showToast('Marked as read', 'success');
        } catch {
          showToast('Could not update', 'error');
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">Start the backend to view research sources</div>
      </div>
    `;
    if (countEl) countEl.textContent = '—';
  }
}

function renderSourceCard(source) {
  const dims = (source.relevant_dimensions || [])
    .map(d => DIM_LABELS[d] ? `<span class="source-tag-dim">${DIM_LABELS[d].icon} ${DIM_LABELS[d].name}</span>` : '')
    .join('');

  const categoryColors = {
    framework: '#3b82f6',
    regulation: '#ef4444',
    whitepaper: '#8b5cf6',
    article: '#10b981',
    report: '#f59e0b',
    tool: '#06b6d4',
  };

  const catColor = categoryColors[source.category] || '#8890b5';
  const relevance = Math.round((source.relevance_score || 0) * 100);

  return `
    <div class="source-card">
      <div class="source-indicator ${source.is_read ? 'read' : 'unread'}"></div>
      <div class="source-content">
        <div class="source-title">
          <a href="${source.url}" target="_blank" rel="noopener">${source.title}</a>
        </div>
        <div class="source-summary">${source.summary || 'No summary available'}</div>
        <div class="source-meta">
          <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 999px; background: ${catColor}20; color: ${catColor};">${source.category}</span>
          ${dims}
          <span class="source-relevance">📊 ${relevance}% relevant</span>
          ${source.discovered_at ? `<span class="source-date">${new Date(source.discovered_at).toLocaleDateString('de-DE')}</span>` : ''}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;">
        ${!source.is_read ? `<button class="btn btn-ghost btn-sm btn-mark-read" data-id="${source.id}">✓ Read</button>` : ''}
      </div>
    </div>
  `;
}

// ── Source Ingestion Functions ──────────────────────────────
let lastIngestResult = null;

async function ingestUrl() {
  const url = document.getElementById('ingest-url').value.trim();
  if (!url) return showToast('Please enter a URL', 'error');

  const statusEl = document.getElementById('ingest-status');
  const btn = document.getElementById('btn-ingest-url');
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  statusEl.textContent = '🔄 Fetching and analyzing source with Gemini...';

  try {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('title', '');

    const res = await fetch('/api/ingest/analyze-url', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Error ${res.status}`);
    }
    const result = await res.json();
    lastIngestResult = result;
    statusEl.textContent = `✅ Extracted ${result.arguments?.length || 0} arguments from "${result.source_name || url}"`;
    renderIngestResults(result);
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
    showToast(`Analysis failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze';
  }
}

let pendingIngestFile = null;

function handleIngestFile(file) {
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large (max 20 MB)', 'error');
    return;
  }
  pendingIngestFile = file;
  const info = document.getElementById('ingest-file-info');
  const nameEl = document.getElementById('ingest-file-name');
  if (info && nameEl) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    nameEl.textContent = `📄 ${file.name} (${sizeMB} MB)`;
    info.style.display = 'block';
  }
}

async function ingestFile() {
  const file = pendingIngestFile;
  if (!file) return showToast('Please select a file first', 'error');

  const statusEl = document.getElementById('ingest-status');
  const btn = document.getElementById('btn-ingest-file');
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  statusEl.textContent = `🔄 Analyzing "${file.name}" with Gemini...`;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/ingest/analyze-file', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Error ${res.status}`);
    }
    const result = await res.json();
    lastIngestResult = result;
    statusEl.textContent = `✅ Extracted ${result.arguments?.length || 0} arguments from "${result.source_name || file.name}"`;
    renderIngestResults(result);
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
    showToast(`Analysis failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analyze';
    pendingIngestFile = null;
    const info = document.getElementById('ingest-file-info');
    if (info) info.style.display = 'none';
  }
}

function renderIngestResults(result) {
  const container = document.getElementById('ingest-results');
  if (!container || !result?.arguments?.length) {
    if (container) container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No arguments extracted</div></div>';
    return;
  }

  const dimColors = {
    strategy: '#3b82f6', data: '#06b6d4', governance: '#f59e0b',
    technology: '#8b5cf6', talent: '#10b981', ethics: '#ef4444', processes: '#f97316',
  };

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div style="font-size: 0.85rem; font-weight: 600;">📋 Extracted Arguments — ${result.source_name || 'Source'}
        <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 8px;">${result.source_type || 'article'}</span>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-integrate-all">⚡ Integrate All Selected</button>
    </div>
    <div class="ingest-args-list">
      ${result.arguments.map((arg, idx) => {
        const dimColor = dimColors[arg.dimension] || '#8890b5';
        const dimLabel = DIM_LABELS[arg.dimension]?.name || arg.dimension;
        const dimIcon = DIM_LABELS[arg.dimension]?.icon || '📦';
        return `
          <div class="ingest-arg-card" data-idx="${idx}">
            <div class="flex items-center gap-md" style="margin-bottom: 6px;">
              <input type="checkbox" class="ingest-arg-check" data-idx="${idx}" checked style="accent-color: ${dimColor};" />
              <span style="font-size: 0.6rem; padding: 2px 6px; border-radius: 999px; background: ${dimColor}18; color: ${dimColor}; font-weight: 600;">${dimIcon} ${dimLabel}</span>
              <span style="font-size: 0.6rem; padding: 2px 6px; border-radius: 999px; background: rgba(255,255,255,0.05); color: var(--text-muted);">L${arg.suggested_level}</span>
              <span style="font-size: 0.6rem; color: var(--text-muted); margin-left: auto;">⭐ ${Math.round(arg.importance * 100)}%</span>
            </div>
            <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.5; margin-bottom: 4px;">${arg.text}</div>
            ${arg.text_de ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; margin-bottom: 4px;">🇩🇪 ${arg.text_de}</div>` : ''}
            ${arg.reference ? `<div style="font-size: 0.65rem; color: var(--text-muted);">📎 ${arg.reference}</div>` : ''}
            ${arg.reasoning ? `<div style="font-size: 0.68rem; color: var(--text-secondary); margin-top: 4px; padding: 4px 8px; background: rgba(255,255,255,0.02); border-radius: 6px;">💡 ${arg.reasoning}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Integrate all selected
  document.getElementById('btn-integrate-all')?.addEventListener('click', async () => {
    const checked = Array.from(document.querySelectorAll('.ingest-arg-check:checked'));
    const selectedArgs = checked.map(cb => result.arguments[parseInt(cb.dataset.idx)]);

    if (selectedArgs.length === 0) return showToast('No arguments selected', 'error');

    const btn = document.getElementById('btn-integrate-all');
    btn.disabled = true;
    btn.textContent = '⏳ Integrating...';

    try {
      const res = await fetch('/api/ingest/integrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_name: result.source_name || 'External Source',
          source_url: result.source_url || '',
          arguments: selectedArgs,
        }),
      });
      const data = await res.json();
      const cpIds = (data.affected_checkpoints || []).map(cp => cp.id).join(', ');
      showToast(`✅ ${data.integrated} arguments integrated → ${cpIds || 'model'}`, 'success');
      
      // Show detailed feedback
      const statusEl = document.getElementById('ingest-status');
      const cpList = (data.affected_checkpoints || []).map(cp => 
        `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 999px; background: rgba(16,185,129,0.1); color: #10b981; margin-right: 4px;">${cp.id}</span>`
      ).join('');
      statusEl.innerHTML = `✅ ${data.integrated} of ${data.total_requested} integrated into: ${cpList} <a href="#explorer" style="color: var(--accent-blue); font-size: 0.75rem; margin-left: 8px;">View in Explorer →</a>`;
      
      // Disable integrated checkboxes
      checked.forEach(cb => {
        cb.disabled = true;
        cb.closest('.ingest-arg-card').style.opacity = '0.5';
      });
    } catch (e) {
      showToast(`Integration failed: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Integrate All Selected';
    }
  });
}
