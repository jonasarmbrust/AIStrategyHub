/**
 * Research Agent Page — Trigger searches, browse sources, filter by dimension.
 * Enhanced with synchronous feedback, API key status check, and error messages.
 */
import { api, showToast } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

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
          <h1 class="page-title">${t('research.title')}</h1>
          <p class="page-description">${t('research.desc')}</p>
        </div>
        <button class="btn btn-primary" id="btn-search">${t('research.runResearch')}</button>
      </div>
    </div>

    <div class="card mb-xl" id="ingest-panel">
      <div class="card-header" style="cursor: pointer;" id="ingest-toggle">
        <span class="card-title">${t('research.ingestTitle')}</span>
        <span class="expand-icon" id="ingest-arrow">▼</span>
      </div>
      <div id="ingest-content" style="display: none;">
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6;">
          ${t('research.ingestDesc')}
        </div>
        <div class="grid-2 mb-lg">
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('research.analyzeUrl')}</label>
            <div class="flex gap-md">
              <input class="input" id="ingest-url" placeholder="https://example.com/ai-framework.pdf" style="flex: 1;" />
              <button class="btn btn-primary btn-sm" id="btn-ingest-url">${t('research.analyzeBtn')}</button>
            </div>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('research.uploadFile')}</label>
            <div class="dropzone" id="ingest-dropzone" style="padding: 20px;">
              <div class="dropzone-icon" style="font-size: 2rem; margin-bottom: 8px;">📂</div>
              <div class="dropzone-text" style="font-size: 0.82rem;">${t('research.dragDropText')}</div>
              <div class="dropzone-hint">${t('research.dragDropHint')}</div>
              <input type="file" id="ingest-file" accept=".pdf,.txt,.md,.docx" style="display: none;" />
            </div>
            <div id="ingest-file-info" style="display: none; margin-top: 8px; padding: 8px 12px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 8px; font-size: 0.8rem;">
              <div class="flex justify-between items-center">
                <span id="ingest-file-name" style="color: var(--text-primary); font-weight: 500;"></span>
                <button class="btn btn-primary btn-sm" id="btn-ingest-file" style="padding: 4px 14px;">🔍 ${t('research.analyzeBtn')}</button>
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
          <div style="font-weight: 600; margin-bottom: 4px;">${t('research.apiKeysMissing')}</div>
          <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;" id="api-key-message">
            ${t('research.apiKeysDesc')}
            <pre style="margin-top: 8px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 0.75rem; overflow-x: auto;">TAVILY_API_KEY=dein_key_hier    # https://tavily.com (kostenlos)
GEMINI_API_KEY=dein_key_hier    # https://aistudio.google.com/apikey</pre>
            ${t('research.apiKeysRestart')}
          </div>
        </div>
      </div>
    </div>

    <div class="card mb-xl" id="search-panel">
      <div class="card-header">
        <span class="card-title">${t('research.searchConfig')}</span>
      </div>
      <div class="mb-lg">
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('research.customQuery')}</label>
        <input class="input" id="search-query" placeholder="${t('research.customQueryPlaceholder')}" />
      </div>
      <div class="mb-lg">
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 8px;">${t('research.focusDims')}</label>
        <div class="flex gap-md" style="flex-wrap: wrap;" id="dimension-filters">
          ${Object.entries(DIM_LABELS).map(([id, dim]) => `
            <button class="btn btn-ghost btn-sm dim-toggle" data-dim="${id}">
              ${dim.icon} ${t('dimensions.' + id)}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="flex justify-between items-center">
        <span style="font-size: 0.75rem; color: var(--text-muted);" id="search-status">${t('research.statusHelp')}</span>
        <div class="flex gap-md items-center">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="search-pdf-only" style="accent-color: var(--accent-blue);" />
            ${t('research.pdfOnly')}
          </label>
          <select class="input select" id="search-language" style="width: 140px;">
            <option value="both">${t('research.langAll')}</option>
            <option value="english" selected>${t('research.langEn')}</option>
            <option value="german">${t('research.langDe')}</option>
          </select>
          <select class="input select" id="max-results" style="width: 120px;">
            <option value="5">${t('research.resultsCount').replace('{count}', '5')}</option>
            <option value="10" selected>${t('research.resultsCount').replace('{count}', '10')}</option>
            <option value="20">${t('research.resultsCount').replace('{count}', '20')}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card mb-lg" id="result-summary" style="display: none;">
      <div class="card-header">
        <span class="card-title">${t('research.lastResults')}</span>
      </div>
      <div id="result-summary-content"></div>
    </div>

    <div class="card mb-lg">
      <div class="flex justify-between items-center" style="margin-bottom: 16px;">
        <div class="card-title">${t('research.sourcesFeed')}</div>
        <div class="flex gap-md items-center">
          <span style="font-size: 0.75rem; color: var(--text-muted);" id="source-count">—</span>
          <select class="input select btn-sm" id="filter-category" style="width: 140px; padding: 6px 28px 6px 12px;">
            <option value="">${t('research.catAll')}</option>
            <option value="framework">${t('research.catFramework')}</option>
            <option value="regulation">${t('research.catRegulation')}</option>
            <option value="whitepaper">${t('research.catWhitepaper')}</option>
            <option value="article">${t('research.catArticle')}</option>
            <option value="report">${t('research.catReport')}</option>
            <option value="tool">${t('research.catTool')}</option>
          </select>
          <select class="input select btn-sm" id="filter-dimension" style="width: 140px; padding: 6px 28px 6px 12px;">
            <option value="">${t('research.dimAll')}</option>
            ${Object.entries(DIM_LABELS).map(([id, dim]) => `<option value="${id}">${dim.icon} ${t('dimensions.' + id)}</option>`).join('')}
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
  btn.textContent = t('research.searchingBtn');
  statusEl.textContent = t('research.searchingStatus');

  try {
    const result = await api.post('/research/trigger', {
      query: query || null,
      dimensions: Array.from(selectedDimensions),
      max_results: maxResults,
      language: language,
      pdf_only: pdfOnly,
    });

    if (result.status === 'error') {
      showToast(result.errors?.[0] || t('research.researchFailed'), 'error');
      statusEl.textContent = `❌ ${result.errors?.[0] || t('research.researchFailed')}`;
      showResultSummary(result);
      return;
    }

    // Success
    const msg = result.stored > 0
      ? t('research.sourcesStored').replace('{stored}', result.stored).replace('{found}', result.found).replace('{skipped}', result.skipped_low_relevance)
      : t('research.noNewSources').replace('{found}', result.found);

    showToast(msg, result.stored > 0 ? 'success' : 'info');
    statusEl.textContent = msg;
    showResultSummary(result);

    // Reload source list
    await loadSources();

  } catch (e) {
    showToast(`${t('research.researchFailed')}: ${e.message}`, 'error');
    statusEl.textContent = `❌ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = t('research.runResearch');
  }
}

function showResultSummary(result) {
  const card = document.getElementById('result-summary');
  const content = document.getElementById('result-summary-content');
  if (!card || !content) return;

  card.style.display = 'block';

  const stats = [
    { label: t('research.statFound'), value: result.found || 0, color: '#3b82f6' },
    { label: t('research.statNew'), value: result.new || 0, color: '#8b5cf6' },
    { label: t('research.statStored'), value: result.stored || 0, color: '#10b981' },
    { label: t('research.statSkipped'), value: result.skipped_low_relevance || 0, color: '#f59e0b' },
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
      countEl.textContent = t('research.sourceCountLabel').replace('{total}', data.total_count).replace('{new}', data.new_count);
    }

    if (!data.sources || data.sources.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔬</div>
          <div class="empty-state-text">${t('research.noSourcesYet')}</div>
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
          showToast(t('research.markedAsRead'), 'success');
        } catch {
          showToast(t('research.couldNotUpdate'), 'error');
        }
      });
    });

    // Extract for Framework events
    el.querySelectorAll('.btn-extract-fw').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const panel = document.getElementById(`fw-panel-${id}`);
        if (!panel) return;

        // Toggle panel if already open
        if (panel.style.display === 'block') {
          panel.style.display = 'none';
          return;
        }

        btn.disabled = true;
        btn.textContent = t('research.extractingBtn');
        panel.style.display = 'block';
        panel.innerHTML = `<div style="padding: 16px; text-align: center;"><div class="spinner" style="width: 20px; height: 20px; border-width: 2px; display: inline-block;"></div><span style="margin-left: 8px; font-size: 0.82rem; color: var(--text-secondary);">${t('research.extractingMsg')}</span></div>`;

        try {
          const result = await api.post(`/research/sources/${id}/extract-for-framework`);
          renderInlineProposals(panel, result, id);
        } catch (err) {
          panel.innerHTML = `<div style="padding: 12px; font-size: 0.82rem; color: #ef4444;">❌ ${err.message}</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = t('research.extractBtn');
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">${t('research.startBackendSources')}</div>
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
        <div class="source-summary">${source.summary || t('research.noSummary')}</div>
        <div class="source-meta">
          <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 999px; background: ${catColor}20; color: ${catColor};">${source.category}</span>
          ${dims}
          <span class="source-relevance">${t('research.relevantPct').replace('{pct}', relevance)}</span>
          ${source.discovered_at ? `<span class="source-date">${new Date(source.discovered_at).toLocaleDateString('de-DE')}</span>` : ''}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;">
        ${!source.is_read ? `<button class="btn btn-ghost btn-sm btn-mark-read" data-id="${source.id}">${t('research.readBtn')}</button>` : ''}
        <button class="btn btn-ghost btn-sm btn-extract-fw" data-id="${source.id}" data-title="${source.title}" title="${t('research.extractTooltip')}">${t('research.extractBtn')}</button>
      </div>
    </div>
    <div id="fw-panel-${source.id}" class="fw-extract-panel" style="display: none;"></div>
  `;
}

// ── Source Ingestion Functions ──────────────────────────────
let lastIngestResult = null;

async function ingestUrl() {
  const url = document.getElementById('ingest-url').value.trim();
  if (!url) return showToast(t('research.enterUrl'), 'error');

  const statusEl = document.getElementById('ingest-status');
  const btn = document.getElementById('btn-ingest-url');
  btn.disabled = true;
  btn.textContent = t('analyzer.analyzingBtn');
  statusEl.textContent = t('research.fetchingStatus');

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
    statusEl.textContent = t('research.extractedArgs').replace('{count}', result.arguments?.length || 0).replace('{source}', result.source_name || url);
    renderIngestResults(result);
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
    showToast(t('research.analysisFailed').replace('{msg}', e.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('research.analyzeBtn');
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
  if (!file) return showToast(t('research.selectFileFirst'), 'error');

  const statusEl = document.getElementById('ingest-status');
  const btn = document.getElementById('btn-ingest-file');
  btn.disabled = true;
  btn.textContent = t('analyzer.analyzingBtn');
  statusEl.textContent = t('research.analyzingFile').replace('{file}', file.name);

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
    statusEl.textContent = t('research.extractedArgs').replace('{count}', result.arguments?.length || 0).replace('{source}', result.source_name || file.name);
    renderIngestResults(result);
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
    showToast(t('research.analysisFailed').replace('{msg}', e.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('research.analyzeBtn');
    pendingIngestFile = null;
    const info = document.getElementById('ingest-file-info');
    if (info) info.style.display = 'none';
  }
}

function renderIngestResults(result) {
  const container = document.getElementById('ingest-results');
  if (!container || !result?.arguments?.length) {
    if (container) container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${t('research.noArgsExtracted')}</div></div>`;
    return;
  }

  const dimColors = {
    strategy: '#3b82f6', data: '#06b6d4', governance: '#f59e0b',
    technology: '#8b5cf6', talent: '#10b981', ethics: '#ef4444', processes: '#f97316',
  };

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div style="font-size: 0.85rem; font-weight: 600;">${t('research.extractedArgsTitle').replace('{source}', result.source_name || 'Source')}
        <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 8px;">${result.source_type || 'article'}</span>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-integrate-all">${t('research.integrateAllBtn')}</button>
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

    if (selectedArgs.length === 0) return showToast(t('research.noArgsSelected'), 'error');

    const btn = document.getElementById('btn-integrate-all');
    btn.disabled = true;
    btn.textContent = t('research.integratingBtn');

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
      showToast(t('research.integrationSuccess').replace('{count}', data.integrated).replace('{target}', cpIds || 'model'), 'success');
      
      // Show detailed feedback
      const statusEl = document.getElementById('ingest-status');
      const cpList = (data.affected_checkpoints || []).map(cp => 
        `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 999px; background: rgba(16,185,129,0.1); color: #10b981; margin-right: 4px;">${cp.id}</span>`
      ).join('');
      statusEl.innerHTML = `${t('research.integrationStatus').replace('{integrated}', data.integrated).replace('{total}', data.total_requested)} ${cpList} <a href="#explorer" style="color: var(--accent-blue); font-size: 0.75rem; margin-left: 8px;">${t('research.viewInExplorer')}</a>`;
      
      // Disable integrated checkboxes
      checked.forEach(cb => {
        cb.disabled = true;
        cb.closest('.ingest-arg-card').style.opacity = '0.5';
      });
    } catch (e) {
      showToast(t('research.integrationFailed').replace('{msg}', e.message), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('research.integrateAllBtn');
    }
  });
}

// ── Inline Framework Proposal Renderer (One-Click Pipeline) ──────────────

function renderInlineProposals(panel, result, sourceId) {
  const proposals = result.proposals || [];

  if (proposals.length === 0) {
    panel.innerHTML = `<div style="padding:16px;border-top:1px solid var(--border-color);background:rgba(16,185,129,0.04);"><div style="font-size:0.85rem;color:var(--accent-emerald);">${t('research.noNovelInsights')}</div></div>`;
    return;
  }

  const dimColors = {
    strategy: '#3b82f6', data: '#06b6d4', governance: '#f59e0b',
    technology: '#8b5cf6', talent: '#10b981', ethics: '#ef4444', processes: '#f97316',
  };

  let html = '<div style="padding:16px;border-top:1px solid var(--border-color);background:rgba(59,130,246,0.03);">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html += '<span style="font-size:0.85rem;font-weight:600;">&#127959; ' + t('research.novelCpProposals').replace('{count}', proposals.length).replace('🏗️ ', '') + '</span>';
  html += '<button class="btn btn-primary btn-sm" id="btn-fw-int-' + sourceId + '">' + t('research.integrateSelected').replace('{count}', proposals.length) + '</button>';
  html += '</div>';

  proposals.forEach(function(p, idx) {
    const dc = dimColors[p.dimension_id] || '#8890b5';
    const dl = DIM_LABELS[p.dimension_id] ? DIM_LABELS[p.dimension_id].name : p.dimension_id;
    const di = DIM_LABELS[p.dimension_id] ? DIM_LABELS[p.dimension_id].icon : '';
    const tags = (p.evidence_tags || []).map(function(t) {
      const shortSrc = (t.source || '').split(' ').slice(0, 3).join(' ');
      return '<span style="font-size:0.6rem;padding:1px 6px;border-radius:999px;background:rgba(59,130,246,0.08);color:var(--accent-blue);" title="' + (t.reference || '') + '">&#128218; ' + shortSrc + '</span>';
    }).join('');

    html += '<div style="padding:10px 12px;margin-bottom:8px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;">';
    html += '<div style="display:flex;align-items:flex-start;gap:8px;">';
    html += '<input type="checkbox" class="fw-prop-cb" data-idx="' + idx + '" checked style="margin-top:3px;accent-color:' + dc + ';" />';
    html += '<div style="flex:1;">';
    html += '<div style="font-size:0.82rem;color:var(--text-primary);line-height:1.4;margin-bottom:4px;">' + p.text + '</div>';
    html += '<div style="font-size:0.72rem;color:var(--text-muted);font-style:italic;margin-bottom:4px;">&#127465;&#127466; ' + p.text_de + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">';
    html += '<span style="font-size:0.6rem;padding:1px 6px;border-radius:999px;background:' + dc + '18;color:' + dc + ';font-weight:600;">' + di + ' ' + dl + '</span>';
    html += '<span style="font-size:0.6rem;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,0.05);color:var(--text-muted);">L' + p.min_level + ' &middot; ' + p.category + '</span>';
    html += tags;
    html += '</div>';
    if (p.rationale) {
      html += '<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:4px;">&#128161; ' + p.rationale + '</div>';
    }
    html += '</div></div></div>';
  });

  html += '</div>';
  panel.innerHTML = html;

  // Checkbox counter
  var updateCount = function() {
    var checked = panel.querySelectorAll('.fw-prop-cb:checked').length;
    var intBtn = document.getElementById('btn-fw-int-' + sourceId);
    if (intBtn) {
      intBtn.textContent = t('research.integrateSelected').replace('{count}', checked);
      intBtn.disabled = checked === 0;
    }
  };
  panel.querySelectorAll('.fw-prop-cb').forEach(function(cb) { cb.addEventListener('change', updateCount); });

  // Integrate handler
  var intBtn = document.getElementById('btn-fw-int-' + sourceId);
  if (intBtn) {
    intBtn.addEventListener('click', async function() {
      var checked = Array.from(panel.querySelectorAll('.fw-prop-cb:checked'));
      var selected = checked.map(function(cb) { return proposals[parseInt(cb.dataset.idx)]; });
      if (selected.length === 0) return;

      intBtn.disabled = true;
      intBtn.textContent = t('research.integrating');

      try {
        var res = await api.post('/framework/integrate', { checkpoints: selected });
        var count = res.added || 0;
        showToast(t('research.cpsIntegratedSuccess').replace('{count}', count), 'success');
        panel.innerHTML = '<div style="padding:16px;border-top:1px solid var(--border-color);background:rgba(16,185,129,0.06);"><div style="font-size:0.85rem;color:var(--accent-emerald);">' + t('research.cpsIntegratedStatus').replace('{count}', count) + ' <a href="#explorer" style="color:var(--accent-blue);margin-left:8px;">' + t('research.viewInExplorer') + '</a></div></div>';
      } catch (e) {
        showToast(t('research.integrationFailed').replace('{msg}', e.message), 'error');
        intBtn.disabled = false;
        intBtn.textContent = t('research.integrateSelected').replace('{count}', panel.querySelectorAll('.fw-prop-cb:checked').length);
      }
    });
  }
}
