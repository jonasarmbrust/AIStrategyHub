import { api, getScoreColor } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

let maturityModel = null;
let euCheckpoints = [];

export async function renderEuAiAct(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('eu.title')}</h1>
      <p class="page-description">${t('eu.desc')}</p>
    </div>
    
    <div id="eu-ai-content">
      <div class="loading-overlay"><div class="spinner"></div><span>${t('eu.initializing')}</span></div>
    </div>
  `;

  try {
    const res = await api.get('/checklist/model');
    maturityModel = res;
  } catch {
    const fallbackRes = await fetch('/dimensions-fallback.json');
    if (fallbackRes.ok) maturityModel = await fallbackRes.json();
  }

  if (!maturityModel) {
    document.getElementById('eu-ai-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${t('eu.failedLoad')}</div>
      </div>
    `;
    return;
  }

  // Find all EU AI Act checkpoints
  euCheckpoints = [];
  maturityModel.dimensions.forEach(dim => {
    dim.checkpoints.forEach(cp => {
      const isEu = cp.sources?.includes('EU AI Act') || cp.evidence_tags?.some(t => t.source.includes('EU AI Act'));
      if (isEu) {
        euCheckpoints.push({ cp, dim });
      }
    });
  });

  const assessmentsStr = localStorage.getItem('oaimm_assessments');
  const assessments = assessmentsStr ? JSON.parse(assessmentsStr) : {};
  const hasAssessment = Object.keys(assessments).length > 0;

  let fulfilledCheckpoints = 0;
  const gaps = [];

  euCheckpoints.forEach(({ cp, dim }) => {
    const isFulfilled = assessments[cp.id]?.fulfilled;
    if (isFulfilled) {
      fulfilledCheckpoints++;
    } else {
      gaps.push({ cp, dim });
    }
  });

  const complianceScore = euCheckpoints.length > 0 ? (fulfilledCheckpoints / euCheckpoints.length) * 100 : 0;
  const scoreColor = getScoreColor(complianceScore);

  let riskLevel = t('eu.criticalRisk');
  let riskColor = '#ef4444';
  if (complianceScore >= 90) { riskLevel = t('eu.lowRisk'); riskColor = '#10b981'; }
  else if (complianceScore >= 60) { riskLevel = t('eu.mediumRisk'); riskColor = '#f59e0b'; }

  let gapsHtml = '';
  if (hasAssessment && gaps.length > 0) {
    gapsHtml = `
      <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;" class="fade-in">${t('eu.prioritizedGaps').replace('{count}', gaps.length)}</h2>
      <div class="grid-2">
        ${gaps.map((g, idx) => {
          const cp = g.cp;
          const euTags = cp.evidence_tags?.filter(t => t.source.includes('EU AI')) || [];
          const refs = euTags.map(t => t.reference).join(', ') || t('eu.generalObligations');

          return '<div class="card fade-in" style="animation-delay: ' + (200 + idx * 50) + 'ms; border-left: 3px solid #ef4444;">' +
                 '<div style="display: flex; justify-content: space-between; margin-bottom: 8px;">' +
                   '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">' + g.dim.icon + ' ' + t('dimensions.' + g.dim.id) + '</span>' +
                   '<span style="font-size: 0.7rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 8px; border-radius: 4px; font-family: monospace;">' + cp.id + '</span>' +
                 '</div>' +
                 '<div style="font-size: 0.95rem; font-weight: 500; margin-bottom: 12px; color: var(--text-primary);">' + cp.text + '</div>' +
                 '<div style="font-size: 0.8rem; color: #fca5a5; background: rgba(239, 68, 68, 0.05); padding: 8px; border-radius: 6px; margin-bottom: 12px;">' +
                   '<span style="font-weight: 600;">' + t('eu.violation') + '</span> ' + refs + '</div>' +
                 '<div style="display: flex; justify-content: flex-end;">' +
                   '<button class="btn btn-deep-dive" data-text="' + cp.text.replace(/"/g, '&quot;') + '" data-context="' + t('eu.deepDiveContext').replace('{refs}', refs.replace(/"/g, '&quot;')) + '" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">' + t('eu.fixViaAi') + '</button>' +
                 '</div>' +
                 '<div class="deep-dive-result" style="display: none; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6; border-left: 2px solid var(--accent-blue);"></div>' +
               '</div>';
        }).join('')}
      </div>
    `;
  }

  let fullyCompliantHtml = '';
  if (hasAssessment && gaps.length === 0 && euCheckpoints.length > 0) {
    fullyCompliantHtml = `
      <div class="card fade-in" style="text-align: center; padding: 3rem; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🛡️</div>
        <h2 style="color: #10b981; font-size: 1.5rem; margin-bottom: 0.5rem;">${t('eu.fullyCompliantTitle')}</h2>
        <p style="color: var(--text-secondary);">${t('eu.fullyCompliantDesc')}</p>
      </div>
    `;
  }

  document.getElementById('eu-ai-content').innerHTML = `
    <!-- Top Stats -->
    <div class="grid-3 mb-xl">
      <div class="card stat-card fade-in" style="animation-delay: 0ms">
        <div class="stat-value" style="color: ${scoreColor}">${complianceScore.toFixed(0)}%</div>
        <div class="stat-label">${t('eu.readinessScore')}</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 60ms">
        <div class="stat-value" style="color: ${riskColor}">${riskLevel}</div>
        <div class="stat-label">${t('eu.regExposure')}</div>
      </div>
      <div class="card stat-card fade-in" style="animation-delay: 120ms">
        <div class="stat-value gradient-warm">${gaps.length}</div>
        <div class="stat-label">${t('eu.openGaps')}</div>
      </div>
    </div>

    <!-- Warnings -->
    <div class="card mb-xl fade-in" style="animation-delay: 180ms; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2);">
      <div class="card-header border-none" style="margin-bottom: 0;">
        <span class="card-title" style="color: #ef4444;">${t('eu.penaltiesTitle')}</span>
      </div>
      <div style="padding: 0 var(--space-xl) var(--space-lg); font-size: 0.9rem; color: #fca5a5;">
        ${t('eu.penaltiesDesc')}
      </div>
    </div>

    ${!hasAssessment ? `
      <div class="empty-state mb-xl">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">${t('eu.completeAssessmentPrompt')}</div>
        <a href="#assessment" class="btn btn-primary">${t('eu.startAssessmentBtn')}</a>
      </div>
    ` : ''}

    ${gapsHtml}
    
    ${fullyCompliantHtml}

    ${hasAssessment && gaps.length > 0 ? `
      <div class="card mb-xl fade-in" style="animation-delay: 400ms; text-align: center; padding: 2rem; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🗺️</div>
        <h3 style="margin-bottom: 0.5rem; color: var(--text-primary);">${t('eu.genRoadmapTitle')}</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">${t('eu.genRoadmapDesc').replace('{count}', gaps.length)}</p>
        <a href="#roadmap" class="btn btn-primary" style="font-weight: 600;">${t('eu.openRoadmapBtn')}</a>
      </div>
    ` : ''}
  `;

  // Bind Deep Dive Buttons
  const containerEl = document.getElementById('eu-ai-content');
  if(containerEl) {
    containerEl.querySelectorAll('.btn-deep-dive').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = btn.dataset.text;
        const context = btn.dataset.context;
        const resultDiv = btn.parentElement.nextElementSibling;
        
        if (resultDiv.style.display === 'block') {
          resultDiv.style.display = 'none';
          return;
        }

        btn.disabled = true;
        btn.textContent = t('eu.generatingFix');
        try {
          const res = await fetch('/api/analysis/deep-dive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context })
          });
          const data = await res.json();
          let html = data.markdown || '';
          html = html
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^### (.*$)/gim, '<h4 style="margin-top:12px; margin-bottom:4px; font-weight:700; color:var(--text-primary);">$1</h4>')
            .replace(/^## (.*$)/gim, '<h3 style="margin-top:16px; margin-bottom:6px; font-weight:800; color:var(--accent-blue);">$1</h3>')
            .replace(/^# (.*$)/gim, '<h2>$1</h2>');
            
          resultDiv.innerHTML = `<p>${sanitizeHTML(html)}</p>`;
          resultDiv.style.display = 'block';
        } catch (e) {
          resultDiv.textContent = t('eu.failedDeepDive').replace('{msg}', e.message);
          resultDiv.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = t('eu.fixViaAi');
        }
      });
    });
  }
}
