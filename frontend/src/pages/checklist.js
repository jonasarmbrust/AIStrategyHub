/**
 * Assessment Page — Interactive maturity checklist with wizard and checklist modes.
 * Enhanced with evidence tags and auto-save to localStorage.
 */
import { api, showToast, getLevelBadge, getScoreColor, renderEvidenceTags } from '../main.js';
import { t, getLang } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

// Local state for assessments
let assessments = {};
let checklistData = null;
let evidenceData = {};
const STORAGE_KEY = 'oaimm_assessments';

// Load from localStorage
function loadSavedAssessments() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) assessments = JSON.parse(saved);
  } catch { /* ignore */ }
}

function saveAssessments() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assessments));
  } catch { /* ignore */ }
}

export function renderAssessment(container) {
  loadSavedAssessments();

  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">${t('assessment.title')}</h1>
          <p class="page-description">${t('assessment.desc')}</p>
        </div>
        <div class="flex gap-md">
          <button class="btn btn-ghost btn-sm" id="btn-reset">${t('assessment.btnReset')}</button>
          <button class="btn btn-primary" id="btn-submit">${t('assessment.btnSubmit')}</button>
        </div>
      </div>
    </div>

    <div class="card mb-xl" id="score-summary" style="display: none;">
      <div class="card-header">
        <span class="card-title">${t('assessment.resultTitle')}</span>
        <span id="result-level"></span>
      </div>
      <div class="grid-3 mt-md" id="result-grid"></div>
    </div>

    <div class="card mb-lg">
      <div class="flex justify-between items-center" style="margin-bottom: 12px;">
        <span style="font-size: 0.82rem; color: var(--text-muted);">${t('assessment.overallProgress')}</span>
        <span style="font-size: 0.82rem; font-weight: 600;" id="progress-label">0 / 0</span>
      </div>
      <div class="progress-bar" style="height: 8px;">
        <div class="progress-fill" id="overall-progress" style="width: 0%;"></div>
      </div>
    </div>

    <div id="checklist-container">
      <div class="loading-overlay">
        <div class="spinner"></div>
        <span>${t('assessment.loading')}</span>
      </div>
    </div>
  `;

  document.getElementById('btn-submit').addEventListener('click', submitAssessment);
  document.getElementById('btn-reset').addEventListener('click', resetChecklist);

  loadChecklist();
}

async function loadChecklist() {
  try {
    checklistData = await api.get('/checklist');

    // Load AI suggestions from latest Document Analyzer results
    try {
      const suggData = await api.get('/analysis/suggestions');
      if (suggData.suggestions && Object.keys(suggData.suggestions).length > 0) {
        let prefilled = 0;
        for (const [cpId, suggestion] of Object.entries(suggData.suggestions)) {
          if (!assessments[cpId]?.fulfilled) {
            assessments[cpId] = { fulfilled: true, level: suggestion.level || 3, ai_suggested: true };
            prefilled++;
          }
        }
        if (prefilled > 0) {
          saveAssessments();
          let msg = t('assessment.aiSuggested').replace('{count}', prefilled).replace('{source}', suggData.source);
          showToast(msg, 'info');
        }
      }
    } catch { /* No analyzer results available */ }

    // Load evidence data for Evidence Chain
    try {
      const evData = await api.get('/analysis/evidence');
      if (evData.evidence) {
        evidenceData = evData.evidence;
      }
    } catch { /* No evidence available */ }

    renderChecklistDimensions(checklistData);
  } catch {
    try {
      const res = await fetch('/dimensions-fallback.json');
      if (res.ok) {
        checklistData = await res.json();
        renderChecklistDimensions(checklistData);
      }
    } catch {
      document.getElementById('checklist-container').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-text">${t('nav.backendOffline')}</div>
        </div>
      `;
    }
  }
}

function renderChecklistDimensions(data) {
  const container = document.getElementById('checklist-container');
  if (!container || !data.dimensions) return;

  container.innerHTML = data.dimensions.map((dim, dimIdx) => {
    const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
    const total = dim.checkpoints.length;
    const progress = total > 0 ? (fulfilled / total * 100) : 0;

    return `
      <div class="card checklist-dimension fade-in" data-dimension="${dim.id}" style="animation-delay: ${dimIdx * 50}ms">
        <div class="dimension-header" data-toggle="${dim.id}">
          <div class="dimension-left">
            <span class="dimension-icon">${dim.icon}</span>
            <div>
              <div class="dimension-name">${t('dimensions.' + dim.id)}</div>
              <div class="dimension-meta">Weight: ${Math.round(dim.weight * 100)}% · ${dim.sources.length} sources · ${total} checkpoints</div>
            </div>
          </div>
          <div class="dimension-right">
            <div class="dimension-progress">
              <div class="progress-bar">
                <div class="progress-fill" id="prog-${dim.id}" style="width: ${progress}%;"></div>
              </div>
            </div>
            <span class="dimension-count" id="count-${dim.id}">${fulfilled}/${total}</span>
            <span class="expand-icon" id="arrow-${dim.id}">▼</span>
          </div>
        </div>
        <div class="checkpoint-list" id="list-${dim.id}">
          ${dim.checkpoints.map(cp => renderCheckpointItem(cp)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Bind toggle events
  container.querySelectorAll('.dimension-header').forEach(header => {
    header.addEventListener('click', () => {
      const dimId = header.dataset.toggle;
      const list = document.getElementById(`list-${dimId}`);
      const arrow = document.getElementById(`arrow-${dimId}`);
      list.classList.toggle('visible');
      arrow.classList.toggle('expanded');
    });
  });

  // Bind checkbox events
  container.querySelectorAll('.checkpoint-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = toggle.dataset.checkpoint;
      const isChecked = !toggle.classList.contains('checked');

      toggle.classList.toggle('checked');
      const textEl = toggle.nextElementSibling;
      if (textEl) textEl.querySelector('.checkpoint-text')?.classList.toggle('checked');

      assessments[cpId] = { fulfilled: isChecked, level: isChecked ? 3 : 0 };
      saveAssessments();
      updateProgress();
    });
  });

  // Bind evidence toggle buttons
  container.querySelectorAll('.btn-evidence').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.dataset.cpid;
      const panel = document.getElementById(`evidence-${cpId}`);
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  updateProgress();
}

function renderCheckpointItem(cp) {
  const isChecked = assessments[cp.id]?.fulfilled || false;
  const isAI = assessments[cp.id]?.ai_suggested || false;
  const tags = cp.evidence_tags || [];
  const isNew = cp.added_at && (Date.now() - new Date(cp.added_at).getTime()) < 7 * 24 * 3600 * 1000;
  const ev = evidenceData[cp.id];
  const hasEvidence = ev && (ev.evidence || ev.relevant_chunks?.length > 0);
  const confidencePct = ev ? Math.round((ev.confidence || 0) * 100) : 0;
  
  const text = getLang() === 'de' ? (cp.text_de || cp.text) : cp.text;

  return `
    <div class="checkpoint-item">
      <div class="checkpoint-toggle ${isChecked ? 'checked' : ''}" data-checkpoint="${cp.id}"></div>
      <div style="flex: 1;">
        <div class="checkpoint-text ${isChecked ? 'checked' : ''}">
          ${isNew ? '<span style="background: var(--accent-emerald); color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; margin-right: 6px; font-weight: 600;">🆕 NEW</span>' : ''}
          ${isAI ? '<span style="background: var(--accent-purple); color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; margin-right: 6px; font-weight: 600;">🤖 AI</span>' : ''}
          ${text}
        </div>
        <div class="checkpoint-sources">
          ${tags.length > 0 ? renderEvidenceTags(tags) : cp.sources.map(s => `<span class="source-tag">${s}</span>`).join('')}
          <span class="source-tag" style="background: rgba(234, 179, 8, 0.1); color: #eab308;">Level ${cp.min_level}+</span>
          ${hasEvidence ? `<button class="source-tag btn-evidence" data-cpid="${cp.id}" style="cursor: pointer; background: rgba(59,130,246,0.1); color: #3b82f6; border: none; font-family: inherit; transition: all 0.2s;">🔗 ${t('assessment.showEvidence')} (${confidencePct}%)</button>` : ''}
        </div>
        ${hasEvidence ? `<div class="evidence-panel" id="evidence-${cp.id}" style="display: none; margin-top: 8px; padding: 12px; background: rgba(59,130,246,0.04); border: 1px solid rgba(59,130,246,0.1); border-radius: 8px; font-size: 0.8rem; line-height: 1.6;">
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; ${ev.covered ? 'background: rgba(16,185,129,0.15); color: #10b981;' : 'background: rgba(239,68,68,0.15); color: #ef4444;'}">${ev.covered ? t('assessment.covered') : t('assessment.notCovered')}</span>
            <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; background: rgba(59,130,246,0.1); color: #3b82f6;">${t('assessment.confidence').replace('{pct}', confidencePct)}</span>
          </div>
          ${ev.evidence ? `<div style="color: var(--text-primary); margin-bottom: 8px;"><strong>${t('assessment.evidenceTitle')}</strong> ${ev.evidence}</div>` : ''}
          ${ev.recommendation ? `<div style="color: var(--accent-blue);"><strong>${t('assessment.recommendationTitle')}</strong> ${ev.recommendation}</div>` : ''}
          ${ev.relevant_chunks?.length > 0 ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);"><strong style="color: var(--text-muted); font-size: 0.7rem;">${t('assessment.sourceChunksTitle')}</strong>${ev.relevant_chunks.map(c => `<div style="margin-top: 4px; padding: 6px 8px; background: rgba(0,0,0,0.2); border-radius: 4px; color: var(--text-secondary); font-size: 0.75rem; font-style: italic;">${c}</div>`).join('')}</div>` : ''}
        </div>` : ''}
      </div>
    </div>
  `;
}

function updateProgress() {
  if (!checklistData) return;

  let totalFulfilled = 0;
  let totalCheckpoints = 0;

  checklistData.dimensions.forEach(dim => {
    const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
    const total = dim.checkpoints.length;
    totalFulfilled += fulfilled;
    totalCheckpoints += total;

    const progEl = document.getElementById(`prog-${dim.id}`);
    const countEl = document.getElementById(`count-${dim.id}`);
    if (progEl) progEl.style.width = `${total > 0 ? fulfilled / total * 100 : 0}%`;
    if (countEl) countEl.textContent = `${fulfilled}/${total}`;
  });

  const overallProg = document.getElementById('overall-progress');
  const progLabel = document.getElementById('progress-label');
  if (overallProg) overallProg.style.width = `${totalCheckpoints > 0 ? totalFulfilled / totalCheckpoints * 100 : 0}%`;
  if (progLabel) progLabel.textContent = `${totalFulfilled} / ${totalCheckpoints}`;
}

async function submitAssessment() {
  const fulfilled = Object.entries(assessments).filter(([, v]) => v.fulfilled);
  if (fulfilled.length === 0) {
    showToast(t('assessment.submitEmpty'), 'error');
    return;
  }

  const payload = {
    assessments: Object.entries(assessments).map(([id, data]) => ({
      checkpoint_id: id,
      fulfilled: data.fulfilled,
      level: data.level || 3,
      notes: '',
      evidence: '',
    })),
  };

  try {
    const result = await api.post('/checklist/assess', payload);
    showToast(t('assessment.submitSuccess').replace('{score}', Math.round(result.overall_score)), 'success');
    showResult(result);
  } catch (e) {
    showToast(t('assessment.submitError'), 'error');
    // Calculate locally as fallback
    const localResult = calculateLocalScore();
    showResult(localResult);
  }
}

function calculateLocalScore() {
  if (!checklistData) return null;

  const dimScores = checklistData.dimensions.map(dim => {
    const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
    const total = dim.checkpoints.length;
    const score = total > 0 ? (fulfilled / total * 100) : 0;
    let level = 1;
    if (score >= 90) level = 5;
    else if (score >= 70) level = 4;
    else if (score >= 50) level = 3;
    else if (score >= 25) level = 2;

    return {
      dimension_id: dim.id,
      dimension_name: dim.name,
      icon: dim.icon,
      weight: dim.weight,
      score: Math.round(score * 10) / 10,
      level,
      fulfilled_count: fulfilled,
      total_count: total,
    };
  });

  const overall = dimScores.reduce((sum, d) => sum + d.score * d.weight, 0);
  let overallLevel = 1;
  if (overall >= 90) overallLevel = 5;
  else if (overall >= 70) overallLevel = 4;
  else if (overall >= 50) overallLevel = 3;
  else if (overall >= 25) overallLevel = 2;

  return {
    overall_score: Math.round(overall * 10) / 10,
    overall_level: overallLevel,
    dimension_scores: dimScores,
  };
}

function showResult(result) {
  if (!result) return;
  const summary = document.getElementById('score-summary');
  const resultGrid = document.getElementById('result-grid');
  const resultLevel = document.getElementById('result-level');

  if (!summary || !resultGrid) return;

  summary.style.display = 'block';
  resultLevel.innerHTML = getLevelBadge(result.overall_level);

  resultGrid.innerHTML = `
    <div class="stat-card" style="padding: 16px;">
      <div class="stat-value gradient-blue">${Math.round(result.overall_score)}</div>
      <div class="stat-label">${t('assessment.overallScore')}</div>
    </div>
    ${result.dimension_scores.map(ds => `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px;">
        <span style="font-size: 1.2rem;">${ds.icon}</span>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 0.8rem; font-weight: 500;">${t('dimensions.' + ds.dimension_id)}</span>
            <span style="font-size: 0.8rem; font-weight: 600; color: ${getScoreColor(ds.score)};">${Math.round(ds.score)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${ds.score}%; background: ${getScoreColor(ds.score)};"></div>
          </div>
        </div>
      </div>
    `).join('')}
    <div style="grid-column: 1 / -1; display: flex; gap: 12px; justify-content: center; padding: 12px;">
      <a href="#roadmap" class="btn btn-primary">${t('assessment.viewRoadmap')}</a>
      <a href="#meta-strategy" class="btn btn-secondary">${t('assessment.strategicGuidance')}</a>
    </div>
  `;

  summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetChecklist() {
  if (confirm(t('assessment.resetConfirm'))) {
    assessments = {};
    saveAssessments();
    if (checklistData) {
      renderChecklistDimensions(checklistData);
    }
    const summary = document.getElementById('score-summary');
    if (summary) summary.style.display = 'none';
    showToast(t('assessment.resetSuccess'), 'info');
  }
}
