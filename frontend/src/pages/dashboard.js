/**
 * Dashboard Page — Overview with radar chart, stats, history, and quick actions.
 */
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, LineController, CategoryScale, LinearScale, Filler, Tooltip } from 'chart.js';
import { api, getLevelBadge, getScoreColor } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, LineController, CategoryScale, LinearScale, Filler, Tooltip);

let radarChart = null;
let trendChart = null;

export function renderDashboard(container) {
  container.innerHTML = `
    <div id="onboarding-overlay"></div>
    <div class="page-header">
      <h1 class="page-title">${t('dashboard.title')}</h1>
      <p class="page-description">${t('dashboard.desc')}</p>
    </div>

    <div class="grid-4 mb-xl" id="stat-cards">
      <div class="card stat-card fade-in" style="animation-delay: 0ms">
        <div class="stat-value gradient-blue" id="stat-score">—</div>
        <div class="stat-label">${t('dashboard.statScore')}</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 60ms">
        <div id="stat-level-badge" style="margin-bottom: 8px">—</div>
        <div class="stat-label">${t('dashboard.statLevel')}</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 120ms">
        <div class="stat-value gradient-green" id="stat-analyses">0</div>
        <div class="stat-label">${t('dashboard.statAnalyses')}</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 180ms">
        <div class="stat-value gradient-warm" id="stat-sources">0</div>
        <div class="stat-label">${t('dashboard.statSources')}</div>
      </div>
    </div>

    <div class="grid-2 mb-xl">
      <div class="card fade-in" style="animation-delay: 200ms">
        <div class="card-header">
          <span class="card-title">${t('dashboard.radarTitle')}</span>
        </div>
        <div style="position: relative; height: 320px;">
          <canvas id="radar-chart"></canvas>
        </div>
      </div>
      <div class="card fade-in" style="animation-delay: 260ms">
        <div class="card-header">
          <span class="card-title">${t('dashboard.breakdownTitle')}</span>
        </div>
        <div id="score-breakdown" class="flex flex-col gap-md">
          <div class="empty-state">
            <div class="empty-state-icon">${t('dashboard.emptyStateLine1')}</div>
            <div class="empty-state-text">${t('dashboard.emptyStateLine2')}</div>
            <a href="#assessment" class="btn btn-primary btn-sm">${t('dashboard.startAssessment')}</a>
          </div>
        </div>
      </div>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 300ms">
      <div class="card-header">
        <span class="card-title">${t('dashboard.quickActions')}</span>
      </div>
      <div class="grid-3">
        <a href="#explorer" class="quick-action-card">
          <span class="quick-action-icon">🗺️</span>
          <span class="quick-action-label">${t('dashboard.actionExplore')}</span>
        </a>
        <a href="#assessment" class="quick-action-card">
          <span class="quick-action-icon">✅</span>
          <span class="quick-action-label">${t('dashboard.actionAssess')}</span>
        </a>
        <a href="#analyzer" class="quick-action-card">
          <span class="quick-action-icon">🔍</span>
          <span class="quick-action-label">${t('dashboard.actionAnalyze')}</span>
        </a>
        <a href="#framework-builder" class="quick-action-card">
          <span class="quick-action-icon">🏗️</span>
          <span class="quick-action-label">${t('dashboard.actionBuilder')}</span>
        </a>
        <a href="#meta-strategy" class="quick-action-card">
          <span class="quick-action-icon">🧭</span>
          <span class="quick-action-label">${t('dashboard.actionMeta')}</span>
        </a>
        <a href="#roadmap" class="quick-action-card">
          <span class="quick-action-icon">🗺️</span>
          <span class="quick-action-label">${t('dashboard.actionRoadmap')}</span>
        </a>
      </div>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 340ms">
      <div class="card-header">
        <span class="card-title">${t('dashboard.trendTitle')}</span>
        <span id="trend-delta" style="font-size: 0.85rem; font-weight: 600;"></span>
      </div>
      <div style="position: relative; height: 200px;">
        <canvas id="trend-chart"></canvas>
      </div>
      <div id="trend-empty" class="empty-state" style="display: none;">
        <div class="empty-state-text" style="font-size: 0.85rem;">${t('dashboard.emptyTrend')}</div>
      </div>
    </div>

    <div class="card fade-in" style="animation-delay: 400ms">
      <div class="card-header">
        <span class="card-title">${t('dashboard.historyTitle')}</span>
        <div class="flex gap-md">
          <a href="#report" class="btn btn-primary btn-sm" style="background: var(--gradient-primary); font-weight: 600; border: none; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);">${t('dashboard.btnReport')}</a>
          <a href="#assessment" class="btn btn-secondary btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">${t('dashboard.btnNewAssessment')}</a>
        </div>
      </div>
      <div id="history-list">
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">${t('dashboard.emptyHistory')}</div>
        </div>
      </div>
    </div>
  `;

  loadDashboardData();
  showOnboarding();
}

async function loadDashboardData() {
  try {
    const stats = await api.get('/dashboard/stats');

    // Update stat cards
    if (stats.latest_score !== null && stats.latest_score !== undefined) {
      document.getElementById('stat-score').textContent = Math.round(stats.latest_score);
      document.getElementById('stat-level-badge').innerHTML = getLevelBadge(stats.latest_level || 1);
    }
    document.getElementById('stat-analyses').textContent = stats.total_analyses || 0;
    document.getElementById('stat-sources').textContent = stats.total_sources || 0;

    // Render radar chart
    if (stats.dimension_averages && Object.keys(stats.dimension_averages).length > 0) {
      renderRadarChart(stats.dimension_averages);
      renderScoreBreakdown(stats.dimension_averages);
    } else {
      // Fallback: try localStorage assessment
      renderFromLocalStorage();
    }

    // Load history
    const history = await api.get('/dashboard/history');
    if (history.length > 0) {
      renderHistory(history);
      renderTrendChart(history);
    } else {
      const trendEmpty = document.getElementById('trend-empty');
      if (trendEmpty) trendEmpty.style.display = 'block';
    }
  } catch (e) {
    console.log('Dashboard data not available — trying localStorage fallback');
    renderFromLocalStorage();
  }
}

function renderFromLocalStorage() {
  try {
    const saved = localStorage.getItem('oaimm_assessments');
    if (!saved) { renderOfflineRadar(); return; }

    const assessments = JSON.parse(saved);
    const fulfilled = Object.entries(assessments).filter(([, v]) => v.fulfilled);
    if (fulfilled.length === 0) { renderOfflineRadar(); return; }

    // We need the model to calculate scores — fetch it
    api.get('/checklist/model').then(model => {
      if (!model?.dimensions) { renderOfflineRadar(); return; }

      const dimAverages = {};
      let totalScore = 0;
      let totalWeight = 0;

      model.dimensions.forEach(dim => {
        const dimFulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
        const total = dim.checkpoints.length;
        const score = total > 0 ? (dimFulfilled / total * 100) : 0;
        dimAverages[dim.id] = Math.round(score);
        totalScore += score * dim.weight;
        totalWeight += dim.weight;
      });

      const overall = totalWeight > 0 ? totalScore / totalWeight : 0;
      let level = 1;
      if (overall >= 90) level = 5;
      else if (overall >= 70) level = 4;
      else if (overall >= 50) level = 3;
      else if (overall >= 25) level = 2;

      document.getElementById('stat-score').textContent = Math.round(overall);
      document.getElementById('stat-level-badge').innerHTML = getLevelBadge(level);

      renderRadarChart(dimAverages);
      renderScoreBreakdown(dimAverages);
    }).catch(() => renderOfflineRadar());
  } catch {
    renderOfflineRadar();
  }
}

function renderRadarChart(dimensionAverages) {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;

  if (radarChart) {
    radarChart.destroy();
  }

  const dimLabels = {
    strategy: 'Strategy',
    data: 'Data & Infra',
    governance: 'Governance',
    technology: 'Tech & MLOps',
    talent: 'Talent',
    ethics: 'Ethics & RAI',
    processes: 'Processes',
  };

  const labels = Object.keys(dimLabels).map(k => dimLabels[k]);
  const data = Object.keys(dimLabels).map(k => dimensionAverages[k] || 0);

  radarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Your Score',
        data,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderColor: '#3b82f6',
        borderWidth: 2,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(10, 14, 35, 0.95)',
          titleColor: '#e8eaf6',
          bodyColor: '#8890b5',
          borderColor: 'rgba(100, 140, 255, 0.2)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${Math.round(ctx.raw)}%`,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 25,
            color: '#505882',
            backdropColor: 'transparent',
            font: { size: 10 },
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          angleLines: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          pointLabels: {
            color: '#8890b5',
            font: { size: 11, weight: '500' },
          },
        },
      },
    },
  });
}

function renderOfflineRadar() {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;

  const dimLabels = ['Strategy', 'Data & Infra', 'Governance', 'Tech & MLOps', 'Talent', 'Ethics & RAI', 'Processes'];

  radarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: dimLabels,
      datasets: [{
        label: 'No Data',
        data: Array(7).fill(0),
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointBackgroundColor: 'rgba(59, 130, 246, 0.3)',
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { tooltip: { enabled: false } },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 25, color: '#505882', backdropColor: 'transparent', font: { size: 10 } },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
          pointLabels: { color: '#505882', font: { size: 11, weight: '500' } },
        },
      },
    },
  });
}

function renderScoreBreakdown(dimensionAverages) {
  const el = document.getElementById('score-breakdown');
  if (!el) return;

  const dims = [
    { id: 'strategy', name: t('dimensions.strategy'), icon: '🎯' },
    { id: 'data', name: t('dimensions.data'), icon: '🗄️' },
    { id: 'governance', name: t('dimensions.governance'), icon: '⚖️' },
    { id: 'technology', name: t('dimensions.technology'), icon: '⚙️' },
    { id: 'talent', name: t('dimensions.talent'), icon: '👥' },
    { id: 'ethics', name: t('dimensions.ethics'), icon: '🛡️' },
    { id: 'processes', name: t('dimensions.processes'), icon: '🔄' },
  ];

  el.innerHTML = dims.map(d => {
    const score = Math.round(dimensionAverages[d.id] || 0);
    const color = getScoreColor(score);
    return `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.2rem; width: 28px;">${d.icon}</span>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 0.82rem; font-weight: 500;">${d.name}</span>
            <span style="font-size: 0.82rem; font-weight: 600; color: ${color};">${score}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${score}%; background: ${color};"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHistory(items) {
  const el = document.getElementById('history-list');
  if (!el || items.length === 0) return;

  el.innerHTML = items.map(item => {
    const score = Math.round(item.overall_score);
    const color = getScoreColor(score);
    const date = new Date(item.created_at).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const icon = item.type === 'manual' ? '✅' : '📄';

    return `
      <div class="analysis-item">
        <span class="analysis-icon">${icon}</span>
        <div class="analysis-info">
          <div class="analysis-name">${item.document_name}</div>
          <div class="analysis-date">${date}</div>
        </div>
        ${getLevelBadge(item.overall_level)}
        <span class="analysis-score" style="color: ${color};">${score}</span>
      </div>
    `;
  }).join('');
}

function renderTrendChart(history) {
  const canvas = document.getElementById('trend-chart');
  const deltaEl = document.getElementById('trend-delta');
  const emptyEl = document.getElementById('trend-empty');
  if (!canvas) return;

  // Filter items with scores and sort by date ascending
  const scored = history.filter(h => h.overall_score > 0).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (scored.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  // Calculate delta
  const latest = scored[scored.length - 1].overall_score;
  const previous = scored[scored.length - 2].overall_score;
  const delta = Math.round(latest - previous);
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.innerHTML = `<span style="color: var(--accent-emerald);">${t('dashboard.deltaPlus').replace('{delta}', delta)}</span>`;
    } else if (delta < 0) {
      deltaEl.innerHTML = `<span style="color: var(--accent-red);">${t('dashboard.deltaMinus').replace('{delta}', delta)}</span>`;
    } else {
      deltaEl.innerHTML = `<span style="color: var(--text-muted);">${t('dashboard.deltaSame')}</span>`;
    }
  }

  const labels = scored.map(h => new Date(h.created_at).toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit' }));
  const data = scored.map(h => Math.round(h.overall_score));

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: t('dashboard.statScore'),
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(15, 20, 45, 0.9)',
          titleColor: '#e8eaf6',
          bodyColor: '#8890b5',
          borderColor: 'rgba(59, 130, 246, 0.3)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => `Score: ${ctx.parsed.y}/100`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505882', font: { size: 11 } },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505882', stepSize: 25, font: { size: 11 } },
        },
      },
    },
  });
}

function showOnboarding() {
  if (localStorage.getItem('oaimm_onboarding_completed')) return;

  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);" id="onboarding-modal">
      <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; max-width: 520px; width: 90%; padding: 32px; box-shadow: 0 25px 60px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 3rem; margin-bottom: 8px;">🔷</div>
          <h2 style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">${t('dashboard.onboardingTitle')}</h2>
          <p style="color: var(--text-secondary); font-size: 0.85rem;">${t('dashboard.onboardingDesc1')}</p>
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">${t('dashboard.onboardingDesc2')}</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 28px;">
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(59,130,246,0.06); border-radius: 10px; border: 1px solid rgba(59,130,246,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">✅</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">${t('dashboard.onboardingOpt1Title')}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">${t('dashboard.onboardingOpt1Desc')}</div>
              <a href="#assessment" class="btn btn-primary btn-sm" onclick="document.getElementById('onboarding-overlay').innerHTML=''" style="padding: 4px 12px; font-size: 0.75rem;">${t('dashboard.onboardingOpt1Btn')}</a>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(16,185,129,0.06); border-radius: 10px; border: 1px solid rgba(16,185,129,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">🔍</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">${t('dashboard.onboardingOpt2Title')}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">${t('dashboard.onboardingOpt2Desc')}</div>
              <a href="#analyzer" class="btn btn-primary btn-sm" onclick="document.getElementById('onboarding-overlay').innerHTML=''" style="padding: 4px 12px; font-size: 0.75rem; background: var(--gradient-green); border: none;">${t('dashboard.onboardingOpt2Btn')}</a>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(139,92,246,0.06); border-radius: 10px; border: 1px solid rgba(139,92,246,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">🧠</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">${t('dashboard.onboardingOpt3Title')}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">${t('dashboard.onboardingOpt3Desc')}</div>
              <a href="#advisor" class="btn btn-primary btn-sm" onclick="document.getElementById('onboarding-overlay').innerHTML=''" style="padding: 4px 12px; font-size: 0.75rem; background: linear-gradient(135deg, #8b5cf6, #c084fc); border: none;">${t('dashboard.onboardingOpt3Btn')}</a>
            </div>
          </div>
        </div>

        <button id="close-onboarding" class="btn btn-secondary" style="width: 100%; justify-content: center;">${t('dashboard.onboardingClose')}</button>
      </div>
    </div>
  `;

  const dismissOnboarding = () => {
    localStorage.setItem('oaimm_onboarding_completed', 'true');
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.innerHTML = '', 300);
    }
  };

  document.getElementById('close-onboarding')?.addEventListener('click', dismissOnboarding);
}
