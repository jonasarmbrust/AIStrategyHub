/**
 * Dashboard Page — Overview with radar chart, stats, history, and quick actions.
 */
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, LineController, CategoryScale, LinearScale, Filler, Tooltip } from 'chart.js';
import { api, getLevelBadge, getScoreColor, LEVEL_NAMES } from '../main.js';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, LineController, CategoryScale, LinearScale, Filler, Tooltip);

let radarChart = null;
let trendChart = null;

export function renderDashboard(container) {
  container.innerHTML = `
    <div id="onboarding-overlay"></div>
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-description">Your AI Maturity at a glance — powered by insights synthesized from NIST, EU AI Act, Google, Microsoft, OWASP, and UNESCO frameworks.</p>
    </div>

    <div class="grid-4 mb-xl" id="stat-cards">
      <div class="card stat-card fade-in" style="animation-delay: 0ms">
        <div class="stat-value gradient-blue" id="stat-score">—</div>
        <div class="stat-label">Maturity Score</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 60ms">
        <div id="stat-level-badge" style="margin-bottom: 8px">—</div>
        <div class="stat-label">Maturity Level</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 120ms">
        <div class="stat-value gradient-green" id="stat-analyses">0</div>
        <div class="stat-label">Analyses</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 180ms">
        <div class="stat-value gradient-warm" id="stat-sources">0</div>
        <div class="stat-label">Research Sources</div>
      </div>
    </div>

    <div class="grid-2 mb-xl">
      <div class="card fade-in" style="animation-delay: 200ms">
        <div class="card-header">
          <span class="card-title">📊 Maturity Radar</span>
        </div>
        <div style="position: relative; height: 320px;">
          <canvas id="radar-chart"></canvas>
        </div>
      </div>
      <div class="card fade-in" style="animation-delay: 260ms">
        <div class="card-header">
          <span class="card-title">🎯 Score Breakdown</span>
        </div>
        <div id="score-breakdown" class="flex flex-col gap-md">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">Complete an assessment or analyze a document to see your scores</div>
            <a href="#assessment" class="btn btn-primary btn-sm">Start Assessment</a>
          </div>
        </div>
      </div>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 300ms">
      <div class="card-header">
        <span class="card-title">⚡ Quick Actions</span>
      </div>
      <div class="grid-3">
        <a href="#explorer" class="quick-action-card">
          <span class="quick-action-icon">🗺️</span>
          <span class="quick-action-label">Explore Frameworks</span>
        </a>
        <a href="#assessment" class="quick-action-card">
          <span class="quick-action-icon">✅</span>
          <span class="quick-action-label">Start Assessment</span>
        </a>
        <a href="#analyzer" class="quick-action-card">
          <span class="quick-action-icon">🔍</span>
          <span class="quick-action-label">Analyze Document</span>
        </a>
        <a href="#framework-builder" class="quick-action-card">
          <span class="quick-action-icon">🏗️</span>
          <span class="quick-action-label">Framework Builder</span>
        </a>
        <a href="#meta-strategy" class="quick-action-card">
          <span class="quick-action-icon">🧭</span>
          <span class="quick-action-label">Meta Strategy</span>
        </a>
        <a href="#roadmap" class="quick-action-card">
          <span class="quick-action-icon">🗺️</span>
          <span class="quick-action-label">View Roadmap</span>
        </a>
      </div>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 340ms">
      <div class="card-header">
        <span class="card-title">📈 Score Trend</span>
        <span id="trend-delta" style="font-size: 0.85rem; font-weight: 600;"></span>
      </div>
      <div style="position: relative; height: 200px;">
        <canvas id="trend-chart"></canvas>
      </div>
      <div id="trend-empty" class="empty-state" style="display: none;">
        <div class="empty-state-text" style="font-size: 0.85rem;">Complete at least 2 assessments to see your trend.</div>
      </div>
    </div>

    <div class="card fade-in" style="animation-delay: 400ms">
      <div class="card-header">
        <span class="card-title">🕒 Assessment History & Reports</span>
        <div class="flex gap-md">
          <a href="#report" class="btn btn-primary btn-sm" style="background: var(--gradient-primary); font-weight: 600; border: none; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);">📄 Generate Consulting Report (PDF)</a>
          <a href="#assessment" class="btn btn-secondary btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">✅ New Assessment</a>
        </div>
      </div>
      <div id="history-list">
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-text">No assessments yet. Start with the assessment or upload a document.</div>
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
    { id: 'strategy', name: 'Strategy & Leadership', icon: '🎯' },
    { id: 'data', name: 'Data & Infrastructure', icon: '🗄️' },
    { id: 'governance', name: 'Governance & Compliance', icon: '⚖️' },
    { id: 'technology', name: 'Technology & MLOps', icon: '⚙️' },
    { id: 'talent', name: 'Talent & Culture', icon: '👥' },
    { id: 'ethics', name: 'Ethics & Responsible AI', icon: '🛡️' },
    { id: 'processes', name: 'Processes & Scaling', icon: '🔄' },
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
      deltaEl.innerHTML = `<span style="color: var(--accent-emerald);">📈 +${delta} points since last</span>`;
    } else if (delta < 0) {
      deltaEl.innerHTML = `<span style="color: var(--accent-red);">📉 ${delta} points since last</span>`;
    } else {
      deltaEl.innerHTML = `<span style="color: var(--text-muted);">→ No change</span>`;
    }
  }

  const labels = scored.map(h => new Date(h.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
  const data = scored.map(h => Math.round(h.overall_score));

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Maturity Score',
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
          <h2 style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">Welcome to AI Strategy Hub</h2>
          <p style="color: var(--text-secondary); font-size: 0.85rem;">Your AI Strategy Maturity Platform. Here's how to get started in 3 steps:</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 28px;">
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(59,130,246,0.06); border-radius: 10px; border: 1px solid rgba(59,130,246,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">✅</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">1. Assess your AI Maturity</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Go to <strong>Assessment</strong> and check off the practices your organization already follows.</div>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(16,185,129,0.06); border-radius: 10px; border: 1px solid rgba(16,185,129,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">🔬</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">2. Research Best Practices</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Use the <strong>Research Agent</strong> to automatically find relevant AI strategy articles and frameworks.</div>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; background: rgba(139,92,246,0.06); border-radius: 10px; border: 1px solid rgba(139,92,246,0.12);">
            <span style="font-size: 1.5rem; line-height: 1;">🏗️</span>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 2px;">3. Expand your Framework</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Import research into the <strong>Document Analyzer</strong>, then use the <strong>Framework Builder</strong> to grow your knowledge base.</div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="onboarding-dismiss" style="background: none; border: 1px solid var(--glass-border); color: var(--text-secondary); padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;">Skip</button>
          <a href="#assessment" id="onboarding-start" style="background: var(--gradient-primary); color: #fff; padding: 8px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.85rem; box-shadow: 0 4px 15px rgba(59,130,246,0.4);">Start Assessment →</a>
        </div>
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

  document.getElementById('onboarding-dismiss')?.addEventListener('click', dismissOnboarding);
  document.getElementById('onboarding-start')?.addEventListener('click', dismissOnboarding);
}
