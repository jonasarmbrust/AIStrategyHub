/**
 * Framework Explorer — Visual matrix of Dimensions × Maturity Levels.
 * Browse aggregated best practices with full source traceability.
 */
import { api, getLevelBadge, LEVEL_NAMES, LEVEL_COLORS, renderEvidenceTags, getSourceColor } from '../main.js';

let maturityModel = null;

const FRAMEWORK_FILTERS = [
  { key: 'all', label: 'All Sources' },
  { key: 'NIST', label: 'NIST AI RMF' },
  { key: 'EU AI', label: 'EU AI Act' },
  { key: 'Google', label: 'Google' },
  { key: 'Microsoft', label: 'Microsoft RAI' },
  { key: 'OWASP', label: 'OWASP' },
  { key: 'UNESCO', label: 'UNESCO' },
];

export function renderExplorer(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Framework Explorer</h1>
      <p class="page-description">Browse the synthesized AI maturity matrix — every recommendation traced to its original source from NIST, EU AI Act, Google, Microsoft, OWASP, and UNESCO.</p>
    </div>

    <div class="card mb-lg">
      <div class="card-header">
        <span class="card-title">🔎 Filter by Source Framework</span>
        <span class="card-subtitle" id="filter-count"></span>
      </div>
      <div class="framework-filter-bar" id="framework-filters">
        ${FRAMEWORK_FILTERS.map(f => `
          <button class="btn btn-sm framework-filter-btn ${f.key === 'all' ? 'active' : ''}" data-filter="${f.key}"
            style="--filter-color: ${f.key === 'all' ? '#8890b5' : getSourceColor(f.key)}">
            ${f.label}
          </button>
        `).join('')}
      </div>
    </div>

    <div id="matrix-container">
      <div class="loading-overlay">
        <div class="spinner"></div>
        <span>Loading meta-model…</span>
      </div>
    </div>
  `;

  setupFilterEvents();
  loadModel();
}

let activeFilter = 'all';

function setupFilterEvents() {
  document.querySelectorAll('.framework-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.framework-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      if (maturityModel) renderMatrix();
    });
  });
}

async function loadModel() {
  try {
    maturityModel = await api.get('/checklist/model');
    renderMatrix();
  } catch {
    try {
      const res = await fetch('/dimensions-fallback.json');
      if (res.ok) {
        maturityModel = await res.json();
        renderMatrix();
      }
    } catch {
      document.getElementById('matrix-container').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-text">Could not load the maturity model.</div>
        </div>
      `;
    }
  }
}

function filterCheckpoints(checkpoints) {
  if (activeFilter === 'all') return checkpoints;
  return checkpoints.filter(cp => {
    const inSources = cp.sources?.some(s => s.includes(activeFilter));
    const inTags = cp.evidence_tags?.some(t => t.source.includes(activeFilter));
    return inSources || inTags;
  });
}

function renderMatrix() {
  const container = document.getElementById('matrix-container');
  if (!container || !maturityModel) return;

  const levels = maturityModel.maturity_levels || [];
  let totalVisible = 0;

  const dimensionCards = maturityModel.dimensions.map((dim, dimIdx) => {
    const filtered = filterCheckpoints(dim.checkpoints);
    totalVisible += filtered.length;

    // Group by level
    const byLevel = {};
    levels.forEach(l => { byLevel[l.level] = []; });
    filtered.forEach(cp => {
      if (byLevel[cp.min_level]) byLevel[cp.min_level].push(cp);
    });

    return `
      <div class="card matrix-dimension-card fade-in" style="animation-delay: ${dimIdx * 60}ms">
        <div class="matrix-dim-header">
          <div class="dimension-left">
            <span class="dimension-icon">${dim.icon}</span>
            <div>
              <div class="dimension-name">${dim.name}</div>
              <div class="dimension-meta">${filtered.length} checkpoints · Weight: ${Math.round(dim.weight * 100)}% · ${dim.description || ''}</div>
            </div>
          </div>
        </div>
        <div class="matrix-grid">
          ${levels.map(level => {
            const cps = byLevel[level.level] || [];
            return `
              <div class="matrix-cell" style="--level-color: ${level.color}">
                <div class="matrix-cell-header">
                  <span class="matrix-level-dot" style="background: ${level.color}"></span>
                  <span class="matrix-level-name">L${level.level} ${level.name}</span>
                  <span class="matrix-cell-count">${cps.length}</span>
                </div>
                <div class="matrix-cell-items">
                  ${cps.length === 0 ? '<div class="matrix-empty">—</div>' : cps.map(cp => renderExpandableCheckpoint(cp, level)).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Update filter count
  const countEl = document.getElementById('filter-count');
  if (countEl) {
    const total = maturityModel.dimensions.reduce((sum, d) => sum + d.checkpoints.length, 0);
    countEl.textContent = activeFilter === 'all'
      ? `${total} checkpoints across ${maturityModel.dimensions.length} dimensions`
      : `${totalVisible} of ${total} checkpoints match "${activeFilter}"`;
  }

  container.innerHTML = dimensionCards;

  // Bind expand events
  container.querySelectorAll('.matrix-checkpoint').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't toggle if clicking on deep dive button
      if (e.target.closest('.btn-deep-dive')) return;
      el.classList.toggle('expanded');
    });
  });

  // Bind deep dive events
  container.querySelectorAll('.btn-deep-dive').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cpId = btn.dataset.id;
      const cpText = btn.dataset.text;
      const resultDiv = document.getElementById(`deep-dive-result-${cpId}`);
      
      if (resultDiv.style.display === 'block') {
        resultDiv.style.display = 'none';
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Analyzing...';
      try {
        const res = await fetch('/api/analysis/deep-dive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cpText, context: `OAIMM Checkpoint ${cpId}` })
        });
        const data = await res.json();
        
        // Simple markdown parsing
        let html = data.markdown || '';
        html = html
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>')
          .replace(/^### (.*$)/gim, '<h4 style="margin-top:12px; margin-bottom:4px; font-weight:700; color:var(--text-primary);">$1</h4>')
          .replace(/^## (.*$)/gim, '<h3 style="margin-top:16px; margin-bottom:6px; font-weight:800; color:var(--accent-blue);">$1</h3>')
          .replace(/^# (.*$)/gim, '<h2>$1</h2>');
          
        resultDiv.innerHTML = `<p>${html}</p>`;
        resultDiv.style.display = 'block';
      } catch (e) {
        resultDiv.textContent = 'Failed to generate deep dive: ' + e.message;
        resultDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = '🤖 Deep Dive';
      }
    });
  });

  // Bind remove evidence events
  container.querySelectorAll('.btn-remove-evidence').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cpId = btn.dataset.cpid;
      const source = btn.dataset.source;
      const ref = btn.dataset.ref;
      
      if (!confirm(`Remove this evidence (${source}) from checkpoint ${cpId}?`)) return;
      
      btn.disabled = true;
      try {
        const res = await fetch('/api/ingest/evidence', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkpoint_id: cpId, source: source, reference: ref })
        });
        
        if (!res.ok) throw new Error('Deletion failed');
        
        // Re-load model and re-render matrix
        const modelRes = await fetch('/api/checklist/model');
        if (modelRes.ok) {
           maturityModel = await modelRes.json();
           renderMatrix(); // re-render the explorer
        }
      } catch (e) {
        alert('Could not remove evidence: ' + e.message);
        btn.disabled = false;
      }
    });
  });
}

function renderExpandableCheckpoint(cp, level) {
  const tags = cp.evidence_tags || [];
  const sources = cp.sources || [];
  const category = cp.category || 'General';
  const textDe = cp.text_de || '';
  const isNew = cp.added_at && (Date.now() - new Date(cp.added_at).getTime()) < 7 * 24 * 3600 * 1000;

  return `
    <div class="matrix-checkpoint" title="Click to expand">
      <div class="matrix-cp-header">
        <div class="matrix-cp-id">${isNew ? '<span style="background: var(--accent-emerald); color: #fff; font-size: 0.6rem; padding: 1px 5px; border-radius: 3px; margin-right: 4px; font-weight: 700;">🆕</span>' : ''}${cp.id}</div>
        <span class="matrix-cp-category" style="--cat-color: ${level.color}">${category}</span>
      </div>
      <div class="matrix-cp-text">${cp.text}</div>
      <div class="matrix-cp-detail">
        ${textDe ? `<div class="matrix-cp-de"><span class="matrix-cp-de-label">DE</span> ${textDe}</div>` : ''}
        <div class="matrix-cp-sources">
          ${sources.map(s => `<span class="matrix-cp-source-pill" style="--src-color: ${getSourceColor(s)}">${s}</span>`).join('')}
        </div>
        ${tags.length > 0 ? `
          <div class="matrix-cp-evidence">
            <div class="matrix-cp-evidence-label">Evidence & References</div>
            ${tags.map(tag => {
              const color = getSourceColor(tag.source);
              return `
                <div class="matrix-cp-evidence-item" style="--ev-color: ${color}">
                  <div class="matrix-cp-ev-source">${tag.source}</div>
                  <div class="matrix-cp-ev-ref">${tag.reference}</div>
                  <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 4px;">
                    ${tag.url ? `<a class="matrix-cp-ev-link" href="${tag.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open Source →</a>` : ''}
                    <button class="btn-remove-evidence" data-cpid="${cp.id}" data-source="${tag.source}" data-ref="${tag.reference.replace(/"/g, '&quot;')}" style="background: none; border: none; color: #ef4444; font-size: 0.8rem; cursor: pointer; opacity: 0.6; transition: opacity 0.2s;" title="Remove this evidence from model" onclick="event.stopPropagation()">🗑️</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
      <div class="matrix-cp-tags">
        ${renderEvidenceTags(tags.slice(0, 2))}
        ${tags.length > 2 ? `<span class="evidence-tag" style="--tag-color: #8890b5;">+${tags.length - 2} more</span>` : ''}
      </div>
      <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; display: flex; justify-content: flex-end;">
        <button class="btn btn-deep-dive" data-id="${cp.id}" data-text="${cp.text.replace(/"/g, '&quot;')}" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">🤖 Deep Dive</button>
      </div>
      <div id="deep-dive-result-${cp.id}" style="display: none; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6; border-left: 2px solid var(--accent-blue);"></div>
    </div>
  `;
}
