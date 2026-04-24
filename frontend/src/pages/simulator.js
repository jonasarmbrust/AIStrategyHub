/**
 * Gap Simulator — "What-If Analysis" for AI maturity score.
 * Toggle checkpoints on/off and see live score impact.
 */
import { api, getScoreColor, getLevelBadge, LEVEL_NAMES } from '../main.js';

import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

let model = null;
let currentAssessments = {};
let simAssessments = {};

export async function renderSimulator(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">${t('simulator.title')}</h1>
          <p class="page-description">${t('simulator.desc')}</p>
        </div>
        <button id="btn-reset-sim" class="btn btn-secondary btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">${t('simulator.resetBtn')}</button>
      </div>
    </div>

    <div class="grid-2 mb-xl">
      <div class="card fade-in" style="animation-delay: 0ms">
        <div class="card-header border-none" style="margin-bottom: 4px;">
          <span class="card-title">${t('simulator.currentState')}</span>
        </div>
        <div style="text-align: center; padding: 8px 0;">
          <div id="sim-current-score" class="stat-value" style="font-size: 2.5rem;">—</div>
          <div id="sim-current-level" class="stat-label" style="margin-top: 4px;">—</div>
        </div>
      </div>
      <div class="card fade-in" style="animation-delay: 60ms; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--gradient-primary);"></div>
        <div class="card-header border-none" style="margin-bottom: 4px;">
          <span class="card-title">${t('simulator.simState')}</span>
        </div>
        <div style="text-align: center; padding: 8px 0;">
          <div id="sim-new-score" class="stat-value" style="font-size: 2.5rem;">—</div>
          <div id="sim-new-level" class="stat-label" style="margin-top: 4px;">—</div>
          <div id="sim-delta" style="margin-top: 8px; font-size: 0.9rem; font-weight: 600;"></div>
        </div>
      </div>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 120ms">
      <div class="card-header">
        <span class="card-title">${t('simulator.impactTitle')}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">${t('simulator.impactSub')}</span>
      </div>
      <div id="sim-impact-list"></div>
    </div>

    <div id="sim-dimensions" class="fade-in" style="animation-delay: 200ms"></div>
  `;

  await loadSimulatorData();

  document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
    simAssessments = JSON.parse(JSON.stringify(currentAssessments));
    renderSimulation();
  });
}

async function loadSimulatorData() {
  try {
    model = await api.get('/checklist/model');
  } catch {
    document.getElementById('sim-dimensions').innerHTML = `<div class="empty-state"><div class="empty-state-text">${t('simulator.failedLoad')}</div></div>`;
    return;
  }

  // Load current assessment from localStorage
  try {
    const saved = localStorage.getItem('oaimm_assessments');
    if (saved) currentAssessments = JSON.parse(saved);
  } catch {}

  simAssessments = JSON.parse(JSON.stringify(currentAssessments));
  renderSimulation();
}

function calculateScore(assessments) {
  if (!model?.dimensions) return { score: 0, level: 1, dimScores: {} };

  let totalScore = 0, totalWeight = 0;
  const dimScores = {};

  model.dimensions.forEach(dim => {
    const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
    const total = dim.checkpoints.length;
    const score = total > 0 ? (fulfilled / total * 100) : 0;
    dimScores[dim.id] = { score: Math.round(score), fulfilled, total, name: dim.name, icon: dim.icon };
    totalScore += score * dim.weight;
    totalWeight += dim.weight;
  });

  const overall = totalWeight > 0 ? totalScore / totalWeight : 0;
  let level = 1;
  if (overall >= 90) level = 5;
  else if (overall >= 70) level = 4;
  else if (overall >= 50) level = 3;
  else if (overall >= 25) level = 2;

  return { score: Math.round(overall), level, dimScores };
}

function renderSimulation() {
  const current = calculateScore(currentAssessments);
  const simulated = calculateScore(simAssessments);

  // Update score cards
  const curScoreEl = document.getElementById('sim-current-score');
  const curLevelEl = document.getElementById('sim-current-level');
  const newScoreEl = document.getElementById('sim-new-score');
  const newLevelEl = document.getElementById('sim-new-level');
  const deltaEl = document.getElementById('sim-delta');

  if (curScoreEl) { curScoreEl.textContent = current.score; curScoreEl.style.color = getScoreColor(current.score); }
  if (curLevelEl) curLevelEl.innerHTML = getLevelBadge(current.level);
  if (newScoreEl) { newScoreEl.textContent = simulated.score; newScoreEl.style.color = getScoreColor(simulated.score); }
  if (newLevelEl) newLevelEl.innerHTML = getLevelBadge(simulated.level);

  const delta = simulated.score - current.score;
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.innerHTML = `<span style="color: var(--accent-emerald);">${t('simulator.ptsIncrease').replace('{pts}', delta)}</span>`;
    } else if (delta < 0) {
      deltaEl.innerHTML = `<span style="color: var(--accent-red);">${t('simulator.ptsDecrease').replace('{pts}', delta)}</span>`;
    } else {
      deltaEl.innerHTML = `<span style="color: var(--text-muted);">${t('simulator.noChange')}</span>`;
    }
  }

  // Render impact list — unfulfilled checkpoints sorted by score impact
  renderImpactList(current);

  // Render dimension breakdown
  renderDimensionBreakdown(current, simulated);
}

function renderImpactList(current) {
  const el = document.getElementById('sim-impact-list');
  if (!el || !model) return;

  const unfulfilled = [];
  model.dimensions.forEach(dim => {
    dim.checkpoints.forEach(cp => {
      if (!currentAssessments[cp.id]?.fulfilled) {
        // Calculate impact: simulate fulfilling this one checkpoint
        const tempAssessments = JSON.parse(JSON.stringify(currentAssessments));
        tempAssessments[cp.id] = { fulfilled: true, level: cp.min_level };
        const newCalc = calculateScore(tempAssessments);
        const impact = newCalc.score - current.score;
        unfulfilled.push({ cp, dim, impact });
      }
    });
  });

  unfulfilled.sort((a, b) => b.impact - a.impact);
  const top = unfulfilled.slice(0, 10);

  if (top.length === 0) {
    el.innerHTML = `<div style="padding: 16px; color: var(--accent-emerald); font-size: 0.85rem;">${t('simulator.allFulfilled')}</div>`;
    return;
  }

  el.innerHTML = top.map((item, idx) => {
    const isSimulated = simAssessments[item.cp.id]?.fulfilled;
    return `
      <div class="sim-impact-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); ${isSimulated ? 'background: rgba(16,185,129,0.05);' : ''}">
        <label class="sim-toggle" style="cursor: pointer; display: flex; align-items: center;">
          <input type="checkbox" class="sim-checkbox" data-cpid="${item.cp.id}" data-level="${item.cp.min_level}" ${isSimulated ? 'checked' : ''} 
            style="width: 18px; height: 18px; accent-color: var(--accent-emerald); cursor: pointer;" />
        </label>
        <span style="font-size: 0.75rem; color: var(--text-muted); min-width: 40px; font-weight: 600; font-family: monospace;">${item.cp.id}</span>
        <span style="font-size: 0.7rem; min-width: 24px;">${item.dim.icon}</span>
        <span style="flex: 1; font-size: 0.82rem; color: var(--text-primary);">${item.cp.text}</span>
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-emerald); min-width: 40px; text-align: right;">+${item.impact}</span>
      </div>
    `;
  }).join('');

  // Bind toggle checkboxes
  el.querySelectorAll('.sim-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const cpId = e.target.dataset.cpid;
      const level = parseInt(e.target.dataset.level) || 1;
      if (e.target.checked) {
        simAssessments[cpId] = { fulfilled: true, level };
      } else {
        delete simAssessments[cpId];
      }
      renderSimulation();
    });
  });
}

function renderDimensionBreakdown(current, simulated) {
  const el = document.getElementById('sim-dimensions');
  if (!el || !model) return;

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${t('simulator.dimImpactTitle')}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${model.dimensions.map(dim => {
          const cur = current.dimScores[dim.id] || { score: 0 };
          const sim = simulated.dimScores[dim.id] || { score: 0 };
          const delta = sim.score - cur.score;
          const deltaText = delta > 0 ? `<span style="color: var(--accent-emerald); font-weight: 600;">+${delta}</span>` : delta < 0 ? `<span style="color: var(--accent-red);">${delta}</span>` : '';

          return `
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.2rem; width: 28px;">${dim.icon}</span>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="font-size: 0.82rem; font-weight: 500;">${dim.name}</span>
                  <span style="font-size: 0.78rem;">
                    <span style="color: var(--text-muted);">${cur.score}%</span>
                    ${delta !== 0 ? ` → <span style="color: ${getScoreColor(sim.score)}; font-weight: 600;">${sim.score}%</span> ${deltaText}` : ''}
                  </span>
                </div>
                <div class="progress-bar" style="position: relative;">
                  <div class="progress-fill" style="width: ${cur.score}%; background: ${getScoreColor(cur.score)}; opacity: 0.3;"></div>
                  <div class="progress-fill" style="width: ${sim.score}%; background: ${getScoreColor(sim.score)}; position: absolute; top: 0; left: 0; height: 100%;"></div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
