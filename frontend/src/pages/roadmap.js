/**
 * Roadmap Page — Gap analysis with prioritized action items.
 * Shows what's needed to reach the next maturity level.
 */
import { api, showToast, getLevelBadge, getScoreColor, LEVEL_NAMES, renderEvidenceTags } from '../main.js';

import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

let roadmapData = null;

export function renderRoadmap(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">${t('roadmap.title')}</h1>
          <p class="page-description">${t('roadmap.desc')}</p>
        </div>
        <div class="flex gap-md">
          <button class="btn btn-secondary btn-sm" id="btn-export-md">${t('roadmap.exportMd')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-export-pdf">${t('roadmap.exportPdf')}</button>
        </div>
      </div>
    </div>

    <div class="card mb-xl">
      <div class="card-header">
        <span class="card-title">${t('roadmap.targetConfig')}</span>
      </div>
      <div class="flex gap-md items-center" style="flex-wrap: wrap;">
        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('roadmap.targetLevel')}</label>
          <div class="flex gap-sm" id="target-level-selector">
            ${[1,2,3,4,5].map(l => `
              <button class="btn btn-sm target-level-btn ${l === 3 ? 'active' : ''}" data-level="${l}"
                style="--level-color: ${['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6'][l]}">
                L${l} ${LEVEL_NAMES[l]}
              </button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn-primary" id="btn-generate" style="margin-left: auto;">${t('roadmap.generateBtn')}</button>
      </div>
    </div>

    <div id="roadmap-summary" style="display: none;" class="mb-xl">
      <div class="grid-4 mb-lg">
        <div class="card stat-card">
          <div class="stat-value gradient-blue" id="rm-current-score">—</div>
          <div class="stat-label">${t('roadmap.currentScore')}</div>
        </div>
        <div class="card stat-card">
          <div id="rm-current-level" style="margin-bottom: 8px">—</div>
          <div class="stat-label">${t('roadmap.currentLevel')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value gradient-warm" id="rm-total-gaps">0</div>
          <div class="stat-label">${t('roadmap.openGaps')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value gradient-green" id="rm-quick-wins">0</div>
          <div class="stat-label">${t('roadmap.quickWins')}</div>
        </div>
      </div>
    </div>

    <div id="roadmap-content" class="mb-xl" style="display: none;">
      <div class="card mb-lg" id="quick-wins-card" style="display: none;">
        <div class="card-header">
          <span class="card-title">${t('roadmap.qwTitle')}</span>
        </div>
        <div id="quick-wins-list"></div>
      </div>

      <div class="card mb-lg" id="dimension-gaps-card">
        <div class="card-header">
          <span class="card-title">${t('roadmap.gapsTitle')}</span>
        </div>
        <div id="dimension-gaps-chart"></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">${t('roadmap.fullRoadmapTitle')}</span>
          <span class="card-subtitle" id="roadmap-count"></span>
        </div>
        <div id="roadmap-items-list"></div>
      </div>
    </div>

    <div id="roadmap-empty" class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🗺️</div>
        <div class="empty-state-text">${t('roadmap.emptyStateMsg')}</div>
      </div>
    </div>
  `;

  setupRoadmapEvents();
}

let targetLevel = 3;

function setupRoadmapEvents() {
  // Target level selector
  document.querySelectorAll('.target-level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.target-level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      targetLevel = parseInt(btn.dataset.level);
    });
  });

  // Generate button
  document.getElementById('btn-generate').addEventListener('click', generateRoadmap);

  // Export buttons
  document.getElementById('btn-export-md').addEventListener('click', () => exportReport('markdown'));
  document.getElementById('btn-export-pdf').addEventListener('click', () => exportReport('pdf'));
}

async function generateRoadmap() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.textContent = t('roadmap.generatingBtn');

  try {
    roadmapData = await api.get(`/roadmap/from-latest?target_level=${targetLevel}`);
    renderRoadmapResults();
    showToast(t('roadmap.roadmapGenerated').replace('{count}', roadmapData.total_gaps), 'success');
  } catch (e) {
    // Try with empty assessments
    try {
      roadmapData = await api.post('/roadmap/generate', {
        target_level: targetLevel,
        assessments: {},
      });
      renderRoadmapResults();
    } catch {
      showToast(t('roadmap.roadmapFailed'), 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = t('roadmap.generateBtn');
  }
}

function renderRoadmapResults() {
  if (!roadmapData) return;

  // Show sections
  document.getElementById('roadmap-summary').style.display = 'block';
  document.getElementById('roadmap-content').style.display = 'block';
  document.getElementById('roadmap-empty').style.display = 'none';

  // Summary stats
  document.getElementById('rm-current-score').textContent = Math.round(roadmapData.current_score);
  document.getElementById('rm-current-level').innerHTML = getLevelBadge(roadmapData.current_level);
  document.getElementById('rm-total-gaps').textContent = roadmapData.total_gaps;
  document.getElementById('rm-quick-wins').textContent = roadmapData.quick_wins?.length || 0;

  // Quick wins
  const qwCard = document.getElementById('quick-wins-card');
  const qwList = document.getElementById('quick-wins-list');
  if (roadmapData.quick_wins?.length > 0) {
    qwCard.style.display = 'block';
    qwList.innerHTML = roadmapData.quick_wins.map(item => renderRoadmapItem(item, true)).join('');
  } else {
    qwCard.style.display = 'none';
  }

  // Dimension gaps chart
  renderDimensionGaps(roadmapData.dimension_gaps);

  // Full roadmap
  const count = document.getElementById('roadmap-count');
  count.textContent = t('roadmap.roadmapItemsCount').replace('{count}', roadmapData.items.length).replace('{level}', targetLevel).replace('{levelName}', LEVEL_NAMES[targetLevel]);

  const itemsList = document.getElementById('roadmap-items-list');
  itemsList.innerHTML = roadmapData.items.map(item => renderRoadmapItem(item)).join('');
}

function renderRoadmapItem(item, isQuickWin = false) {
  const effortColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
  const effortLabels = { low: t('roadmap.effortLow'), medium: t('roadmap.effortMed'), high: t('roadmap.effortHigh') };
  const effortColor = effortColors[item.effort] || '#8890b5';

  return `
    <div class="roadmap-item ${isQuickWin ? 'quick-win' : ''} fade-in">
      <div class="roadmap-item-header">
        <div class="flex items-center gap-md">
          <span class="roadmap-priority" style="color: ${getScoreColor(item.priority_score)}">
            ${item.priority_score.toFixed(0)}
          </span>
          <span style="font-size: 1.2rem">${item.dimension_icon}</span>
          <div>
            <div class="roadmap-item-title">${item.checkpoint_text}</div>
            <div class="roadmap-item-meta">
              <span class="roadmap-dim-badge">${item.dimension_name}</span>
              <span class="roadmap-effort" style="--effort-color: ${effortColor}">
                ${t('roadmap.effortSuffix').replace('{effort}', effortLabels[item.effort])}
              </span>
              <span style="font-size: 0.7rem; color: var(--text-muted)">${t('roadmap.levelPlus').replace('{level}', item.min_level)}</span>
            </div>
          </div>
        </div>
        ${isQuickWin ? `<span class="quick-win-badge">${t('roadmap.qwBadge')}</span>` : ''}
      </div>
      <div class="roadmap-item-tags">
        ${renderEvidenceTags(item.evidence_tags || [])}
      </div>
    </div>
  `;
}

function renderDimensionGaps(gaps) {
  const container = document.getElementById('dimension-gaps-chart');
  if (!container || !gaps) return;

  const maxGap = Math.max(...Object.values(gaps), 1);

  const dimMeta = {
    strategy: { name: 'Strategy', icon: '🎯' },
    data: { name: 'Data & Infra', icon: '🗄️' },
    governance: { name: 'Governance', icon: '⚖️' },
    technology: { name: 'Tech & MLOps', icon: '⚙️' },
    talent: { name: 'Talent', icon: '👥' },
    ethics: { name: 'Ethics & RAI', icon: '🛡️' },
    processes: { name: 'Processes', icon: '🔄' },
  };

  container.innerHTML = Object.entries(gaps).map(([dimId, count]) => {
    const meta = dimMeta[dimId] || { name: dimId, icon: '📋' };
    const pct = (count / maxGap * 100);
    const color = count === 0 ? '#10b981' : count <= 3 ? '#eab308' : '#ef4444';
    return `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <span style="font-size: 1rem; width: 24px">${meta.icon}</span>
        <span style="font-size: 0.82rem; width: 100px; font-weight: 500">${t('dimensions.' + dimId)}</span>
        <div style="flex: 1">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%; background: ${color}; transition: width 0.8s ease;"></div>
          </div>
        </div>
        <span style="font-size: 0.82rem; font-weight: 600; color: ${color}; min-width: 30px; text-align: right">${count}</span>
      </div>
    `;
  }).join('');
}

async function exportReport(format) {
  try {
    await api.postDownload(`/export/${format}`, {});
    showToast(t('roadmap.exportSuccess').replace('{format}', format.toUpperCase()), 'success');
  } catch (e) {
    showToast(t('roadmap.exportFailed').replace('{msg}', e.message), 'error');
  }
}
