/**
 * Framework Builder Page — Enhanced with Research Coverage Analysis,
 * auto-enriched proposals with evidence tags, and Activity Log.
 */
import { api, showToast } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

const DIM_LABELS = {
  strategy: { name: 'Strategy', icon: '🎯' },
  data: { name: 'Data & Infra', icon: '🗄️' },
  governance: { name: 'Governance', icon: '⚖️' },
  technology: { name: 'Tech & MLOps', icon: '⚙️' },
  talent: { name: 'Talent', icon: '👥' },
  ethics: { name: 'Ethics', icon: '🛡️' },
  processes: { name: 'Processes', icon: '🔄' },
};

let proposedCheckpoints = [];

export function renderFrameworkBuilder(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('builder.title')}</h1>
      <p class="page-description">${t('builder.desc')}</p>
    </div>

    <div class="card mb-xl" id="coverage-card">
      <div class="card-header" style="cursor: pointer;" id="coverage-toggle">
        <span class="card-title">${t('builder.coverageTitle')}</span>
        <span class="expand-icon" id="coverage-arrow">▼</span>
      </div>
      <div id="coverage-content" style="display: none;">
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6;">
          ${t('builder.coverageDesc')}
        </div>
        <div id="coverage-data">
          <div class="loading-overlay" style="padding: 24px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>

    <div class="card mb-xl">
      <div class="card-header">
        <span class="card-title">${t('builder.step1Title')}</span>
      </div>
      <div>
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${t('builder.step1Desc')}</label>
        <div class="flex gap-sm">
          <select id="builder-source-select" class="input" style="flex: 1;">
            <option value="">${t('builder.loadingSources')}</option>
          </select>
          <button class="btn btn-primary btn-sm" id="btn-extract" disabled style="white-space: nowrap;">${t('builder.extractBtn')}</button>
        </div>
      </div>
      
      <div id="extract-progress" style="display: none;" class="mt-md">
        <div class="flex items-center gap-md" style="margin-bottom: 8px;">
          <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
          <span style="font-size: 0.85rem; color: var(--text-secondary);">${t('builder.extractingMsg')}</span>
        </div>
      </div>
    </div>

    <div class="card" id="proposals-card" style="display: none;">
      <div class="card-header" style="justify-content: space-between;">
        <span class="card-title">${t('builder.step2Title')}</span>
        <button class="btn btn-primary btn-sm" id="btn-integrate" disabled>${t('builder.integrateBtn').replace('{count}', 0)}</button>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
        ${t('builder.step2Desc')}
      </div>
      <div id="proposals-list" class="grid-2">
      </div>
    </div>

    <div class="card mt-xl" id="activity-card">
      <div class="card-header" style="cursor: pointer;" id="activity-toggle">
        <span class="card-title">${t('builder.activityTitle')}</span>
        <span class="expand-icon" id="activity-arrow">▼</span>
      </div>
      <div id="activity-content" style="display: none;">
        <div id="activity-list">
          <div class="loading-overlay" style="padding: 24px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  setupToggles();
  loadSources();
}

function setupToggles() {
  // Coverage panel toggle
  document.getElementById('coverage-toggle')?.addEventListener('click', function() {
    var content = document.getElementById('coverage-content');
    var arrow = document.getElementById('coverage-arrow');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▲';
      loadCoverage();
    } else {
      content.style.display = 'none';
      arrow.textContent = '▼';
    }
  });

  // Activity panel toggle
  document.getElementById('activity-toggle')?.addEventListener('click', function() {
    var content = document.getElementById('activity-content');
    var arrow = document.getElementById('activity-arrow');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▲';
      loadActivity();
    } else {
      content.style.display = 'none';
      arrow.textContent = '▼';
    }
  });
}

// ── Research Coverage Analysis ─────────────────────────────────────────────

async function loadCoverage() {
  var container = document.getElementById('coverage-data');
  if (!container) return;

  try {
    var data = await api.get('/framework/coverage');
    var coverage = data.coverage || [];

    if (coverage.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${t('builder.noCoverageData')}</div></div>`;
      return;
    }

    var statusColors = {
      'well-covered': '#10b981',
      'moderate': '#f59e0b',
      'under-researched': '#ef4444',
    };

    var html = '<div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">';
    html += '<div style="text-align:center;padding:8px 16px;background:rgba(59,130,246,0.06);border-radius:8px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent-blue);">' + data.total_checkpoints + '</div><div style="font-size:0.7rem;color:var(--text-muted);">' + t('builder.checkpointsStat') + '</div></div>';
    html += '<div style="text-align:center;padding:8px 16px;background:rgba(16,185,129,0.06);border-radius:8px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent-emerald);">' + data.total_sources + '</div><div style="font-size:0.7rem;color:var(--text-muted);">' + t('builder.sourcesStat') + '</div></div>';
    html += '<div style="text-align:center;padding:8px 16px;background:rgba(139,92,246,0.06);border-radius:8px;"><div style="font-size:1.2rem;font-weight:700;color:#8b5cf6;">' + data.total_fb_additions + '</div><div style="font-size:0.7rem;color:var(--text-muted);">' + t('builder.builderAdditionsStat') + '</div></div>';
    html += '</div>';

    html += '<div style="display: grid; gap: 8px;">';
    coverage.forEach(function(c) {
      var sc = statusColors[c.status] || '#8890b5';
      var pct = Math.round(c.coverage_ratio * 100);
      var dim = DIM_LABELS[c.dimension_id] || { name: c.dimension_name, icon: c.icon };
      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;">';
      html += '<span style="font-size:1.2rem;">' + c.icon + '</span>';
      html += '<div style="flex:1;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
      html += '<span style="font-size:0.82rem;font-weight:500;color:var(--text-primary);">' + t('dimensions.' + c.dimension_id) + '</span>';
      html += '<span style="font-size:0.65rem;padding:2px 8px;border-radius:999px;background:' + sc + '20;color:' + sc + ';font-weight:600;">' + c.status + '</span>';
      html += '</div>';
      html += '<div style="display:flex;gap:16px;font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">';
      html += '<span>' + t('builder.checkpointsLabel').replace('{count}', c.checkpoints) + '</span>';
      html += '<span>' + t('builder.sourcesLabel').replace('{count}', c.research_sources) + '</span>';
      if (c.framework_builder_additions > 0) {
        html += '<span style="color:#8b5cf6;">' + t('builder.builtLabel').replace('{count}', c.framework_builder_additions) + '</span>';
      }
      html += '</div>';
      html += '<div style="height:4px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">';
      html += '<div style="height:100%;width:' + pct + '%;background:' + sc + ';border-radius:4px;transition:width 0.5s ease;"></div>';
      html += '</div>';
      html += '</div>';
      if (c.status === 'under-researched') {
        html += '<a href="#research" style="font-size:0.7rem;color:var(--accent-blue);text-decoration:none;white-space:nowrap;" title="Research this dimension">' + t('builder.researchBtn') + '</a>';
      }
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);">${t('builder.failedLoadCoverage')}</div>`;
  }
}

// ── Activity Log ───────────────────────────────────────────────────────────

async function loadActivity() {
  var container = document.getElementById('activity-list');
  if (!container) return;

  try {
    var data = await api.get('/research/activity?limit=20');
    var activities = data.activities || [];

    if (activities.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${t('builder.noActivity')}</div></div>`;
      return;
    }

    var actionIcons = {
      'research_completed': '🔬',
      'extracted_for_framework': '🏗️',
      'checkpoint_integrated': '✅',
    };

    var actionLabels = {
      'research_completed': t('builder.actionResearch'),
      'extracted_for_framework': t('builder.actionExtracted'),
      'checkpoint_integrated': t('builder.actionIntegrated'),
    };

    var html = '<div style="display: grid; gap: 6px;">';
    activities.forEach(function(a) {
      var icon = actionIcons[a.action] || '📋';
      var label = actionLabels[a.action] || a.action;
      var details = a.details || {};
      var time = a.created_at ? new Date(a.created_at).toLocaleString('de-DE') : '';
      var detailText = '';
      if (details.title) detailText = details.title;
      if (details.text) detailText = details.text;
      if (details.stored) detailText = t('builder.sourcesStored').replace('{count}', details.stored);
      if (details.proposals_count) detailText += ' ' + t('builder.proposalsCount').replace('{count}', details.proposals_count);

      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;font-size:0.78rem;">';
      html += '<span style="font-size:1rem;">' + icon + '</span>';
      html += '<div style="flex:1;">';
      html += '<span style="color:var(--text-primary);font-weight:500;">' + label + '</span>';
      if (detailText) {
        html += ' <span style="color:var(--text-muted);">— ' + detailText + '</span>';
      }
      html += '</div>';
      html += '<span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' + time + '</span>';
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);">${t('builder.failedLoadActivity')}</div>`;
  }
}

// ── Source Selection & Extraction ──────────────────────────────────────────

async function loadSources() {
  var select = document.getElementById('builder-source-select');
  var btn = document.getElementById('btn-extract');
  if (!select || !btn) return;

  try {
    var analyses = await api.get('/analysis');
    // Filter to only Text documents (Research Agent imports)
    var txtSources = analyses.filter(function(a) { return a.file_type === '.txt'; });

    if (txtSources.length === 0) {
      select.innerHTML = `<option value="">${t('builder.noSourcesMsg')}</option>`;
      return;
    }

    select.innerHTML = `<option value="">${t('builder.chooseSource')}</option>` + txtSources.map(function(s) {
      return '<option value="' + s.id + '">' + s.document_name + ' (' + new Date(s.created_at).toLocaleDateString() + ')</option>';
    }).join('');

    select.addEventListener('change', function() {
      btn.disabled = !select.value;
    });

    btn.addEventListener('click', extractInsights);
  } catch (e) {
    select.innerHTML = `<option value="">${t('builder.failedLoadSources')}</option>`;
  }
}

async function extractInsights() {
  var select = document.getElementById('builder-source-select');
  var btn = document.getElementById('btn-extract');
  var docId = select.value;
  if (!docId) return;

  btn.disabled = true;
  document.getElementById('builder-source-select').disabled = true;
  document.getElementById('extract-progress').style.display = 'block';
  document.getElementById('proposals-card').style.display = 'none';

  try {
    var res = await api.post('/framework/extract', { document_id: docId });
    proposedCheckpoints = res.proposals || [];
    renderProposals();
  } catch (e) {
    showToast(t('builder.extractionFailed').replace('{msg}', e.message), 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('builder-source-select').disabled = false;
    document.getElementById('extract-progress').style.display = 'none';
  }
}

// ── Proposal Rendering ────────────────────────────────────────────────────

function renderProposals() {
  var list = document.getElementById('proposals-list');
  var card = document.getElementById('proposals-card');
  var btn = document.getElementById('btn-integrate');
  
  if (proposedCheckpoints.length === 0) {
    list.innerHTML = `<div style="grid-column: 1 / -1;" class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">${t('builder.noNovelInsights')}</div></div>`;
    btn.disabled = true;
    btn.textContent = t('builder.integrateBtn').replace('{count}', 0);
    card.style.display = 'block';
    return;
  }

  var html = '';
  proposedCheckpoints.forEach(function(p) {
    // Render evidence tags if auto-enriched
    var tagsHtml = '';
    if (p.evidence_tags && p.evidence_tags.length > 0) {
      tagsHtml = '<div style="margin-top: 8px; padding: 6px 8px; background: rgba(59,130,246,0.04); border-radius: 6px;">';
      tagsHtml += `<div style="font-size: 0.65rem; color: var(--accent-blue); font-weight: 600; margin-bottom: 4px;">${t('builder.linkedEvidence')}</div>`;
      p.evidence_tags.forEach(function(t) {
        var shortSrc = (t.source || '').split(' ').slice(0, 4).join(' ');
        tagsHtml += '<div style="font-size: 0.65rem; color: var(--text-muted); padding: 1px 0;">• ' + shortSrc;
        if (t.reference) tagsHtml += ' — <span style="color:var(--text-secondary);">' + t.reference + '</span>';
        tagsHtml += '</div>';
      });
      tagsHtml += '</div>';
    }

    html += '<div class="card" style="border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s ease;" id="prop-' + p.id + '">';
    html += '<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px;">';
    html += '<label style="display: flex; align-items: flex-start; gap: 12px; cursor: pointer; flex: 1;">';
    html += '<input type="checkbox" class="proposal-checkbox" value="' + p.id + '" checked style="margin-top: 4px;" />';
    html += '<div>';
    html += '<div style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">' + p.text + '</div>';
    html += '<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">' + p.text_de + '</div>';
    html += '</div></label></div>';
    html += '<div style="background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; margin-bottom: 8px;">';
    html += '<div style="color: var(--accent-emerald); font-weight: 600; margin-bottom: 2px;">' + t('builder.targetDimension') + ' ' + t('dimensions.' + p.dimension_id) + '</div>';
    html += '<div style="color: var(--text-secondary);"><strong>' + t('builder.rationale') + '</strong> ' + p.rationale + '</div>';
    html += '</div>';
    html += tagsHtml;
    html += '<div style="display: flex; gap: 8px; margin-top: 8px;">';
    html += '<span style="font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">' + t('builder.minLevel') + ' ' + p.min_level + '</span>';
    html += '<span style="font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">' + p.category + '</span>';
    html += '</div></div>';
  });

  list.innerHTML = html;
  card.style.display = 'block';
  
  // Attach checkbox listeners
  var checkboxes = document.querySelectorAll('.proposal-checkbox');
  var updateBtnState = function() {
    var checkedCount = Array.from(checkboxes).filter(function(cb) { return cb.checked; }).length;
    btn.disabled = checkedCount === 0;
    btn.textContent = t('builder.integrateBtn').replace('{count}', checkedCount);
    
    // Highlight selected cards
    checkboxes.forEach(function(cb) {
      var parentCard = document.getElementById('prop-' + cb.value);
      if (cb.checked) {
        parentCard.style.borderColor = 'var(--accent-blue)';
        parentCard.style.background = 'rgba(59, 130, 246, 0.05)';
      } else {
        parentCard.style.borderColor = 'var(--border-color)';
        parentCard.style.background = 'var(--bg-card)';
      }
    });
  };
  
  checkboxes.forEach(function(cb) { cb.addEventListener('change', updateBtnState); });
  // Initial highlight
  updateBtnState();

  // Attach integrate listener
  btn.onclick = async function() {
    var selectedIds = Array.from(checkboxes).filter(function(cb) { return cb.checked; }).map(function(cb) { return cb.value; });
    var selectedCheckpoints = proposedCheckpoints.filter(function(p) { return selectedIds.includes(p.id); });
    
    if (selectedCheckpoints.length === 0) return;
    
    btn.disabled = true;
    btn.textContent = t('builder.integrating');
    
    try {
      var res = await api.post('/framework/integrate', { checkpoints: selectedCheckpoints });
      showToast(t('builder.integrationSuccess').replace('{count}', res.added || 0), 'success');
      // Remove integrated proposals from UI
      proposedCheckpoints = proposedCheckpoints.filter(function(p) { return !selectedIds.includes(p.id); });
      renderProposals();
      // Refresh coverage if visible
      var covContent = document.getElementById('coverage-content');
      if (covContent && covContent.style.display !== 'none') {
        loadCoverage();
      }
    } catch (e) {
      showToast(t('builder.integrationFailed').replace('{msg}', e.message), 'error');
      btn.disabled = false;
      btn.textContent = t('builder.integrateBtn').replace('{count}', selectedIds.length);
    }
  };
}
