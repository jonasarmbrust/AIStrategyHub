/**
 * Playbook Page — Step-by-step AI strategy implementation guide.
 * Displays all framework checkpoints organized into 5 sequential phases
 * with interactive progress tracking via localStorage.
 */
import { api, showToast, getSourceColor } from '../main.js';
import { t, getLang } from '../i18n.js';
import { escapeHTML } from '../sanitize.js';

const PHASE_COLORS = {
  1: { color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  2: { color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
  3: { color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  4: { color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  5: { color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

const EFFORT_COLORS = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
const PRIORITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', standard: '#8890b5' };

let playbookData = null;
let activeDimFilter = null;
let collapsedPhases = {};

// ── Storage Helpers ─────────────────────────────────────────────

function getCheckState(checkpointId) {
  return localStorage.getItem(`playbook_progress_${checkpointId}`) === 'true';
}

function setCheckState(checkpointId, checked) {
  localStorage.setItem(`playbook_progress_${checkpointId}`, checked ? 'true' : 'false');
}

function getPhaseProgress(phase) {
  if (!phase || !phase.steps) return { done: 0, total: 0 };
  const total = phase.steps.length;
  const done = phase.steps.filter(s => getCheckState(s.checkpoint_id)).length;
  return { done, total };
}

function getOverallProgress() {
  if (!playbookData || !playbookData.phases) return { done: 0, total: 0 };
  let done = 0, total = 0;
  for (const phase of playbookData.phases) {
    const p = getPhaseProgress(phase);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

// ── Main Render ─────────────────────────────────────────────────

export function renderPlaybook(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="background: linear-gradient(135deg, #10b981, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
        📋 ${t('playbook_title')}
      </h1>
      <p class="page-description">${t('playbook_subtitle')}</p>
    </div>

    <div id="playbook-loading" class="card mb-xl">
      <div class="empty-state">
        <div class="spinner"></div>
        <div class="empty-state-text" style="margin-top: 16px;">${t('playbook_loading')}</div>
      </div>
    </div>

    <div id="playbook-error" class="card mb-xl" style="display: none;">
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${t('playbook_error')}</div>
      </div>
    </div>

    <div id="playbook-content" style="display: none;">
      <!-- Meta info -->
      <div id="playbook-meta" style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 24px; text-align: center;"></div>

      <!-- Sticky Progress Bar -->
      <div class="playbook-progress-bar" id="playbook-progress-bar"></div>

      <!-- Overall Progress -->
      <div class="card mb-xl fade-in" id="playbook-overall-card" style="animation-delay: 100ms;">
        <div class="card-header">
          <span class="card-title">📊 ${t('playbook_overall_progress')}</span>
          <span id="playbook-overall-label" style="font-size: 0.82rem; color: var(--text-muted);"></span>
        </div>
        <div class="progress-bar" style="height: 10px; border-radius: 8px;">
          <div class="progress-fill" id="playbook-overall-fill" style="height: 100%; border-radius: 8px; background: linear-gradient(90deg, #10b981, #06b6d4, #3b82f6, #8b5cf6, #f59e0b); transition: width 0.8s ease;"></div>
        </div>
      </div>

      <!-- Phase Cards Container -->
      <div id="playbook-phases"></div>
    </div>
  `;

  loadPlaybook();
}

// ── Data Loading ────────────────────────────────────────────────

async function loadPlaybook() {
  try {
    playbookData = await api.get('/evolution/playbook');

    if (!playbookData || !playbookData.phases || playbookData.phases.length === 0) {
      document.getElementById('playbook-loading').style.display = 'none';
      const errEl = document.getElementById('playbook-error');
      errEl.style.display = 'block';
      errEl.querySelector('.empty-state-text').textContent = t('playbook_empty');
      return;
    }

    document.getElementById('playbook-loading').style.display = 'none';
    document.getElementById('playbook-content').style.display = 'block';

    renderMeta();
    renderProgressBar();
    renderPhases();
    updateOverallProgress();
  } catch (e) {
    document.getElementById('playbook-loading').style.display = 'none';
    document.getElementById('playbook-error').style.display = 'block';
    showToast(t('playbook_error'), 'error');
  }
}

// ── Meta Info ───────────────────────────────────────────────────

function renderMeta() {
  const metaEl = document.getElementById('playbook-meta');
  if (!metaEl || !playbookData) return;
  metaEl.textContent = t('playbook_based_on')
    .replace('{count}', playbookData.total_checkpoints || 0)
    .replace('{version}', playbookData.model_version || '?');
}

// ── Sticky Progress Bar ────────────────────────────────────────

function renderProgressBar() {
  const bar = document.getElementById('playbook-progress-bar');
  if (!bar || !playbookData) return;

  const phases = playbookData.phases;
  const lang = getLang();

  bar.innerHTML = `
    <div class="playbook-progress-line"></div>
    <div class="playbook-progress-nodes">
      ${phases.map((phase, idx) => {
        const prog = getPhaseProgress(phase);
        const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
        const phaseName = lang === 'de' && phase.name_de ? phase.name_de : phase.name;
        const phaseColor = PHASE_COLORS[phase.phase]?.color || '#8890b5';
        return `
          <button class="playbook-progress-node" data-phase="${phase.phase}" id="playbook-nav-phase-${phase.phase}"
            style="--node-color: ${phaseColor};"
            title="${phaseName} — ${prog.done}/${prog.total}">
            <span class="playbook-node-number">${phase.phase}</span>
            <span class="playbook-node-label">${escapeHTML(phaseName)}</span>
            <span class="playbook-node-count">${prog.done}/${prog.total}</span>
            ${pct === 100 ? '<span class="playbook-node-check">✓</span>' : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;

  // Click to scroll
  bar.querySelectorAll('.playbook-progress-node').forEach(node => {
    node.addEventListener('click', () => {
      const phaseNum = node.dataset.phase;
      const target = document.getElementById(`playbook-phase-${phaseNum}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── Phase Cards ────────────────────────────────────────────────

function renderPhases() {
  const container = document.getElementById('playbook-phases');
  if (!container || !playbookData) return;

  const lang = getLang();

  container.innerHTML = playbookData.phases.map((phase, idx) => {
    const phaseColor = PHASE_COLORS[phase.phase] || PHASE_COLORS[1];
    const phaseName = lang === 'de' && phase.name_de ? phase.name_de : phase.name;
    const phaseDesc = lang === 'de' && phase.description_de ? phase.description_de : phase.description;
    const keyFocus = lang === 'de' && phase.key_focus_de ? phase.key_focus_de : phase.key_focus;
    const prog = getPhaseProgress(phase);
    const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
    const isCollapsed = collapsedPhases[phase.phase] || false;

    return `
      <div class="playbook-phase-card card mb-xl fade-in" data-phase="${phase.phase}" id="playbook-phase-${phase.phase}"
        style="animation-delay: ${(idx + 1) * 120}ms;">

        <!-- Phase Header -->
        <div class="playbook-phase-header" id="playbook-phase-header-${phase.phase}">
          <div class="playbook-phase-header-top">
            <div class="playbook-phase-label">
              <span class="playbook-phase-number" style="background: ${phaseColor.gradient};">${phase.phase}</span>
              <div>
                <div class="playbook-phase-name">${t('playbook_phase')} ${phase.phase}: ${escapeHTML(phaseName)}</div>
                <div class="playbook-phase-level" style="color: ${phaseColor.color};">${escapeHTML(phase.level_name || '')}</div>
              </div>
            </div>
            <div class="playbook-phase-header-right">
              <span class="playbook-phase-duration">
                <span style="font-size: 0.72rem; color: var(--text-muted);">${t('playbook_duration')}:</span>
                <span style="font-weight: 600; color: ${phaseColor.color};">${escapeHTML(phase.estimated_duration || '')}</span>
              </span>
              <button class="btn btn-ghost btn-sm playbook-toggle-btn" data-phase="${phase.phase}" id="playbook-toggle-${phase.phase}">
                ${isCollapsed ? t('playbook_expand') : t('playbook_collapse')}
              </button>
            </div>
          </div>

          <!-- Key Focus -->
          ${keyFocus ? `
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 8px;">
              <span style="font-weight: 600; color: var(--text-muted);">${t('playbook_key_focus')}:</span>
              ${escapeHTML(keyFocus)}
            </div>
          ` : ''}

          <!-- Description -->
          ${phaseDesc ? `
            <div style="font-size: 0.84rem; color: var(--text-secondary); margin-top: 8px; line-height: 1.6; font-style: italic; opacity: 0.8;">
              "${escapeHTML(phaseDesc)}"
            </div>
          ` : ''}

          <!-- Phase Progress -->
          <div style="margin-top: 16px; display: flex; align-items: center; gap: 12px;">
            <div class="progress-bar" style="flex: 1; height: 6px;">
              <div class="progress-fill" id="playbook-phase-fill-${phase.phase}"
                style="width: ${pct}%; background: ${phaseColor.gradient}; transition: width 0.5s ease;"></div>
            </div>
            <span id="playbook-phase-pct-${phase.phase}" style="font-size: 0.78rem; font-weight: 700; color: ${phaseColor.color}; min-width: 42px; text-align: right;">
              ${pct === 100 ? t('playbook_all_completed') : `${pct}%`}
            </span>
          </div>

          <!-- Dimension Pills -->
          ${renderDimensionPills(phase)}
        </div>

        <!-- Steps Container -->
        <div class="playbook-steps-container" id="playbook-steps-${phase.phase}" style="${isCollapsed ? 'display: none;' : ''}">
          ${renderSteps(phase)}
        </div>
      </div>
    `;
  }).join('');

  setupPhaseEvents();
}

function renderDimensionPills(phase) {
  if (!phase.dimension_breakdown) return '';
  const dims = Object.entries(phase.dimension_breakdown);
  if (dims.length === 0) return '';

  return `
    <div class="playbook-dim-pills" style="margin-top: 14px;">
      <button class="playbook-dim-pill ${!activeDimFilter ? 'active' : ''}" data-dim="all" data-phase="${phase.phase}"
        style="--pill-color: var(--text-muted);">
        ${t('playbook_filter_all')}
      </button>
      ${dims.map(([dimId, info]) => `
        <button class="playbook-dim-pill ${activeDimFilter === dimId ? 'active' : ''}" data-dim="${dimId}" data-phase="${phase.phase}"
          style="--pill-color: ${getSourceColor(info.icon || dimId)};">
          ${info.icon || ''} ${escapeHTML(info.name || dimId)}
          <span class="playbook-dim-pill-count">${info.count}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSteps(phase) {
  if (!phase.steps || phase.steps.length === 0) return '';

  const lang = getLang();

  return phase.steps.map((step, idx) => {
    const checked = getCheckState(step.checkpoint_id);
    const text = lang === 'de' && step.text_de ? step.text_de : step.text;
    const phaseColor = PHASE_COLORS[phase.phase] || PHASE_COLORS[1];
    const effortKey = step.effort || 'low';
    const effortColor = EFFORT_COLORS[effortKey] || EFFORT_COLORS.low;
    const effortLabel = t(`playbook_effort_${effortKey}`);
    const priorityKey = step.priority || 'standard';
    const priorityColor = PRIORITY_COLORS[priorityKey] || PRIORITY_COLORS.standard;
    const priorityLabel = t(`playbook_priority_${priorityKey}`);
    const dimId = step.dimension_id || '';

    return `
      <div class="playbook-step stagger-in ${checked ? 'completed' : ''}" data-dim="${dimId}" data-checkpoint="${step.checkpoint_id}"
        style="animation-delay: ${idx * 40}ms; ${activeDimFilter && activeDimFilter !== dimId ? 'display: none;' : ''}">
        <div class="playbook-step-left">
          <label class="playbook-step-checkbox" id="playbook-check-${step.checkpoint_id}">
            <input type="checkbox" ${checked ? 'checked' : ''} data-checkpoint="${step.checkpoint_id}" data-phase="${phase.phase}" />
            <span class="playbook-check-mark" style="--check-color: ${phaseColor.color};"></span>
          </label>
          <span class="playbook-step-number" style="border-color: ${phaseColor.color}; color: ${phaseColor.color};">${step.order}</span>
        </div>
        <div class="playbook-step-body">
          <div class="playbook-step-header">
            <span class="playbook-step-dim" style="--dim-color: ${getSourceColor(step.dimension_name || dimId)};">
              ${step.dimension_icon || ''} ${escapeHTML(step.dimension_name || '')}
            </span>
            ${step.category ? `<span class="playbook-step-category">${escapeHTML(step.category)}</span>` : ''}
            <span class="playbook-step-id" style="color: var(--text-muted);">${escapeHTML(step.checkpoint_id)}</span>
          </div>
          <div class="playbook-step-text ${checked ? 'done' : ''}">${escapeHTML(text || '')}</div>
          <div class="playbook-step-footer">
            <span class="playbook-effort-badge" style="--effort-color: ${effortColor};">
              ${effortKey === 'low' ? '🟢' : effortKey === 'medium' ? '🟡' : '🔴'} ${effortLabel}
            </span>
            <span class="playbook-priority-badge ${priorityKey === 'critical' ? 'pulse' : ''}" style="--priority-color: ${priorityColor};">
              ${priorityKey === 'critical' ? '⭐' : priorityKey === 'high' ? '🔺' : ''} ${priorityLabel}
            </span>
            ${renderSourcePills(step.sources)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSourcePills(sources) {
  if (!sources || sources.length === 0) return '';
  return `
    <span class="playbook-sources-wrap">
      <span style="font-size: 0.68rem; color: var(--text-muted); margin-right: 4px;">${t('playbook_sources')}:</span>
      ${sources.map(s => `<span class="playbook-source-pill" style="--source-color: ${getSourceColor(s)};">${escapeHTML(s)}</span>`).join('')}
    </span>
  `;
}

// ── Event Wiring ───────────────────────────────────────────────

function setupPhaseEvents() {
  // Toggle collapse/expand
  document.querySelectorAll('.playbook-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const phaseNum = btn.dataset.phase;
      const stepsEl = document.getElementById(`playbook-steps-${phaseNum}`);
      if (!stepsEl) return;

      const isNowCollapsed = stepsEl.style.display !== 'none';
      stepsEl.style.display = isNowCollapsed ? 'none' : '';
      collapsedPhases[phaseNum] = isNowCollapsed;
      btn.textContent = isNowCollapsed ? t('playbook_expand') : t('playbook_collapse');
    });
  });

  // Checkboxes
  document.querySelectorAll('.playbook-step-checkbox input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const cpId = cb.dataset.checkpoint;
      const phaseNum = cb.dataset.phase;
      setCheckState(cpId, cb.checked);

      // Toggle completed class on step
      const stepEl = cb.closest('.playbook-step');
      if (stepEl) {
        stepEl.classList.toggle('completed', cb.checked);
        stepEl.querySelector('.playbook-step-text')?.classList.toggle('done', cb.checked);
      }

      updatePhaseProgress(phaseNum);
      updateOverallProgress();
      updateProgressBar();
    });
  });

  // Dimension filter pills
  document.querySelectorAll('.playbook-dim-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const dim = pill.dataset.dim;
      const phaseNum = pill.dataset.phase;

      if (dim === 'all') {
        activeDimFilter = null;
      } else {
        activeDimFilter = activeDimFilter === dim ? null : dim;
      }

      // Update pill active states in this phase
      const phaseCard = pill.closest('.playbook-phase-card');
      if (phaseCard) {
        phaseCard.querySelectorAll('.playbook-dim-pill').forEach(p => {
          const pDim = p.dataset.dim;
          if (!activeDimFilter) {
            p.classList.toggle('active', pDim === 'all');
          } else {
            p.classList.toggle('active', pDim === activeDimFilter);
          }
        });

        // Show/hide steps
        phaseCard.querySelectorAll('.playbook-step').forEach(step => {
          const stepDim = step.dataset.dim;
          if (!activeDimFilter || stepDim === activeDimFilter) {
            step.style.display = '';
          } else {
            step.style.display = 'none';
          }
        });
      }
    });
  });
}

// ── Progress Updates ───────────────────────────────────────────

function updatePhaseProgress(phaseNum) {
  if (!playbookData) return;
  const phase = playbookData.phases.find(p => p.phase == phaseNum);
  if (!phase) return;

  const prog = getPhaseProgress(phase);
  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  const fillEl = document.getElementById(`playbook-phase-fill-${phaseNum}`);
  if (fillEl) fillEl.style.width = `${pct}%`;

  const pctEl = document.getElementById(`playbook-phase-pct-${phaseNum}`);
  if (pctEl) pctEl.textContent = pct === 100 ? t('playbook_all_completed') : `${pct}%`;
}

function updateOverallProgress() {
  const prog = getOverallProgress();
  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  const fillEl = document.getElementById('playbook-overall-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;

  const labelEl = document.getElementById('playbook-overall-label');
  if (labelEl) {
    labelEl.textContent = t('playbook_completed')
      .replace('{count}', prog.done)
      .replace('{total}', prog.total);
  }
}

function updateProgressBar() {
  if (!playbookData) return;

  playbookData.phases.forEach(phase => {
    const prog = getPhaseProgress(phase);
    const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
    const node = document.getElementById(`playbook-nav-phase-${phase.phase}`);
    if (!node) return;

    const countEl = node.querySelector('.playbook-node-count');
    if (countEl) countEl.textContent = `${prog.done}/${prog.total}`;

    const existingCheck = node.querySelector('.playbook-node-check');
    if (pct === 100 && !existingCheck) {
      const check = document.createElement('span');
      check.className = 'playbook-node-check';
      check.textContent = '✓';
      node.appendChild(check);
    } else if (pct < 100 && existingCheck) {
      existingCheck.remove();
    }
  });
}
