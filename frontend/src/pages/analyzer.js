/**
 * Document Analyzer Page — Upload, analyze, and view maturity reports.
 */
import { api, showToast, getLevelBadge, getScoreColor } from '../main.js';
import { t, getLang } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

let pollInterval = null;

export function renderAnalyzer(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('analyzer.title')}</h1>
      <p class="page-description">${t('analyzer.desc')}</p>
    </div>

    <div class="grid-2 mb-xl">
      <div class="card">
        <div class="card-header">
          <span class="card-title">${t('analyzer.uploadTitle')}</span>
        </div>
        <div class="dropzone" id="dropzone">
          <div class="dropzone-icon">📄</div>
          <div class="dropzone-text">${t('analyzer.dropzoneText')}</div>
          <div class="dropzone-hint">${t('analyzer.dropzoneHint')}</div>
          <input type="file" id="file-input" accept=".pdf,.docx,.txt,.md" style="display:none;" />
        </div>

        <div style="margin: 16px 0; text-align: center; color: var(--text-muted); font-size: 0.8rem; position: relative;">
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.1); z-index: 1;"></div>
          <span style="background: var(--bg-card); padding: 0 12px; position: relative; z-index: 2;">${t('analyzer.orImport')}</span>
        </div>

        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('analyzer.importLabel')}</label>
          <div class="flex gap-sm">
            <select id="research-source-select" class="input" style="flex: 1;">
              <option value="">${t('analyzer.importLoading')}</option>
            </select>
            <button class="btn btn-primary btn-sm" id="btn-import-source" disabled style="white-space: nowrap;">${t('analyzer.btnImport')}</button>
          </div>
        </div>
        <div class="mt-md" id="upload-status" style="display:none;">
          <div class="flex items-center gap-md" style="margin-bottom: 12px;">
            <span id="upload-icon">📄</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.9rem;" id="upload-filename">—</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);" id="upload-meta">—</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-analyze">${t('analyzer.btnAnalyze')}</button>
          </div>
        </div>
        <div id="analysis-progress" style="display: none;" class="mt-md">
          <div class="flex items-center gap-md" style="margin-bottom: 8px;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <span style="font-size: 0.85rem; color: var(--text-secondary);" id="analysis-status-text">${t('analyzer.statusAnalyzing')}</span>
          </div>
          <div class="progress-bar" style="height: 4px;">
            <div class="progress-fill" id="analysis-progress-bar" style="width: 10%; transition: width 0.5s ease;"></div>
          </div>
        </div>
      </div>

      <div class="card" id="result-card" style="display: none;">
        <div class="card-header">
          <span class="card-title">${t('analyzer.resultTitle')}</span>
          <span id="result-level"></span>
        </div>
        <div class="text-center" style="margin: 24px 0;">
          <div style="font-size: 3.5rem; font-weight: 800; line-height: 1;" id="result-score">—</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">${t('analyzer.maturityScore')}</div>
        </div>
        <div id="result-dimensions"></div>
      </div>
    </div>

    <div class="card" id="report-card" style="display: none;">
      <div class="card-header">
        <span class="card-title">${t('analyzer.reportTitle')}</span>
      </div>
      <div class="grid-2 mb-lg">
        <div>
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-emerald); margin-bottom: 12px;">${t('analyzer.strengths')}</h3>
          <div id="report-strengths"></div>
        </div>
        <div>
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-red); margin-bottom: 12px;">${t('analyzer.gaps')}</h3>
          <div id="report-gaps"></div>
        </div>
      </div>
      <div>
        <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-blue); margin-bottom: 12px;">${t('analyzer.recommendations')}</h3>
        <div id="report-recommendations"></div>
      </div>
    </div>

    <div class="card mt-xl" style="background: rgba(59, 130, 246, 0.04); border: 1px solid rgba(59, 130, 246, 0.12);">
      <div style="display: flex; align-items: center; gap: 16px; padding: 4px 0;">
        <span style="font-size: 1.5rem;">🏗️</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${t('analyzer.expandModelTitle')}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${t('analyzer.expandModelDesc')}</div>
        </div>
        <a href="#framework-builder" class="btn btn-primary btn-sm" style="white-space: nowrap;">${t('analyzer.expandModelBtn')}</a>
      </div>
    </div>

    <div class="card mt-xl">
      <div class="card-header">
        <span class="card-title">${t('analyzer.pastAnalyses')}</span>
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
      select.innerHTML = `<option value="">${t('analyzer.noSources')}</option>`;
      return;
    }

    const sortedSources = sources.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

    select.innerHTML = `<option value="">${t('analyzer.chooseSource')}</option>` + sortedSources.map(s => {
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
    if (select) select.innerHTML = `<option value="">${t('analyzer.couldNotLoad')}</option>`;
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
  btn.textContent = t('analyzer.uploading');
  
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
    btn.textContent = t('analyzer.analyzingBtn');
    await api.post(`/analysis/${upload.id}/evaluate`, {});

    // Show progress
    document.getElementById('analysis-progress').style.display = 'block';
    pollAnalysisStatus(upload.id, btn);
  } catch (e) {
    showToast(t('analyzer.analysisError').replace('{msg}', e.message), 'error');
    btn.disabled = false;
    btn.textContent = t('analyzer.btnImport');
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
    showToast(t('analyzer.fileTooLarge'), 'error');
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
  btn.textContent = t('analyzer.uploading');

  try {
    // Upload
    const upload = await api.postFile('/analysis/upload', currentUpload);
    showToast(t('analyzer.docUploaded').replace('{name}', upload.filename), 'success');

    // Start analysis
    btn.textContent = t('analyzer.analyzingBtn');
    await api.post(`/analysis/${upload.id}/evaluate`, {});

    // Show progress
    document.getElementById('analysis-progress').style.display = 'block';
    pollAnalysisStatus(upload.id, btn);
  } catch (e) {
    showToast(t('analyzer.uploadError').replace('{msg}', e.message), 'error');
    btn.disabled = false;
    btn.textContent = t('analyzer.btnAnalyze');
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
        statusText.textContent = t('analyzer.analysisComplete').replace('{score}', ''); // score will be set later
        if (originalBtn) {
           originalBtn.textContent = t('analyzer.btnAnalyze');
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
        statusText.textContent = t('analyzer.analysisError').replace('{msg}', '');
        showToast(t('analyzer.analysisFailedLog'), 'error');
        if (originalBtn) {
           originalBtn.textContent = t('analyzer.btnAnalyze');
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
            <span style="font-size: 0.78rem;">${t('dimensions.' + ds.dimension_id)}</span>
            <span style="font-size: 0.78rem; font-weight: 600; color: ${getScoreColor(ds.score)};">${Math.round(ds.score)}%</span>
          </div>
          <div class="progress-bar" style="height: 4px;">
            <div class="progress-fill" style="width: ${ds.score}%; background: ${getScoreColor(ds.score)};"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Executive Summary
  const reportCard = document.getElementById('report-card');
  reportCard.style.display = 'block';

  // Build the executive summary section
  const execSummaryHtml = report.executive_summary
    ? `<div class="executive-summary mb-lg">
         <div class="executive-summary-label">${t('analyzer.aiExecSummary')}</div>
         ${report.executive_summary.split('\n').filter(p => p.trim()).map(p => `<p style="margin-bottom: 12px;">${sanitizeHTML(p)}</p>`).join('')}
       </div>`
    : '';

  // Strengths / Gaps / Recommendations
  document.getElementById('report-strengths').innerHTML = (report.strengths || [])
    .map(s => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${s}</div>`)
    .join('') || `<div style="font-size: 0.82rem; color: var(--text-muted);">${t('analyzer.noStrengths')}</div>`;

  document.getElementById('report-gaps').innerHTML = (report.gaps || [])
    .map(s => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">${s}</div>`)
    .join('') || `<div style="font-size: 0.82rem; color: var(--text-muted);">${t('analyzer.noGaps')}</div>`;

  document.getElementById('report-recommendations').innerHTML = (report.recommendations || [])
    .map((r, i) => `<div style="font-size: 0.82rem; color: var(--text-secondary); padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);"><span style="color: var(--accent-blue); font-weight: 600;">${i + 1}.</span> ${r}</div>`)
    .join('') || `<div style="font-size: 0.82rem; color: var(--text-muted);">${t('analyzer.noRecommendations')}</div>`;

  // Inject executive summary before strengths/gaps
  const reportContent = reportCard.querySelector('.grid-2');
  if (reportContent && report.executive_summary) {
    reportContent.insertAdjacentHTML('beforebegin', execSummaryHtml);
  }

  // Checkpoint Mapping
  if (report.evaluations && report.evaluations.length > 0) {
    renderCheckpointMap(report);
  }

  resultCard.scrollIntoView({ behavior: 'smooth' });
}


function renderCheckpointMap(report) {
  const evaluations = report.evaluations || [];
  const coveredCount = evaluations.filter(e => e.covered).length;
  const gapCount = evaluations.length - coveredCount;

  // Remove existing map if any
  const existingMap = document.getElementById('checkpoint-map-card');
  if (existingMap) existingMap.remove();

  // Group by dimension
  const byDim = {};
  for (const ev of evaluations) {
    const dimId = ev.dimension_id || 'unknown';
    if (!byDim[dimId]) {
      byDim[dimId] = { id: dimId, name: ev.dimension_name || dimId, checkpoints: [] };
    }
    byDim[dimId].checkpoints.push(ev);
  }

  // Get dimension stats from report
  const dimStats = {};
  for (const ds of (report.dimension_scores || [])) {
    dimStats[ds.dimension_id] = ds;
  }

  const mapCard = document.createElement('div');
  mapCard.id = 'checkpoint-map-card';
  mapCard.className = 'card mt-xl';
  mapCard.innerHTML = `
    <div class="card-header">
      <span class="card-title">${t('analyzer.cpMapping')}</span>
      <span style="font-size: 0.78rem; color: var(--text-muted);">${t('analyzer.cpEvaluated').replace('{count}', evaluations.length)}</span>
    </div>

    <div class="checkpoint-overview">
      <div class="overview-stat">
        <div class="overview-stat-value" style="color: var(--accent-emerald);">${coveredCount}</div>
        <div class="overview-stat-label">${t('analyzer.coveredCount')}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-value" style="color: var(--accent-red);">${gapCount}</div>
        <div class="overview-stat-label">${t('analyzer.gapsCount')}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-value" style="color: var(--accent-blue);">${evaluations.length > 0 ? Math.round(coveredCount / evaluations.length * 100) : 0}%</div>
        <div class="overview-stat-label">${t('analyzer.coveragePct')}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-value" style="color: var(--accent-purple);">${Object.keys(byDim).length}</div>
        <div class="overview-stat-label">${t('analyzer.dimsCount')}</div>
      </div>
    </div>

    <div class="filter-tabs" id="cp-filter-tabs">
      <button class="filter-tab active" data-filter="all">${t('analyzer.filterAll')} <span class="count">${evaluations.length}</span></button>
      <button class="filter-tab" data-filter="covered">${t('analyzer.filterCovered')} <span class="count">${coveredCount}</span></button>
      <button class="filter-tab" data-filter="gaps">${t('analyzer.filterGaps')} <span class="count">${gapCount}</span></button>
    </div>

    <div id="cp-dimensions-list"></div>
  `;

  document.getElementById('report-card').insertAdjacentElement('afterend', mapCard);

  // Render dimensions
  renderDimensionAccordions(byDim, dimStats, 'all');

  // Filter tab events
  mapCard.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mapCard.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderDimensionAccordions(byDim, dimStats, tab.dataset.filter);
    });
  });
}


function renderDimensionAccordions(byDim, dimStats, filter) {
  const container = document.getElementById('cp-dimensions-list');
  if (!container) return;

  const levelColors = ['', 'var(--level-1)', 'var(--level-2)', 'var(--level-3)', 'var(--level-4)', 'var(--level-5)'];
  const depthLabels = ['', t('analyzer.depthLabels.1'), t('analyzer.depthLabels.2'), t('analyzer.depthLabels.3')];

  let html = '';

  // Sort by score ascending (worst first)
  const dims = Object.values(byDim).sort((a, b) => {
    const sa = dimStats[a.id]?.score || 0;
    const sb = dimStats[b.id]?.score || 0;
    return sa - sb;
  });

  for (const dim of dims) {
    const stats = dimStats[dim.id] || {};
    const score = Math.round(stats.score || 0);
    const ringColor = getScoreColor(score);
    const icon = stats.icon || '📋';

    // Filter checkpoints
    let cps = dim.checkpoints;
    if (filter === 'covered') cps = cps.filter(c => c.covered);
    if (filter === 'gaps') cps = cps.filter(c => !c.covered);
    if (cps.length === 0) continue;

    const fulfilled = dim.checkpoints.filter(c => c.covered).length;

    html += `
      <div class="dim-accordion" data-dim="${dim.id}">
        <div class="dim-accordion-header">
          <div class="progress-ring" style="--ring-pct: ${score}%; --ring-color: ${ringColor};">
            ${score}%
          </div>
          <div class="dim-accordion-info">
            <div class="dim-accordion-name">${icon} ${t('dimensions.' + dim.id)}</div>
            <div class="dim-accordion-stats">${fulfilled}/${dim.checkpoints.length} ${t('analyzer.coveredCount').toLowerCase()} · ${t('analyzer.levelX').replace('{level}', stats.level || 1)}</div>
          </div>
          <span class="dim-accordion-chevron">▼</span>
        </div>
        <div class="dim-accordion-body">
          <div class="dim-accordion-content">
            ${cps.map(cp => {
              const conf = Math.round((cp.confidence || 0) * 100);
              const confColor = conf >= 70 ? 'var(--accent-emerald)' : conf >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)';
              const depth = cp.evidence_depth || 0;
              const depthClass = depth > 0 ? `d${depth}` : '';

              return `
                <div class="cp-card">
                  <div class="cp-status-badge ${cp.covered ? 'covered' : 'gap'}">
                    ${cp.covered ? '✅' : '❌'}
                  </div>
                  <div class="cp-body">
                    <div class="cp-header">
                      <div>
                        <span class="cp-id">${cp.checkpoint_id}</span>
                        <div class="cp-level-dots" title="Level ${cp.level}/5">
                          ${[1,2,3,4,5].map(l => `<div class="level-dot ${l <= cp.level ? 'l' + cp.level : ''}"></div>`).join('')}
                        </div>
                      </div>
                      ${cp.covered ? `
                        <div class="cp-confidence">
                          <span class="confidence-label">${t('analyzer.confidenceLabel')}</span>
                          <div class="confidence-bar">
                            <div class="confidence-fill" style="width: ${conf}%; background: ${confColor};"></div>
                          </div>
                          <span class="confidence-value" style="color: ${confColor};">${conf}%</span>
                        </div>
                      ` : ''}
                    </div>
                    <div class="cp-text">${cp.checkpoint_text}</div>
                    ${cp.evidence && cp.evidence !== 'Evaluation error' ? `
                      <div class="cp-evidence">
                        "${cp.evidence}"
                        ${depth > 0 ? `<span class="depth-badge ${depthClass}">${depthLabels[depth]}</span>` : ''}
                      </div>
                    ` : ''}
                    ${cp.recommendation && cp.recommendation !== 'Manual review required' ? `
                      <div class="cp-recommendation">
                        <strong>→</strong> ${cp.recommendation}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html || `<div style="text-align: center; color: var(--text-muted); padding: 24px;">${t('analyzer.noCheckpoints')}</div>`;

  // Accordion toggle
  container.querySelectorAll('.dim-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const acc = header.closest('.dim-accordion');
      acc.classList.toggle('open');
    });
  });

  // Auto-open first dimension
  const first = container.querySelector('.dim-accordion');
  if (first) first.classList.add('open');
}

async function loadAnalysesList() {
  const el = document.getElementById('analyses-list');
  try {
    const analyses = await api.get('/analysis');
    if (analyses.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">${t('analyzer.noAnalyses')}</div>
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
          showToast(t('analyzer.reportNotAvailable'), 'info');
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">${t('analyzer.startBackendAnalyses')}</div>
      </div>
    `;
  }
}
