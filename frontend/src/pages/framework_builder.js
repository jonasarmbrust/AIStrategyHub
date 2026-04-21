/**
 * Framework Builder Page — Extracts novel checkpoints from research files and integrates them.
 */
import { api, showToast } from '../main.js';

let proposedCheckpoints = [];

export function renderFrameworkBuilder(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">🏗️ Framework Builder</h1>
      <p class="page-description">Enrich the Open AI Maturity Meta-Model by extracting novel strategic guidelines from previously imported Research Agent documents.</p>
    </div>

    <div class="card mb-xl">
      <div class="card-header">
        <span class="card-title">1. Select Research Source</span>
      </div>
      <div>
        <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 6px;">Choose a document that was previously imported via the Research Agent (.txt)</label>
        <div class="flex gap-sm">
          <select id="builder-source-select" class="input" style="flex: 1;">
            <option value="">Loading sources...</option>
          </select>
          <button class="btn btn-primary btn-sm" id="btn-extract" disabled style="white-space: nowrap;">Extract Novel Insights</button>
        </div>
      </div>
      
      <div id="extract-progress" style="display: none;" class="mt-md">
        <div class="flex items-center gap-md" style="margin-bottom: 8px;">
          <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
          <span style="font-size: 0.85rem; color: var(--text-secondary);">Analyzing framework and distilling strategic rules... (This may take up to 20 seconds)</span>
        </div>
      </div>
    </div>

    <div class="card" id="proposals-card" style="display: none;">
      <div class="card-header" style="justify-content: space-between;">
        <span class="card-title">2. Review & Integrate</span>
        <button class="btn btn-primary btn-sm" id="btn-integrate" disabled>➕ Integrate Selected (0)</button>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
        The AI has identified the following strategic checkpoints that are currently missing from your Meta-Model. Select the ones you want to officially append to your framework.
      </div>
      <div id="proposals-list" class="grid-2">
      </div>
    </div>
  `;

  loadSources();
}

async function loadSources() {
  const select = document.getElementById('builder-source-select');
  const btn = document.getElementById('btn-extract');
  if (!select || !btn) return;

  try {
    const analyses = await api.get('/analysis');
    // Filter to only Text documents (Research Agent imports)
    const txtSources = analyses.filter(a => a.file_type === '.txt');

    if (txtSources.length === 0) {
      select.innerHTML = '<option value="">No imported research found. Go to Document Analyzer and import one first.</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Choose a research document --</option>' + txtSources.map(s => 
      `<option value="${s.id}">${s.document_name} (${new Date(s.created_at).toLocaleDateString()})</option>`
    ).join('');

    select.addEventListener('change', () => {
      btn.disabled = !select.value;
    });

    btn.addEventListener('click', extractInsights);
  } catch (e) {
    select.innerHTML = '<option value="">Could not load sources</option>';
  }
}

async function extractInsights() {
  const select = document.getElementById('builder-source-select');
  const btn = document.getElementById('btn-extract');
  const docId = select.value;
  if (!docId) return;

  btn.disabled = true;
  document.getElementById('builder-source-select').disabled = true;
  document.getElementById('extract-progress').style.display = 'block';
  document.getElementById('proposals-card').style.display = 'none';

  try {
    const res = await api.post('/framework/extract', { document_id: docId });
    proposedCheckpoints = res.proposals || [];
    renderProposals();
  } catch (e) {
    showToast(`Extraction failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('builder-source-select').disabled = false;
    document.getElementById('extract-progress').style.display = 'none';
  }
}

function renderProposals() {
  const list = document.getElementById('proposals-list');
  const card = document.getElementById('proposals-card');
  const btn = document.getElementById('btn-integrate');
  
  if (proposedCheckpoints.length === 0) {
    list.innerHTML = `
      <div style="grid-column: 1 / -1;" class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">No novel insights found. The Meta-Model already covers this document comprehensively.</div>
      </div>
    `;
    btn.disabled = true;
    btn.textContent = `➕ Integrate Selected (0)`;
    card.style.display = 'block';
    return;
  }

  list.innerHTML = proposedCheckpoints.map(p => `
    <div class="card" style="border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s ease;" id="prop-${p.id}">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
        <label style="display: flex; align-items: flex-start; gap: 12px; cursor: pointer; flex: 1;">
          <input type="checkbox" class="proposal-checkbox" value="${p.id}" checked style="margin-top: 4px;" />
          <div>
            <div style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">${p.text}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">${p.text_de}</div>
          </div>
        </label>
      </div>
      <div style="background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; margin-bottom: 8px;">
        <div style="color: var(--accent-emerald); font-weight: 600; margin-bottom: 2px;">Target Dimension: ${p.dimension_id}</div>
        <div style="color: var(--text-secondary);"><strong>Rationale:</strong> ${p.rationale}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <span style="font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">Min Level: ${p.min_level}</span>
        <span style="font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">${p.category}</span>
      </div>
    </div>
  `).join('');

  card.style.display = 'block';
  
  // Attach checkbox listeners
  const checkboxes = document.querySelectorAll('.proposal-checkbox');
  const updateBtnState = () => {
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    btn.disabled = checkedCount === 0;
    btn.textContent = `➕ Integrate Selected (${checkedCount})`;
    
    // Highlight selected cards
    checkboxes.forEach(cb => {
      const parentCard = document.getElementById(`prop-${cb.value}`);
      if (cb.checked) {
        parentCard.style.borderColor = 'var(--accent-blue)';
        parentCard.style.background = 'rgba(59, 130, 246, 0.05)';
      } else {
        parentCard.style.borderColor = 'var(--border-color)';
        parentCard.style.background = 'var(--bg-card)';
      }
    });
  };
  
  checkboxes.forEach(cb => cb.addEventListener('change', updateBtnState));
  // Initial highlight
  updateBtnState();

  // Attach integrate listener
  btn.onclick = async () => {
    const selectedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    const selectedCheckpoints = proposedCheckpoints.filter(p => selectedIds.includes(p.id));
    
    if (selectedCheckpoints.length === 0) return;
    
    btn.disabled = true;
    btn.textContent = 'Integrating...';
    
    try {
      const res = await api.post('/framework/integrate', { checkpoints: selectedCheckpoints });
      showToast(`Successfully added ${res.added} checkpoints to the Meta-Model!`, 'success');
      // Remove integrated proposals from UI
      proposedCheckpoints = proposedCheckpoints.filter(p => !selectedIds.includes(p.id));
      renderProposals();
    } catch (e) {
      showToast(`Integration failed: ${e.message}`, 'error');
      btn.disabled = false;
      btn.textContent = `➕ Integrate Selected (${selectedIds.length})`;
    }
  };
}
