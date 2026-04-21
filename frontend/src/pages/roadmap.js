/**
 * Roadmap Page — Gap analysis with prioritized action items.
 * Shows what's needed to reach the next maturity level.
 */
import { api, showToast, getLevelBadge, getScoreColor, LEVEL_NAMES, renderEvidenceTags } from '../main.js';

let roadmapData = null;

export function renderRoadmap(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Actionable Roadmap</h1>
          <p class="page-description">See what's needed to reach your next maturity level — prioritized by impact and effort.</p>
        </div>
        <div class="flex gap-md">
          <button class="btn btn-secondary btn-sm" id="btn-export-md">📄 Export MD</button>
          <button class="btn btn-secondary btn-sm" id="btn-export-pdf">📕 Export PDF</button>
        </div>
      </div>
    </div>

    <div class="card mb-xl">
      <div class="card-header">
        <span class="card-title">🎯 Target Configuration</span>
      </div>
      <div class="flex gap-md items-center" style="flex-wrap: wrap;">
        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Target Maturity Level</label>
          <div class="flex gap-sm" id="target-level-selector">
            ${[1,2,3,4,5].map(l => `
              <button class="btn btn-sm target-level-btn ${l === 3 ? 'active' : ''}" data-level="${l}"
                style="--level-color: ${['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6'][l]}">
                L${l} ${LEVEL_NAMES[l]}
              </button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn-primary" id="btn-generate" style="margin-left: auto;">Generate Roadmap</button>
      </div>
    </div>

    <div id="roadmap-summary" style="display: none;" class="mb-xl">
      <div class="grid-4 mb-lg">
        <div class="card stat-card">
          <div class="stat-value gradient-blue" id="rm-current-score">—</div>
          <div class="stat-label">Current Score</div>
        </div>
        <div class="card stat-card">
          <div id="rm-current-level" style="margin-bottom: 8px">—</div>
          <div class="stat-label">Current Level</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value gradient-warm" id="rm-total-gaps">0</div>
          <div class="stat-label">Open Gaps</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value gradient-green" id="rm-quick-wins">0</div>
          <div class="stat-label">Quick Wins</div>
        </div>
      </div>
    </div>

    <div id="roadmap-content" class="mb-xl" style="display: none;">
      <div class="card mb-lg" id="quick-wins-card" style="display: none;">
        <div class="card-header">
          <span class="card-title">⚡ Quick Wins — Low effort, high impact</span>
        </div>
        <div id="quick-wins-list"></div>
      </div>

      <div class="card mb-lg" id="dimension-gaps-card">
        <div class="card-header">
          <span class="card-title">📊 Gaps by Dimension</span>
        </div>
        <div id="dimension-gaps-chart"></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 Full Roadmap</span>
          <span class="card-subtitle" id="roadmap-count"></span>
        </div>
        <div id="roadmap-items-list"></div>
      </div>
    </div>

    <div id="roadmap-empty" class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🗺️</div>
        <div class="empty-state-text">Select a target level and click "Generate Roadmap" to see your prioritized action items.</div>
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
  btn.textContent = '⏳ Generating…';

  try {
    roadmapData = await api.get(`/roadmap/from-latest?target_level=${targetLevel}`);
    renderRoadmapResults();
    showToast(`Roadmap generated: ${roadmapData.total_gaps} gaps found`, 'success');
  } catch (e) {
    // Try with empty assessments
    try {
      roadmapData = await api.post('/roadmap/generate', {
        target_level: targetLevel,
        assessments: {},
      });
      renderRoadmapResults();
    } catch {
      showToast('Could not generate roadmap. Is the backend running?', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Roadmap';
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
  count.textContent = `${roadmapData.items.length} items · Target: Level ${targetLevel} ${LEVEL_NAMES[targetLevel]}`;

  const itemsList = document.getElementById('roadmap-items-list');
  itemsList.innerHTML = roadmapData.items.map(item => renderRoadmapItem(item)).join('');
}

function renderRoadmapItem(item, isQuickWin = false) {
  const effortColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
  const effortLabels = { low: 'Low', medium: 'Medium', high: 'High' };
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
                ${effortLabels[item.effort]} effort
              </span>
              <span style="font-size: 0.7rem; color: var(--text-muted)">Level ${item.min_level}+</span>
            </div>
          </div>
        </div>
        ${isQuickWin ? '<span class="quick-win-badge">⚡ Quick Win</span>' : ''}
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
        <span style="font-size: 0.82rem; width: 100px; font-weight: 500">${meta.name}</span>
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
    showToast(`${format.toUpperCase()} report downloaded!`, 'success');
  } catch (e) {
    showToast(`Export failed: ${e.message}`, 'error');
  }
}
