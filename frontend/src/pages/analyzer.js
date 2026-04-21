/**
 * Document Analyzer Page — Upload, analyze, and view maturity reports.
 */
import { api, showToast, getLevelBadge, getScoreColor } from '../main.js';

let pollInterval = null;

export function renderAnalyzer(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Document Analyzer</h1>
      <p class="page-description">Upload your AI strategy documents — the RAG pipeline checks them against all checkpoints of the OAIMM meta-model using Gemini.</p>
    </div>

    <div class="grid-2 mb-xl">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📤 Upload Document</span>
        </div>
        <div class="dropzone" id="dropzone">
          <div class="dropzone-icon">📄</div>
          <div class="dropzone-text">Drag & drop your document here</div>
          <div class="dropzone-hint">Supports PDF, DOCX, TXT, MD (max 20 MB)</div>
          <input type="file" id="file-input" accept=".pdf,.docx,.txt,.md" style="display:none;" />
        </div>

        <div style="margin: 16px 0; text-align: center; color: var(--text-muted); font-size: 0.8rem; position: relative;">
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.1); z-index: 1;"></div>
          <span style="background: var(--bg-card); padding: 0 12px; position: relative; z-index: 2;">OR IMPORT FROM RESEARCH</span>
        </div>

        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Analyze an article found by the Research Agent</label>
          <div class="flex gap-sm">
            <select id="research-source-select" class="input" style="flex: 1;">
              <option value="">Loading sources...</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-import-source" disabled style="white-space: nowrap;">Import & Analyze</button>
          </div>
        </div>
        <div class="mt-md" id="upload-status" style="display:none;">
          <div class="flex items-center gap-md" style="margin-bottom: 12px;">
            <span id="upload-icon">📄</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.9rem;" id="upload-filename">—</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);" id="upload-meta">—</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-analyze">🔍 Analyze</button>
          </div>
        </div>
        <div id="analysis-progress" style="display: none;" class="mt-md">
          <div class="flex items-center gap-md" style="margin-bottom: 8px;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <span style="font-size: 0.85rem; color: var(--text-secondary);" id="analysis-status-text">Analyzing document…</span>
          </div>
          <div class="progress-bar" style="height: 4px;">
            <div class="progress-fill" id="analysis-progress-bar" style="width: 10%; transition: width 0.5s ease;"></div>
          </div>
        </div>
      </div>

      <div class="card" id="result-card" style="display: none;">
        <div class="card-header">
          <span class="card-title">📊 Analysis Result</span>
          <span id="result-level"></span>
        </div>
        <div class="text-center" style="margin: 24px 0;">
          <div style="font-size: 3.5rem; font-weight: 800; line-height: 1;" id="result-score">—</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Maturity Score</div>
        </div>
        <div id="result-dimensions"></div>
      </div>
    </div>

    <div class="card" id="report-card" style="display: none;">
      <div class="card-header">
        <span class="card-title">📋 Detailed Report</span>
      </div>
      <div class="grid-2 mb-lg">
        <div>
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-emerald); margin-bottom: 12px;">✅ Strengths</h3>
          <div id="report-strengths"></div>
        </div>
        <div>
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-red); margin-bottom: 12px;">⚠️ Gaps</h3>
          <div id="report-gaps"></div>
        </div>
      </div>
      <div>
        <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-blue); margin-bottom: 12px;">💡 Recommendations</h3>
        <div id="report-recommendations"></div>
      </div>
    </div>

    <div class="card mt-xl" style="background: rgba(59, 130, 246, 0.04); border: 1px solid rgba(59, 130, 246, 0.12);">
      <div style="display: flex; align-items: center; gap: 16px; padding: 4px 0;">
        <span style="font-size: 1.5rem;">🏗️</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Expand your Meta-Model</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Imported a research document? Use the Framework Builder to extract novel checkpoints and grow your knowledge base.</div>
        </div>
        <a href="#framework-builder" class="btn btn-primary btn-sm" style="white-space: nowrap;">Open Framework Builder →</a>
      </div>
    </div>

    <div class="card mt-xl">
      <div class="card-header">
        <span class="card-title">📁 Past Analyses</span>
      </div>
      <div id="analyses-list">
        <div class="loading-overlay" style="padding: 24px;">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  `;

  setupDropzone();
  loadResearchSources();
  loadAnalysesList();
}

async function loadResearchSources() {
  try {
    const select = document.getElementById('research-source-select');
    const btn = document.getElementById('btn-import-source');
    if (!select || !btn) return;

    const data = await api.get('/research/sources');
    const sources = data.sources || [];
    
    if (sources.length === 0) {
      select.innerHTML = '<option value="">No research sources available yet</option>';
      return;
    }

    const sortedSources = sources.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

    select.innerHTML = '<option value="">-- Choose a source --</option>' + sortedSources.map(s => {
      const score = Math.round((s.relevance_score || 0) * 100);
      const scoreLabel = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
      return `<option value="${s.url}" data-title="${s.title}">${scoreLabel} ${score}% — ${s.title} (${s.category})</option>`;
    }).join('');

    select.addEventListener('change', () => {
      btn.disabled = !select.value;
    });

    btn.addEventListener('click', importResearchSource);
  } catch (e) {
    const select = document.getElementById('research-source-select');
    if (select) select.innerHTML = '<option value="">Could not load sources</option>';
  }
}

async function importResearchSource() {
  const select = document.getElementById('research-source-select');
  const btn = document.getElementById('btn-import-source');
  const url = select.value;
  const option = select.options[select.selectedIndex];
  const title = option ? option.dataset.title : 'Imported Document';

  if (!url) return;

  btn.disabled = true;
  btn.textContent = 'Importing…';
  
  // Reset other upload UI if any
  document.getElementById('upload-status').style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('title', title);

    const res = await fetch('/api/analysis/import-url', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Error ${res.status}`);
    }
    const upload = await res.json();
    
    showToast(`Source imported: ${title}`, 'success');

    // Start analysis
    btn.textContent = 'Analyzing…';
    await api.post(`/analysis/${upload.id}/evaluate`, {});

    // Show progress
    document.getElementById('analysis-progress').style.display = 'block';
    pollAnalysisStatus(upload.id, btn);
  } catch (e) {
    showToast(`Import failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Import & Analyze';
  }
}


function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });
}

let currentUpload = null;

function handleFile(file) {
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large (max 20 MB)', 'error');
    return;
  }

  currentUpload = file;

  const status = document.getElementById('upload-status');
  const filename = document.getElementById('upload-filename');
  const meta = document.getElementById('upload-meta');
  const icon = document.getElementById('upload-icon');

  const icons = { '.pdf': '📕', '.docx': '📘', '.txt': '📝', '.md': '📝' };
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  status.style.display = 'block';
  icon.textContent = icons[ext] || '📄';
  filename.textContent = file.name;
  meta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${ext.toUpperCase()}`;

  document.getElementById('btn-analyze').addEventListener('click', startAnalysis);
}

async function startAnalysis() {
  if (!currentUpload) return;

  const btn = document.getElementById('btn-analyze');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  try {
    // Upload
    const upload = await api.postFile('/analysis/upload', currentUpload);
    showToast(`Document uploaded: ${upload.filename}`, 'success');

    // Start analysis
    btn.textContent = 'Analyzing…';
    await api.post(`/analysis/${upload.id}/evaluate`, {});

    // Show progress
    document.getElementById('analysis-progress').style.display = 'block';
    pollAnalysisStatus(upload.id, btn);
  } catch (e) {
    showToast(`Upload failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = '🔍 Analyze';
  }
}

function pollAnalysisStatus(analysisId, originalBtn = null) {
  let progress = 10;
  const progressBar = document.getElementById('analysis-progress-bar');
  const statusText = document.getElementById('analysis-status-text');

  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const status = await api.get(`/analysis/${analysisId}/status`);

      if (status.status === 'completed') {
        clearInterval(pollInterval);
        progressBar.style.width = '100%';
        statusText.textContent = 'Analysis complete!';
        if (originalBtn) {
           originalBtn.textContent = 'Analyze';
           originalBtn.disabled = false;
        }

        setTimeout(async () => {
          document.getElementById('analysis-progress').style.display = 'none';
          const report = await api.get(`/analysis/${analysisId}/report`);
          showAnalysisResult(report);
          loadAnalysesList();
        }, 500);
      } else if (status.status === 'failed') {
        clearInterval(pollInterval);
        statusText.textContent = 'Analysis failed.';
        showToast('Analysis failed. Check the backend logs.', 'error');
        if (originalBtn) {
           originalBtn.textContent = 'Analyze';
           originalBtn.disabled = false;
        }
      } else {
        // Simulate progress
        progress = Math.min(progress + 5, 90);
        progressBar.style.width = `${progress}%`;
      }
    } catch (e) {
      // Keep polling
      progress = Math.min(progress + 2, 85);
      progressBar.style.width = `${progress}%`;
    }
  }, 3000);
}

function showAnalysisResult(report) {
  const resultCard = document.getElementById('result-card');
  resultCard.style.display = 'block';

  document.getElementById('result-score').textContent = Math.round(report.overall_score);
  document.getElementById('result-score').style.color = getScoreColor(report.overall_score);
  document.getElementById('result-level').innerHTML = getLevelBadge(report.overall_level);

  const dimsEl = document.getElementById('result-dimensions');
  if (report.dimension_scores) {
    dimsEl.innerHTML = report.dimension_scores.map(ds => `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <span style="font-size: 1rem;">${ds.icon}</span>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="font-size: 0.78rem;">${ds.dimension_name}</span>
            <span style="font-size: 0.78rem; font-weight: 600; color: ${getScoreColor(ds.score)};">${Math.round(ds.score)}%</span>
          </div>
          <div class="progress-bar" style="height: 4px;">
            <div class="progress-fill" style="width: ${ds.score}%; background: ${getScoreColor(ds.score)};"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Detailed report
  const reportCard = document.getElementById('report-card');
  reportCard.style.display = 'block';

  document.getElementById('report-strengths').innerHTML = (report.strengths || [])
    .map(s => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${s}</div>`)
    .join('') || '<div style="font-size: 0.82rem; color: var(--text-muted);">No strengths identified</div>';

  document.getElementById('report-gaps').innerHTML = (report.gaps || [])
    .map(s => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${s}</div>`)
    .join('') || '<div style="font-size: 0.82rem; color: var(--text-muted);">No gaps identified</div>';

  document.getElementById('report-recommendations').innerHTML = (report.recommendations || [])
    .map((r, i) => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);"><span style="color: var(--accent-blue); font-weight: 600;">${i + 1}.</span> ${r}</div>`)
    .join('') || '<div style="font-size: 0.82rem; color: var(--text-muted);">No recommendations</div>';

  resultCard.scrollIntoView({ behavior: 'smooth' });
}

async function loadAnalysesList() {
  const el = document.getElementById('analyses-list');
  try {
    const analyses = await api.get('/analysis');
    if (analyses.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">No analyses yet. Upload a document to get started.</div>
        </div>
      `;
      return;
    }

    el.innerHTML = analyses.map(a => {
      const score = Math.round(a.overall_score || 0);
      const date = new Date(a.created_at).toLocaleDateString('de-DE');
      const statusColors = { pending: '#f59e0b', processing: '#3b82f6', completed: '#10b981', failed: '#ef4444' };

      return `
        <div class="analysis-item" data-id="${a.id}">
          <span class="analysis-icon">${a.file_type === '.pdf' ? '📕' : '📘'}</span>
          <div class="analysis-info">
            <div class="analysis-name">${a.document_name}</div>
            <div class="analysis-date">${date} · <span style="color: ${statusColors[a.status]};">${a.status}</span></div>
          </div>
          ${a.status === 'completed' ? `<span class="analysis-score" style="color: ${getScoreColor(score)};">${score}</span>` : ''}
        </div>
      `;
    }).join('');

    // Click to view report
    el.querySelectorAll('.analysis-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        try {
          const report = await api.get(`/analysis/${id}/report`);
          showAnalysisResult(report);
        } catch {
          showToast('Report not available yet', 'info');
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">Start the backend to view past analyses</div>
      </div>
    `;
  }
}
