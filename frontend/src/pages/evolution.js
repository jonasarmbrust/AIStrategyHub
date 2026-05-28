/**
 * Evolution Dashboard — Autonomous framework evolution monitoring & control.
 * Displays run history, proposals, redundancy scanner, and snapshots.
 */
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { api, showToast } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

let growthChart = null;

const DIM_COLORS = {
  strategy: '#3b82f6',
  data: '#06b6d4',
  governance: '#f59e0b',
  technology: '#8b5cf6',
  talent: '#10b981',
  ethics: '#ef4444',
  processes: '#f97316',
};

const DIM_LABELS = {
  strategy: 'Strategy',
  data: 'Data & Infra',
  governance: 'Governance',
  technology: 'Tech & MLOps',
  talent: 'Talent',
  ethics: 'Ethics',
  processes: 'Processes',
};

export function renderEvolution(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="background: linear-gradient(135deg, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
        🧬 ${t('evolution.title')}
      </h1>
      <p class="page-description">${t('evolution.subtitle')}</p>
    </div>

    <!-- Section 1: Hero Status Bar -->
    <div class="evolution-hero card mb-xl fade-in" id="evo-hero">
      <div class="evolution-hero-inner">
        <div class="evolution-hero-status">
          <span class="pulse-dot" id="evo-status-dot"></span>
          <span id="evo-status-label" style="font-weight: 600; font-size: 0.9rem;">${t('evolution.status_loading')}</span>
        </div>
        <div class="evolution-hero-countdown" id="evo-countdown">
          <span style="font-size: 0.8rem; color: var(--text-muted);">${t('evolution.next_run')}</span>
          <span id="evo-next-run" style="font-weight: 700; font-size: 1rem; background: linear-gradient(135deg, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">—</span>
        </div>
        <div class="evolution-hero-actions">
          <button class="btn btn-primary btn-sm" id="evo-btn-run" style="background: linear-gradient(135deg, #7c3aed, #2563eb); border: none; box-shadow: 0 4px 15px rgba(124,58,237,0.4);">
            ⚡ ${t('evolution.run_now')}
          </button>
          <button class="btn btn-ghost btn-sm" id="evo-btn-config">
            ⚙️ ${t('evolution.configure')}
          </button>
        </div>
      </div>
      <div id="evo-last-run" style="font-size: 0.78rem; color: var(--text-muted); margin-top: 12px; text-align: center;"></div>
    </div>

    <!-- Section 2: Stats Cards -->
    <div class="grid-4 mb-xl" id="evo-stats">
      <div class="card evolution-stat-card fade-in" style="animation-delay: 80ms">
        <div class="evo-stat-icon">🔄</div>
        <div class="evo-stat-value gradient-purple" id="evo-stat-runs">—</div>
        <div class="stat-label">${t('evolution.total_runs')}</div>
        <div class="evo-stat-trend" id="evo-trend-runs"></div>
      </div>
      <div class="card evolution-stat-card fade-in" style="animation-delay: 140ms">
        <div class="evo-stat-icon">📌</div>
        <div class="evo-stat-value gradient-blue" id="evo-stat-checkpoints">—</div>
        <div class="stat-label">${t('evolution.integrated')}</div>
        <div class="evo-stat-trend" id="evo-trend-checkpoints"></div>
      </div>
      <div class="card evolution-stat-card fade-in" style="animation-delay: 200ms">
        <div class="evo-stat-icon">🔗</div>
        <div class="evo-stat-value gradient-green" id="evo-stat-redundancies">—</div>
        <div class="stat-label">${t('evolution.redundancies_resolved')}</div>
        <div class="evo-stat-trend" id="evo-trend-redundancies"></div>
      </div>
      <div class="card evolution-stat-card fade-in" style="animation-delay: 260ms">
        <div class="evo-stat-icon">⭐</div>
        <div class="evo-stat-value gradient-warm" id="evo-stat-quality">—</div>
        <div class="stat-label">${t('evolution.avg_quality')}</div>
        <canvas id="evo-sparkline" width="80" height="24" style="margin-top: 6px;"></canvas>
      </div>
    </div>

    <!-- Section 3: Timeline + Growth Chart -->
    <div class="grid-evo-main mb-xl">
      <!-- Left: Timeline -->
      <div class="card fade-in" style="animation-delay: 300ms">
        <div class="card-header">
          <span class="card-title">🕐 ${t('evolution.timeline_title')}</span>
        </div>
        <div id="evo-timeline" class="evolution-timeline">
          <div class="loading-overlay" style="padding: 32px;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
      <!-- Right: Growth Chart -->
      <div class="card fade-in" style="animation-delay: 360ms">
        <div class="card-header">
          <span class="card-title">📈 ${t('evolution.growth_title')}</span>
        </div>
        <div style="position: relative; height: 360px;">
          <canvas id="evo-growth-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Section 4: Pending Proposals -->
    <div class="card mb-xl fade-in" style="animation-delay: 400ms" id="evo-proposals-section">
      <div class="card-header">
        <span class="card-title">💡 ${t('evolution.proposals_title')}</span>
        <button class="btn btn-primary btn-sm" id="evo-btn-approve-all" style="display: none; background: linear-gradient(135deg, #22c55e, #10b981); border: none;">
          ✓ ${t('evolution.approve_all')}
        </button>
      </div>
      <div id="evo-proposals">
        <div class="loading-overlay" style="padding: 24px;">
          <div class="spinner"></div>
        </div>
      </div>
    </div>

    <!-- Section 5: Redundancy Scanner -->
    <div class="card mb-xl fade-in" style="animation-delay: 460ms">
      <div class="card-header">
        <span class="card-title">🔍 ${t('evolution.redundancy_title')}</span>
        <button class="btn btn-secondary btn-sm" id="evo-btn-scan">
          🔬 ${t('evolution.scan_redundancies')}
        </button>
      </div>
      <div id="evo-redundancies">
        <div class="empty-state">
          <div class="empty-state-icon">🔗</div>
          <div class="empty-state-text">${t('evolution.redundancy_empty')}</div>
        </div>
      </div>
    </div>

    <!-- Section 6: Snapshots & Rollback -->
    <div class="card fade-in" style="animation-delay: 520ms">
      <div class="card-header">
        <span class="card-title">📦 ${t('evolution.snapshots_title')}</span>
      </div>
      <div id="evo-snapshots">
        <div class="loading-overlay" style="padding: 24px;">
          <div class="spinner"></div>
        </div>
      </div>
    </div>

    <!-- Config Modal -->
    <div id="evo-config-modal" class="evo-modal-overlay" style="display: none;">
      <div class="evo-modal-card">
        <div class="card-header">
          <span class="card-title">⚙️ ${t('evolution.configure')}</span>
          <button class="btn btn-ghost btn-sm" id="evo-config-close">✕</button>
        </div>
        <div id="evo-config-body">
          <div class="loading-overlay" style="padding: 24px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  setupEvolutionEvents();
  loadEvolutionData();
}

// ── Event Handlers ───────────────────────────────────────────

function setupEvolutionEvents() {
  document.getElementById('evo-btn-run')?.addEventListener('click', triggerEvolution);
  document.getElementById('evo-btn-config')?.addEventListener('click', openConfig);
  document.getElementById('evo-config-close')?.addEventListener('click', closeConfig);
  document.getElementById('evo-btn-scan')?.addEventListener('click', scanRedundancies);
  document.getElementById('evo-btn-approve-all')?.addEventListener('click', bulkApprove);

  // Close modal on overlay click
  document.getElementById('evo-config-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'evo-config-modal') closeConfig();
  });
}

// ── Data Loading ─────────────────────────────────────────────

async function loadEvolutionData() {
  await Promise.allSettled([
    loadStatus(),
    loadStats(),
    loadTimeline(),
    loadProposals(),
    loadSnapshots(),
  ]);
}

async function loadStatus() {
  try {
    const status = await api.get('/evolution/status');
    const dot = document.getElementById('evo-status-dot');
    const label = document.getElementById('evo-status-label');
    const nextRun = document.getElementById('evo-next-run');
    const lastRun = document.getElementById('evo-last-run');

    if (status.active) {
      dot?.classList.add('active');
      label.textContent = t('evolution.status_active');
      label.style.color = '#22c55e';
    } else if (status.running) {
      dot?.classList.add('running');
      label.textContent = t('evolution.status_running');
      label.style.color = '#eab308';
    } else {
      dot?.classList.add('paused');
      label.textContent = t('evolution.status_paused');
      label.style.color = 'var(--text-muted)';
    }

    if (status.next_run) {
      nextRun.textContent = formatCountdown(status.next_run);
    } else {
      nextRun.textContent = '—';
    }

    if (status.last_run_summary) {
      lastRun.textContent = `${t('evolution.last_run')}: ${status.last_run_summary}`;
    }
  } catch {
    const label = document.getElementById('evo-status-label');
    if (label) {
      label.textContent = t('evolution.status_offline');
      label.style.color = 'var(--accent-red)';
    }
  }
}

async function loadStats() {
  try {
    const stats = await api.get('/evolution/stats');

    animateCounter('evo-stat-runs', stats.total_runs || 0);
    animateCounter('evo-stat-checkpoints', stats.checkpoints_integrated || 0);
    animateCounter('evo-stat-redundancies', stats.redundancies_resolved || 0);

    const qualEl = document.getElementById('evo-stat-quality');
    if (qualEl) qualEl.textContent = stats.avg_quality_score != null ? stats.avg_quality_score.toFixed(1) : '—';

    // Trend arrows
    renderTrend('evo-trend-runs', stats.runs_trend);
    renderTrend('evo-trend-checkpoints', stats.checkpoints_trend);
    renderTrend('evo-trend-redundancies', stats.redundancies_trend);

    // Sparkline
    if (stats.quality_history && stats.quality_history.length > 1) {
      drawSparkline('evo-sparkline', stats.quality_history);
    }

    // Growth chart data
    if (stats.growth_data) {
      renderGrowthChart(stats.growth_data);
    }
  } catch {
    ['evo-stat-runs', 'evo-stat-checkpoints', 'evo-stat-redundancies', 'evo-stat-quality'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }
}

async function loadTimeline() {
  const el = document.getElementById('evo-timeline');
  try {
    const runs = await api.get('/evolution/runs');

    if (!runs || runs.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🕐</div>
          <div class="empty-state-text">${t('evolution.timeline_empty')}</div>
        </div>
      `;
      return;
    }

    el.innerHTML = runs.map((run, idx) => {
      const date = new Date(run.created_at || run.date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const time = new Date(run.created_at || run.date).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit',
      });

      const statusClass = run.status === 'success' ? 'success' :
                          run.status === 'failed' ? 'failed' : 'running';
      const statusIcon = run.status === 'success' ? '✓' :
                         run.status === 'failed' ? '✕' : '⟳';

      const statsLine = [];
      if (run.checkpoints_added > 0) statsLine.push(`+${run.checkpoints_added} checkpoints`);
      if (run.redundancies_resolved > 0) statsLine.push(`-${run.redundancies_resolved} redundancies`);

      return `
        <div class="evolution-timeline-node stagger-in" style="animation-delay: ${idx * 60}ms" data-run-id="${run.id}">
          <div class="evo-timeline-dot ${statusClass}">
            <span>${statusIcon}</span>
          </div>
          <div class="evo-timeline-content">
            <div class="evo-timeline-header">
              <div>
                <span class="evo-timeline-date">${date}</span>
                <span class="evo-timeline-time">${time}</span>
              </div>
              <span class="evo-timeline-badge ${statusClass}">${run.status}</span>
            </div>
            ${statsLine.length > 0 ? `<div class="evo-timeline-stats">${statsLine.join(' · ')}</div>` : ''}
            <div class="evo-timeline-detail" id="evo-detail-${run.id}" style="display: none;"></div>
          </div>
        </div>
      `;
    }).join('');

    // Click to expand detail
    el.querySelectorAll('.evolution-timeline-node').forEach(node => {
      node.addEventListener('click', async () => {
        const runId = node.dataset.runId;
        const detail = document.getElementById(`evo-detail-${runId}`);
        if (!detail) return;

        if (detail.style.display === 'block') {
          detail.style.display = 'none';
          return;
        }

        detail.style.display = 'block';
        detail.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 8px 0;"></div>';

        try {
          const data = await api.get(`/evolution/runs/${runId}`);
          const logs = (data.log_entries || data.logs || []).map(l =>
            `<div style="font-size: 0.75rem; color: var(--text-secondary); padding: 2px 0;">${escapeHTML(l)}</div>`
          ).join('');
          detail.innerHTML = logs || `<div style="font-size: 0.78rem; color: var(--text-muted);">${t('evolution.no_logs')}</div>`;
        } catch {
          detail.innerHTML = `<div style="font-size: 0.78rem; color: var(--accent-red);">Could not load details</div>`;
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">${t('evolution.backend_offline')}</div>
      </div>
    `;
  }
}

async function loadProposals() {
  const el = document.getElementById('evo-proposals');
  const approveAllBtn = document.getElementById('evo-btn-approve-all');

  try {
    const proposals = await api.get('/evolution/proposals');

    if (!proposals || proposals.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✨</div>
          <div class="empty-state-text">${t('evolution.proposals_empty')}</div>
        </div>
      `;
      if (approveAllBtn) approveAllBtn.style.display = 'none';
      return;
    }

    if (approveAllBtn) approveAllBtn.style.display = 'inline-flex';

    el.innerHTML = `<div class="evo-proposals-grid">${proposals.map(p => renderProposalCard(p)).join('')}</div>`;

    // Wire approve/reject buttons
    el.querySelectorAll('.evo-btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await api.post(`/evolution/proposals/${id}/approve`);
          showToast(t('evolution.proposal_approved'), 'success');
          btn.closest('.evolution-proposal-card').style.opacity = '0.4';
          btn.closest('.evolution-proposal-card').style.pointerEvents = 'none';
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    el.querySelectorAll('.evo-btn-reject').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await api.post(`/evolution/proposals/${id}/reject`);
          showToast(t('evolution.proposal_rejected'), 'info');
          btn.closest('.evolution-proposal-card').style.opacity = '0.4';
          btn.closest('.evolution-proposal-card').style.pointerEvents = 'none';
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">${t('evolution.backend_offline')}</div>
      </div>
    `;
    if (approveAllBtn) approveAllBtn.style.display = 'none';
  }
}

function renderProposalCard(p) {
  const dimColor = DIM_COLORS[p.dimension] || '#8890b5';
  const dimLabel = DIM_LABELS[p.dimension] || p.dimension;
  const quality = Math.round((p.quality_score || 0) * 100);
  const impact = Math.round((p.impact_score || 0) * 100);
  const novelty = Math.round((p.novelty_score || 0) * 100);

  return `
    <div class="evolution-proposal-card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
        <span class="evo-dim-badge" style="--dim-color: ${dimColor};">${dimLabel}</span>
        ${p.source_url ? `<a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener" class="evo-source-link" title="${escapeHTML(p.source_title || '')}">🔗</a>` : ''}
      </div>
      ${p.source_title ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📄 ${escapeHTML(p.source_title)}</div>` : ''}
      <div style="font-size: 0.84rem; color: var(--text-primary); line-height: 1.5; margin-bottom: 12px;">${escapeHTML(p.text || p.checkpoint_text || '')}</div>
      <div class="evo-score-bars">
        <div class="score-bar-row">
          <span class="score-bar-label">${t('evolution.quality')}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width: ${quality}%; background: #22c55e;"></div></div>
          <span class="score-bar-value" style="color: #22c55e;">${quality}</span>
        </div>
        <div class="score-bar-row">
          <span class="score-bar-label">${t('evolution.impact')}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width: ${impact}%; background: #3b82f6;"></div></div>
          <span class="score-bar-value" style="color: #3b82f6;">${impact}</span>
        </div>
        <div class="score-bar-row">
          <span class="score-bar-label">${t('evolution.novelty')}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width: ${novelty}%; background: #a855f7;"></div></div>
          <span class="score-bar-value" style="color: #a855f7;">${novelty}</span>
        </div>
      </div>
      <div class="evo-proposal-actions">
        <button class="btn btn-sm evo-btn-approve" data-id="${p.id}" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3);">
          ✓ ${t('evolution.approve')}
        </button>
        <button class="btn btn-sm evo-btn-reject" data-id="${p.id}" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2);">
          ✕ ${t('evolution.reject')}
        </button>
      </div>
    </div>
  `;
}

async function loadSnapshots() {
  const el = document.getElementById('evo-snapshots');
  try {
    const snapshots = await api.get('/evolution/snapshots');

    if (!snapshots || snapshots.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">${t('evolution.snapshots_empty')}</div>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="evo-snapshots-table">
        <div class="evo-snapshots-header">
          <span>Version</span>
          <span>Checkpoints</span>
          <span>${t('evolution.date')}</span>
          <span></span>
        </div>
        ${snapshots.map((s, idx) => {
          const date = new Date(s.created_at || s.date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          const isCurrent = idx === 0 || s.is_current;
          return `
            <div class="evolution-snapshot-row ${isCurrent ? 'current' : ''}">
              <span class="evo-snapshot-version">
                ${isCurrent ? '<span class="evo-current-badge">current</span>' : ''}
                ${escapeHTML(s.version || `v${snapshots.length - idx}`)}
              </span>
              <span class="evo-snapshot-count">${s.checkpoint_count || '—'}</span>
              <span class="evo-snapshot-date">${date}</span>
              <span>
                ${!isCurrent ? `<button class="btn btn-ghost btn-sm evo-btn-rollback" data-id="${s.id}" data-version="${escapeHTML(s.version || '')}">
                  ↩ ${t('evolution.rollback')}
                </button>` : ''}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Rollback handlers
    el.querySelectorAll('.evo-btn-rollback').forEach(btn => {
      btn.addEventListener('click', async () => {
        const version = btn.dataset.version;
        if (!confirm(t('evolution.rollback_confirm').replace('{version}', version))) return;

        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          await api.post(`/evolution/snapshots/${btn.dataset.id}/rollback`);
          showToast(t('evolution.rollback_success').replace('{version}', version), 'success');
          loadSnapshots();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = `↩ ${t('evolution.rollback')}`;
        }
      });
    });
  } catch {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">${t('evolution.backend_offline')}</div>
      </div>
    `;
  }
}

// ── Actions ──────────────────────────────────────────────────

async function triggerEvolution() {
  const btn = document.getElementById('evo-btn-run');
  btn.disabled = true;
  btn.textContent = '⏳ ' + t('evolution.running');

  try {
    await api.post('/evolution/trigger');
    showToast(t('evolution.trigger_success'), 'success');
    // Reload all data
    await loadEvolutionData();
  } catch (err) {
    showToast(t('evolution.trigger_error') + ': ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ ' + t('evolution.run_now');
  }
}

async function scanRedundancies() {
  const btn = document.getElementById('evo-btn-scan');
  const el = document.getElementById('evo-redundancies');
  btn.disabled = true;
  btn.textContent = '⏳ ' + t('evolution.scanning');

  try {
    const data = await api.get('/evolution/redundancies');
    const pairs = data.pairs || data.redundancies || data;

    if (!pairs || pairs.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-text">${t('evolution.no_redundancies')}</div>
        </div>
      `;
      return;
    }

    el.innerHTML = pairs.map(pair => {
      const similarity = Math.round((pair.similarity || 0) * 100);
      return `
        <div class="evolution-redundancy-pair">
          <div class="evo-redundancy-cards">
            <div class="evo-redundancy-item">
              <div style="font-size: 0.68rem; color: var(--text-muted); margin-bottom: 4px;">${escapeHTML(pair.checkpoint_a?.id || 'A')}</div>
              <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.5;">${escapeHTML(pair.checkpoint_a?.text || pair.text_a || '')}</div>
            </div>
            <div class="evo-similarity-badge">${similarity}%<br><span style="font-size: 0.6rem; font-weight: 400;">${t('evolution.similarity')}</span></div>
            <div class="evo-redundancy-item">
              <div style="font-size: 0.68rem; color: var(--text-muted); margin-bottom: 4px;">${escapeHTML(pair.checkpoint_b?.id || 'B')}</div>
              <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.5;">${escapeHTML(pair.checkpoint_b?.text || pair.text_b || '')}</div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 12px;">
            <button class="btn btn-sm btn-secondary evo-btn-merge" data-pair-id="${pair.id}" style="background: rgba(124,58,237,0.1); color: #a855f7; border: 1px solid rgba(124,58,237,0.25);">
              🔀 ${t('evolution.merge')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Merge handlers
    el.querySelectorAll('.evo-btn-merge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pairId = btn.dataset.pairId;
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          await api.post('/evolution/redundancies/merge', { pair_id: pairId });
          showToast(t('evolution.merge_success'), 'success');
          btn.closest('.evolution-redundancy-pair').style.opacity = '0.3';
          btn.closest('.evolution-redundancy-pair').style.pointerEvents = 'none';
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = `🔀 ${t('evolution.merge')}`;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${err.message}</div>
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔬 ' + t('evolution.scan_redundancies');
  }
}

async function bulkApprove() {
  const btn = document.getElementById('evo-btn-approve-all');
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    await api.post('/evolution/proposals/bulk-approve');
    showToast(t('evolution.bulk_approved'), 'success');
    await loadProposals();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = `✓ ${t('evolution.approve_all')}`;
  }
}

async function openConfig() {
  const modal = document.getElementById('evo-config-modal');
  const body = document.getElementById('evo-config-body');
  modal.style.display = 'flex';

  try {
    const config = await api.get('/evolution/config');
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">${t('evolution.config_schedule')}</label>
          <input class="input" id="evo-cfg-schedule" value="${escapeHTML(config.schedule || 'weekly')}" />
        </div>
        <div>
          <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">${t('evolution.config_auto_approve')}</label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer;">
            <input type="checkbox" id="evo-cfg-auto" ${config.auto_approve ? 'checked' : ''} style="accent-color: #7c3aed;" />
            ${t('evolution.config_auto_approve_label')}
          </label>
        </div>
        <div>
          <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">${t('evolution.config_quality_threshold')}</label>
          <input class="input" type="number" id="evo-cfg-threshold" min="0" max="100" step="5" value="${config.quality_threshold || 70}" />
        </div>
        <button class="btn btn-primary" id="evo-cfg-save" style="background: linear-gradient(135deg, #7c3aed, #2563eb); border: none; margin-top: 8px;">
          💾 ${t('evolution.config_save')}
        </button>
      </div>
    `;

    document.getElementById('evo-cfg-save')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('evo-cfg-save');
      saveBtn.disabled = true;
      try {
        const payload = {
          schedule: document.getElementById('evo-cfg-schedule').value,
          auto_approve: document.getElementById('evo-cfg-auto').checked,
          quality_threshold: parseInt(document.getElementById('evo-cfg-threshold').value),
        };
        // Use raw fetch for PUT since api client may not have put()
        const res = await fetch('/api/evolution/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        showToast(t('evolution.config_saved'), 'success');
        closeConfig();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  } catch (err) {
    body.innerHTML = `<div style="padding: 16px; font-size: 0.85rem; color: var(--accent-red);">⚠️ ${err.message}</div>`;
  }
}

function closeConfig() {
  const modal = document.getElementById('evo-config-modal');
  if (modal) modal.style.display = 'none';
}

// ── Chart Rendering ──────────────────────────────────────────

function renderGrowthChart(data) {
  const canvas = document.getElementById('evo-growth-chart');
  if (!canvas) return;

  if (growthChart) growthChart.destroy();

  const labels = data.labels || [];
  const datasets = Object.entries(DIM_COLORS).map(([dimId, color]) => ({
    label: DIM_LABELS[dimId] || dimId,
    data: data[dimId] || [],
    borderColor: color,
    backgroundColor: color + '18',
    fill: true,
    tension: 0.4,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2,
  })).filter(ds => ds.data.length > 0);

  // Fallback: if no per-dimension data, try total
  if (datasets.length === 0 && data.total) {
    datasets.push({
      label: 'Total Checkpoints',
      data: data.total,
      borderColor: '#7c3aed',
      backgroundColor: 'rgba(124, 58, 237, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2,
    });
  }

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = `
      <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center;">
        <div>
          <div class="empty-state-icon">📈</div>
          <div class="empty-state-text">${t('evolution.no_growth_data')}</div>
        </div>
      </div>
    `;
    return;
  }

  growthChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(10, 14, 35, 0.95)',
          titleColor: '#e8eaf6',
          bodyColor: '#8890b5',
          borderColor: 'rgba(124, 58, 237, 0.3)',
          borderWidth: 1,
          padding: 12,
        },
        legend: {
          display: datasets.length > 1,
          labels: {
            color: '#8890b5',
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 10 },
            padding: 16,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505882', font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505882', font: { size: 10 } },
        },
      },
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────

function formatCountdown(nextRun) {
  const diff = new Date(nextRun) - new Date();
  if (diff <= 0) return t('evolution.imminent');
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function animateCounter(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  const duration = 1200;
  const start = performance.now();
  const from = 0;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function renderTrend(elId, trend) {
  const el = document.getElementById(elId);
  if (!el || trend == null) return;
  if (trend > 0) {
    el.innerHTML = `<span style="color: #22c55e; font-size: 0.72rem; font-weight: 600;">↑ +${trend}</span>`;
  } else if (trend < 0) {
    el.innerHTML = `<span style="color: #ef4444; font-size: 0.72rem; font-weight: 600;">↓ ${trend}</span>`;
  }
}

function drawSparkline(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data) || 0;
  const range = max - min || 1;
  const step = w / (data.length - 1);

  ctx.clearRect(0, 0, w, h);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(124, 58, 237, 0.3)');
  grad.addColorStop(1, 'rgba(124, 58, 237, 0)');

  ctx.beginPath();
  ctx.moveTo(0, h - ((data[0] - min) / range) * h);
  data.forEach((v, i) => {
    ctx.lineTo(i * step, h - ((v - min) / range) * (h - 4) - 2);
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(0, h - ((data[0] - min) / range) * (h - 4) - 2);
  data.forEach((v, i) => {
    ctx.lineTo(i * step, h - ((v - min) / range) * (h - 4) - 2);
  });
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
