/**
 * Meta Strategy Page — Synthesized strategic recommendations with Do's & Don'ts.
 * Aggregates insights from all 6 frameworks into actionable guidance per dimension.
 * Assessment-aware: highlights what's relevant based on current maturity level.
 */
import { api, showToast, getLevelBadge, getScoreColor, LEVEL_NAMES, renderEvidenceTags, getSourceColor } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

const STORAGE_KEY = 'oaimm_assessments';

// ── Strategic Guidance per Dimension ────────────────────────
const STRATEGIC_GUIDANCE = {
  strategy: {
    title: 'Strategy & Leadership',
    icon: '🎯',
    summary: 'AI success starts at the top. Without executive sponsorship and a clear strategy aligned to business goals, AI initiatives remain isolated experiments with limited impact.',
    key_insight: 'Organizations that align AI initiatives with business strategy are 3x more likely to achieve measurable ROI (Google AI Adoption Framework).',
    dos: [
      { text: 'Define a formal AI strategy document aligned with business objectives', level: 2, source: 'Google AI Adoption Framework' },
      { text: 'Appoint a dedicated executive sponsor (C-level) for AI initiatives', level: 2, source: 'Google AI Adoption Framework' },
      { text: 'Create an AI investment roadmap with measurable milestones and KPIs', level: 3, source: 'Google + OWASP' },
      { text: 'Establish cross-functional AI steering committees with business + tech representation', level: 3, source: 'NIST AI RMF' },
      { text: 'Conduct quarterly AI portfolio reviews to assess ROI and strategic fit', level: 4, source: 'Microsoft RAI' },
      { text: 'Build an AI Center of Excellence (CoE) that drives org-wide standards', level: 4, source: 'Google AI Adoption' },
      { text: 'Benchmark against industry peers using structured maturity models', level: 3, source: 'UNESCO + NIST' },
    ],
    donts: [
      { text: 'Don\'t start AI projects without a clear business problem to solve', severity: 'critical' },
      { text: 'Don\'t delegate AI strategy solely to IT — it must be a business decision', severity: 'critical' },
      { text: 'Don\'t pursue AI for the sake of AI ("shiny object syndrome")', severity: 'high' },
      { text: 'Don\'t ignore change management — technology alone won\'t drive adoption', severity: 'high' },
      { text: 'Don\'t set unrealistic timelines — AI maturity is a multi-year journey', severity: 'medium' },
      { text: 'Don\'t silo AI teams away from business units', severity: 'medium' },
    ],
    frameworks_say: [
      { source: 'Google AI Adoption Framework', insight: 'AI adoption follows a People → Process → Technology → Data progression. Starting with technology alone leads to failure.' },
      { source: 'UNESCO AI Readiness', insight: 'National and organizational AI strategies must include clear governance structures, not just technical capabilities.' },
      { source: 'NIST AI RMF 1.0', insight: 'AI risk management must be integrated into enterprise risk management, not treated as a separate workstream.' },
    ],
  },
  data: {
    title: 'Data & Infrastructure',
    icon: '🗄️',
    summary: 'Data is the fuel of AI. Without proper data governance, quality assurance, and scalable infrastructure, even the most sophisticated models will fail to deliver value.',
    key_insight: '80% of AI project time is spent on data preparation. Organizations with mature data pipelines achieve 5x faster time-to-production (Microsoft RAI).',
    dos: [
      { text: 'Implement a formal data governance framework with clear ownership and stewardship', level: 2, source: 'NIST AI RMF + EU AI Act' },
      { text: 'Establish automated data quality monitoring with defined SLAs', level: 3, source: 'NIST AI RMF' },
      { text: 'Create a centralized data catalog / feature store for ML features', level: 3, source: 'Google AI Adoption' },
      { text: 'Implement data lineage tracking from source to model prediction', level: 3, source: 'EU AI Act Art. 10' },
      { text: 'Design infrastructure for GPU/TPU scaling — cloud-native or hybrid', level: 4, source: 'Google AI Adoption' },
      { text: 'Automate dataset versioning and reproducibility for all ML experiments', level: 3, source: 'OWASP AIMA' },
      { text: 'Conduct regular data bias audits, especially for high-risk AI systems', level: 3, source: 'EU AI Act + NIST' },
    ],
    donts: [
      { text: 'Don\'t train models on unvalidated or ungoverned data', severity: 'critical' },
      { text: 'Don\'t ignore data privacy regulations (GDPR, EU AI Act) — they apply to training data', severity: 'critical' },
      { text: 'Don\'t use production data for development without proper anonymization', severity: 'high' },
      { text: 'Don\'t assume "more data = better models" without quality assessment', severity: 'high' },
      { text: 'Don\'t build data silos — centralize access with proper permissions', severity: 'medium' },
      { text: 'Don\'t neglect synthetic data as an alternative when real data is scarce or sensitive', severity: 'medium' },
    ],
    frameworks_say: [
      { source: 'EU AI Act', insight: 'Article 10 requires that training datasets are relevant, representative, free of errors, and complete. Non-compliance leads to significant fines.' },
      { source: 'NIST AI RMF 1.0', insight: 'MAP 2.3: Data quality must be measurable. Define metrics for completeness, accuracy, timeliness, and consistency.' },
      { source: 'OWASP AI Security', insight: 'Data poisoning is a top AI threat. Implement integrity checks and provenance tracking for all training data.' },
    ],
  },
  governance: {
    title: 'Governance & Compliance',
    icon: '⚖️',
    summary: 'AI governance is no longer optional — the EU AI Act mandates it for high-risk systems. A robust governance framework protects your organization, builds trust, and enables responsible scaling.',
    key_insight: 'The EU AI Act is enforceable from August 2026 with fines up to €35M or 7% of global revenue. Preparation must start now.',
    dos: [
      { text: 'Establish an AI governance board with cross-functional representation', level: 2, source: 'NIST AI RMF + Microsoft RAI' },
      { text: 'Classify all AI systems by risk level (unacceptable/high/limited/minimal) per EU AI Act', level: 2, source: 'EU AI Act Art. 6' },
      { text: 'Implement a formal AI risk assessment process for every new AI initiative', level: 2, source: 'NIST AI RMF GOVERN 1' },
      { text: 'Create an AI model registry documenting purpose, data, performance, and risks', level: 3, source: 'EU AI Act + NIST' },
      { text: 'Conduct regular algorithmic impact assessments for high-risk systems', level: 3, source: 'EU AI Act Art. 9' },
      { text: 'Ensure human oversight mechanisms exist for all AI-driven decisions', level: 2, source: 'EU AI Act Art. 14' },
      { text: 'Document conformity assessments and maintain technical documentation', level: 3, source: 'EU AI Act Art. 11' },
    ],
    donts: [
      { text: 'Don\'t deploy AI without a risk classification — the EU AI Act requires it', severity: 'critical' },
      { text: 'Don\'t treat AI governance as a one-time exercise — it requires continuous monitoring', severity: 'critical' },
      { text: 'Don\'t let developers self-assess their own models without independent review', severity: 'high' },
      { text: 'Don\'t assume existing IT governance covers AI — AI has unique risks (bias, drift, opacity)', severity: 'high' },
      { text: 'Don\'t ignore the documentation requirements — regulators will ask for it', severity: 'high' },
      { text: 'Don\'t delay EU AI Act preparation — the deadline is sooner than you think', severity: 'critical' },
    ],
    frameworks_say: [
      { source: 'EU AI Act', insight: 'High-risk AI systems must have risk management, data governance, technical documentation, transparency, human oversight, accuracy, and cybersecurity — all mandatory.' },
      { source: 'NIST AI RMF 1.0', insight: 'The GOVERN function establishes the organizational culture and structures needed for AI risk management to succeed.' },
      { source: 'Microsoft RAI', insight: 'Responsible AI maturity requires moving from principles to practice — governance structures, tools, and accountability mechanisms.' },
    ],
  },
  technology: {
    title: 'Technology & MLOps',
    icon: '⚙️',
    summary: 'MLOps is the bridge between AI experiments and production value. Mature MLOps practices ensure models are reliable, reproducible, and monitorable at scale.',
    key_insight: '87% of ML models never reach production. The gap is almost always MLOps maturity, not model quality (Google ML Best Practices).',
    dos: [
      { text: 'Implement CI/CD pipelines specifically designed for ML (not just software)', level: 3, source: 'Google AI Adoption' },
      { text: 'Deploy model monitoring for drift detection, performance degradation, and data skew', level: 3, source: 'NIST AI RMF MEASURE' },
      { text: 'Use model versioning (MLflow, DVC, or equivalent) for full reproducibility', level: 2, source: 'OWASP AIMA' },
      { text: 'Implement A/B testing or shadow deployment strategies for new models', level: 3, source: 'Google AI Adoption' },
      { text: 'Design for model rollback — you need to revert to a previous version quickly', level: 3, source: 'OWASP AIMA' },
      { text: 'Build standardized model serving infrastructure (API gateways, scaling, caching)', level: 4, source: 'Google AI Adoption' },
      { text: 'Automate retraining pipelines triggered by monitoring alerts', level: 4, source: 'NIST + Google' },
    ],
    donts: [
      { text: 'Don\'t deploy models in production without monitoring — they degrade silently', severity: 'critical' },
      { text: 'Don\'t use Jupyter notebooks as production code', severity: 'high' },
      { text: 'Don\'t skip model validation and testing before deployment', severity: 'critical' },
      { text: 'Don\'t hardcode model parameters — use configuration management', severity: 'medium' },
      { text: 'Don\'t ignore infrastructure costs — GPU costs can escalate rapidly', severity: 'high' },
      { text: 'Don\'t build everything from scratch — leverage managed ML platforms where appropriate', severity: 'medium' },
    ],
    frameworks_say: [
      { source: 'Google AI Adoption Framework', insight: 'Technology maturity progresses from ad-hoc experimentation → standardized tools → automated pipelines → self-optimizing systems.' },
      { source: 'NIST AI RMF 1.0', insight: 'MEASURE 2: Performance metrics must be defined, tracked, and reported. This includes fairness and robustness, not just accuracy.' },
      { source: 'OWASP AI Security', insight: 'Supply chain security for ML is critical. Validate all pre-trained models, libraries, and datasets against known vulnerabilities.' },
    ],
  },
  talent: {
    title: 'Talent & Culture',
    icon: '👥',
    summary: 'AI transformation is fundamentally a people challenge. Technical skills are necessary but insufficient — success requires AI literacy across the entire organization and a culture that embraces experimentation.',
    key_insight: 'Organizations that invest in company-wide AI literacy (not just data science teams) are 4x more likely to scale AI successfully (UNESCO).',
    dos: [
      { text: 'Create role-specific AI training programs (executives, managers, developers, end users)', level: 2, source: 'Google AI Adoption + UNESCO' },
      { text: 'Establish AI literacy benchmarks for the entire organization', level: 3, source: 'UNESCO AI Readiness' },
      { text: 'Build cross-functional AI teams (data scientists + domain experts + product managers)', level: 3, source: 'Google AI Adoption' },
      { text: 'Create clear AI career paths with progression frameworks', level: 3, source: 'Microsoft RAI' },
      { text: 'Set up internal AI communities of practice for knowledge sharing', level: 3, source: 'Google AI Adoption' },
      { text: 'Partner with universities and research institutions for talent pipeline', level: 4, source: 'UNESCO' },
      { text: 'Foster a culture of responsible experimentation — celebrate learning, not just success', level: 2, source: 'Google + Microsoft' },
    ],
    donts: [
      { text: 'Don\'t limit AI training to technical teams — business users need it too', severity: 'critical' },
      { text: 'Don\'t hire only for technical skills — domain expertise is equally important', severity: 'high' },
      { text: 'Don\'t create an "AI ivory tower" disconnected from business realities', severity: 'high' },
      { text: 'Don\'t ignore change resistance — proactively address fears about AI replacing jobs', severity: 'high' },
      { text: 'Don\'t underestimate the importance of AI ethics training for all staff', severity: 'medium' },
      { text: 'Don\'t expect one "AI guru" to transform the organization alone', severity: 'medium' },
    ],
    frameworks_say: [
      { source: 'Google AI Adoption Framework', insight: 'The "People" pillar is the foundation. Without the right skills and culture, technology investments are wasted.' },
      { source: 'UNESCO AI Readiness', insight: 'AI readiness requires education at all levels — from school curricula to executive training programs.' },
      { source: 'Microsoft RAI', insight: 'Responsible AI requires multidisciplinary teams. Ethics, law, sociology, and domain expertise are as important as ML engineering.' },
    ],
  },
  ethics: {
    title: 'Ethics & Responsible AI',
    icon: '🛡️',
    summary: 'Responsible AI is not just a compliance checkbox — it\'s a competitive advantage. Organizations that proactively address fairness, transparency, and accountability build trust and avoid costly failures.',
    key_insight: 'The cost of an AI ethics failure (bias scandal, privacy breach) averages $5-50M in direct costs plus incalculable reputation damage (Microsoft RAI + OWASP).',
    dos: [
      { text: 'Develop and publish organizational AI ethics principles with board-level endorsement', level: 2, source: 'UNESCO + EU AI Act' },
      { text: 'Implement bias testing and fairness metrics as mandatory pre-deployment gates', level: 3, source: 'NIST AI RMF + EU AI Act' },
      { text: 'Ensure AI decisions are explainable — XAI is not optional for high-risk systems', level: 2, source: 'EU AI Act Art. 13' },
      { text: 'Create accessible feedback mechanisms for users affected by AI decisions', level: 3, source: 'EU AI Act Art. 14' },
      { text: 'Conduct regular ethical impact assessments, not just at launch', level: 3, source: 'UNESCO + Microsoft RAI' },
      { text: 'Implement privacy-by-design and privacy-preserving ML techniques', level: 3, source: 'EU AI Act + NIST' },
      { text: 'Establish a diverse AI ethics review board including external stakeholders', level: 4, source: 'UNESCO' },
    ],
    donts: [
      { text: 'Don\'t deploy AI systems that make consequential decisions without human oversight', severity: 'critical' },
      { text: 'Don\'t treat "we didn\'t intend bias" as an acceptable defense', severity: 'critical' },
      { text: 'Don\'t use dark patterns or manipulative AI (EU AI Act explicitly prohibits this)', severity: 'critical' },
      { text: 'Don\'t collect more personal data than needed — data minimization is law', severity: 'high' },
      { text: 'Don\'t publish ethics principles without enforcement mechanisms', severity: 'high' },
      { text: 'Don\'t test for bias only on majority populations — test across all demographics', severity: 'high' },
    ],
    frameworks_say: [
      { source: 'EU AI Act', insight: 'Article 5 bans AI systems that exploit vulnerabilities, use social scoring, or deploy real-time biometric surveillance. Know the red lines.' },
      { source: 'NIST AI RMF 1.0', insight: 'Trustworthy AI must be: valid, reliable, safe, secure, resilient, accountable, transparent, explainable, privacy-enhanced, and fair.' },
      { source: 'UNESCO', insight: 'AI ethics must be culturally sensitive. What is "fair" varies across contexts — there is no universal fairness metric.' },
    ],
  },
  processes: {
    title: 'Processes & Scaling',
    icon: '🔄',
    summary: 'Scaling AI is the hardest part. Moving from successful pilots to organization-wide deployment requires standardized processes, change management, and continuous improvement loops.',
    key_insight: 'Most organizations have a "Pilot Trap" — they successfully build AI prototypes but fail to deploy and scale them. Process maturity is the bottleneck.',
    dos: [
      { text: 'Define a standardized AI project lifecycle from ideation to retirement', level: 2, source: 'NIST AI RMF + Google' },
      { text: 'Implement change management processes specifically for AI deployments', level: 3, source: 'Google AI Adoption' },
      { text: 'Create reusable templates for AI project proposals, risk assessments, and documentation', level: 3, source: 'NIST AI RMF' },
      { text: 'Measure and report AI value realization (ROI, time saved, quality improvements)', level: 3, source: 'Google + Microsoft' },
      { text: 'Establish feedback loops between production performance and model improvement', level: 3, source: 'NIST AI RMF MANAGE' },
      { text: 'Design incident response processes for AI failures and anomalies', level: 3, source: 'NIST AI RMF + OWASP' },
      { text: 'Scale through platformization — build shared AI services, not point solutions', level: 4, source: 'Google AI Adoption' },
    ],
    donts: [
      { text: 'Don\'t skip the pilot-to-production transition plan — most AI projects die here', severity: 'critical' },
      { text: 'Don\'t assume what works for one business unit will work for another without adaptation', severity: 'high' },
      { text: 'Don\'t rely on manual processes for recurring ML tasks — automate early', severity: 'high' },
      { text: 'Don\'t forget to plan for model retirement — models have a lifecycle', severity: 'medium' },
      { text: 'Don\'t ignore operational costs in the AI business case — TCO matters', severity: 'medium' },
      { text: 'Don\'t scale without governance in place — it amplifies risks', severity: 'critical' },
    ],
    frameworks_say: [
      { source: 'NIST AI RMF 1.0', insight: 'MANAGE: AI systems require ongoing monitoring, maintenance, and decommissioning plans — the lifecycle doesn\'t end at deployment.' },
      { source: 'Google AI Adoption Framework', insight: 'Scaling requires moving from project-based AI to platform-based AI. Shared infrastructure and reusable components accelerate delivery.' },
      { source: 'OWASP AI Security', insight: 'Incident response for AI must include model-specific scenarios: adversarial attacks, data drift, and unexpected behaviors.' },
    ],
  },
};

let maturityModel = null;
let assessments = {};

function loadAssessments() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) assessments = JSON.parse(saved);
  } catch { /* ignore */ }
}

function getDimensionScore(dim) {
  if (!dim?.checkpoints) return { score: 0, fulfilled: 0, total: 0, level: 0, byLevel: {} };
  const fulfilled = dim.checkpoints.filter(cp => assessments[cp.id]?.fulfilled).length;
  const total = dim.checkpoints.length;
  const score = total > 0 ? (fulfilled / total * 100) : 0;
  let level = 1;
  if (score >= 90) level = 5;
  else if (score >= 70) level = 4;
  else if (score >= 50) level = 3;
  else if (score >= 25) level = 2;

  // Build level-specific fulfillment map
  const byLevel = {};
  for (let l = 1; l <= 5; l++) {
    const cpsAtLevel = dim.checkpoints.filter(cp => cp.min_level === l);
    const fulfilledAtLevel = cpsAtLevel.filter(cp => assessments[cp.id]?.fulfilled).length;
    byLevel[l] = { total: cpsAtLevel.length, fulfilled: fulfilledAtLevel, pct: cpsAtLevel.length > 0 ? fulfilledAtLevel / cpsAtLevel.length : 0 };
  }

  return { score: Math.round(score), fulfilled, total, level, byLevel };
}

export function renderMetaStrategy(container) {
  loadAssessments();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('meta.title')}</h1>
      <p class="page-description">${t('meta.desc')}</p>
    </div>

    <div class="card mb-xl" id="meta-overview">
      <div class="card-header">
        <span class="card-title">${t('meta.overviewTitle')}</span>
        <button class="btn btn-primary btn-sm" id="btn-ai-recommend">${t('meta.generateAiRec')}</button>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: 16px;">
        ${t('meta.metaSummary')}
      </div>
      <div class="grid-3" id="framework-stats">
        <div style="text-align: center; padding: 12px;">
          <div style="font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">6</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t('meta.globalFws')}</div>
        </div>
        <div style="text-align: center; padding: 12px;">
          <div style="font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #10b981, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">7</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t('meta.dimensions')}</div>
        </div>
        <div style="text-align: center; padding: 12px;">
          <div style="font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">69</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t('meta.checkpoints')}</div>
        </div>
      </div>
    </div>

    <div id="ai-recommendations" class="card mb-xl" style="display: none;">
      <div class="card-header">
        <span class="card-title">${t('meta.aiRecTitle')}</span>
      </div>
      <div id="ai-rec-content"></div>
    </div>

    <div id="strategy-dimensions">
      <div class="loading-overlay"><div class="spinner"></div><span>${t('meta.loadingGuidance')}</span></div>
    </div>
  `;

  document.getElementById('btn-ai-recommend')?.addEventListener('click', generateAIRecommendations);
  loadModel();
}

async function loadModel() {
  try {
    maturityModel = await api.get('/checklist/model');
  } catch {
    try {
      const res = await fetch('/dimensions-fallback.json');
      if (res.ok) maturityModel = await res.json();
    } catch { /* */ }
  }
  renderDimensions();
}

function renderDimensions() {
  const container = document.getElementById('strategy-dimensions');
  if (!container) return;

  const dims = Object.keys(STRATEGIC_GUIDANCE);

  container.innerHTML = dims.map((dimId, idx) => {
    const guidance = STRATEGIC_GUIDANCE[dimId];
    const modelDim = maturityModel?.dimensions?.find(d => d.id === dimId);
    const scoreData = getDimensionScore(modelDim);
    const hasAssessment = Object.keys(assessments).length > 0;

    return `
      <div class="card mb-xl strategy-dimension fade-in" style="animation-delay: ${idx * 80}ms">
        <!-- Dimension Header -->
        <div class="strategy-dim-header">
          <div class="flex items-center gap-md">
            <span style="font-size: 2rem;">${guidance.icon}</span>
            <div>
              <h2 class="strategy-dim-title">${t('dimensions.' + dimId)}</h2>
              <div style="font-size: 0.78rem; color: var(--text-muted);">
                ${modelDim ? `${modelDim.checkpoints.length} ${t('meta.checkpointsLabel')} · ${t('meta.weightLabel')} ${Math.round(modelDim.weight * 100)}%` : ''}
              </div>
            </div>
          </div>
          ${hasAssessment ? `
            <div class="strategy-score-badge" style="--score-color: ${getScoreColor(scoreData.score)}">
              <span class="strategy-score-value">${scoreData.score}%</span>
              <span class="strategy-score-label">L${scoreData.level} ${LEVEL_NAMES[scoreData.level]}</span>
            </div>
          ` : ''}
        </div>

        <!-- Summary & Key Insight -->
        <div class="strategy-summary">${guidance.summary}</div>
        <div class="strategy-key-insight">
          <span class="strategy-insight-icon">💡</span>
          <span>${guidance.key_insight}</span>
        </div>

        <!-- Do's & Don'ts Grid -->
        <div class="grid-2 mt-lg mb-lg">
          <!-- DO's -->
          <div class="strategy-list-card do-card">
            <div class="strategy-list-header do-header">
              <span>${t('meta.dosTitle')}</span>
              <span style="font-size: 0.65rem; opacity: 0.7;">${t('meta.recsCount').replace('{count}', guidance.dos.length)}</span>
            </div>
            <div class="strategy-list-items">
              ${guidance.dos.map(item => {
                // #4: Check actual checkpoint fulfillment at this level
                const levelData = scoreData.byLevel?.[item.level];
                const isAchieved = hasAssessment && levelData && levelData.pct >= 0.7;
                return `
                <div class="strategy-item do-item ${isAchieved ? 'achieved' : ''}">
                  <div class="strategy-item-text">${item.text}</div>
                  <div class="strategy-item-meta">
                    <span class="strategy-level-pill" style="--pill-color: ${['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6'][item.level]}">${t('roadmap.levelPlus').replace('{level}', item.level)}</span>
                    <span class="strategy-source-pill" style="--pill-color: ${getSourceColor(item.source)}">${item.source}</span>
                    ${isAchieved ? `<span style="font-size: 0.6rem; color: #10b981;">${t('meta.achieved')}</span>` : ''}
                  </div>
                  <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-deep-dive" data-text="${item.text.replace(/"/g, '&quot;')}" data-context="Meta Strategy Action Item DO" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; cursor: pointer; transition: all 0.2s;">${t('meta.deepDiveBtn')}</button>
                  </div>
                  <div class="deep-dive-result" style="display: none; margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; border-left: 2px solid var(--accent-blue);"></div>
                </div>
              `}).join('')}
            </div>
          </div>

          <!-- DON'Ts -->
          <div class="strategy-list-card dont-card">
            <div class="strategy-list-header dont-header">
              <span>${t('meta.dontsTitle')}</span>
              <span style="font-size: 0.65rem; opacity: 0.7;">${t('meta.warningsCount').replace('{count}', guidance.donts.length)}</span>
            </div>
            <div class="strategy-list-items">
              ${guidance.donts.map(item => {
                const sevColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308' };
                const sevColor = sevColors[item.severity] || '#8890b5';
                return `
                  <div class="strategy-item dont-item">
                    <div class="strategy-item-text">${item.text}</div>
                    <span class="strategy-severity" style="--sev-color: ${sevColor}">${item.severity}</span>
                    <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                      <button class="btn btn-deep-dive" data-text="${item.text.replace(/"/g, '&quot;')}" data-context="Meta Strategy Action Item DONT" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; cursor: pointer; transition: all 0.2s;">${t('meta.deepDiveBtn')}</button>
                    </div>
                    <div class="deep-dive-result" style="display: none; margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; border-left: 2px solid var(--accent-red);"></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- What the Frameworks Say -->
        <div class="strategy-frameworks-section">
          <div class="strategy-frameworks-header">${t('meta.whatFrameworksSay')}</div>
          <div class="strategy-frameworks-grid">
            ${guidance.frameworks_say.map(fw => `
              <div class="strategy-fw-card" style="--fw-color: ${getSourceColor(fw.source)}">
                <div class="strategy-fw-source">${fw.source}</div>
                <div class="strategy-fw-insight">${fw.insight}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind deep dive events
  container.querySelectorAll('.btn-deep-dive').forEach(btn => {
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
      btn.textContent = t('meta.analyzing');
      try {
        const res = await fetch('/api/analysis/deep-dive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, context })
        });
        const data = await res.json();
        
        // Simple markdown parsing
        let html = data.markdown || '';
        html = html
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>')
          .replace(/^### (.*$)/gim, '<h4 style="margin-top:8px; margin-bottom:4px; font-weight:700; color:var(--text-primary);">$1</h4>')
          .replace(/^## (.*$)/gim, '<h3 style="margin-top:12px; margin-bottom:6px; font-weight:800; color:var(--accent-blue);">$1</h3>')
          .replace(/^# (.*$)/gim, '<h2>$1</h2>')
          .replace(/<p><\/p>/g, '');
          
        resultDiv.innerHTML = `<p>${sanitizeHTML(html)}</p>`;
        resultDiv.style.display = 'block';
      } catch (e) {
        resultDiv.textContent = t('meta.failedDeepDive').replace('{msg}', e.message);
        resultDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = t('meta.deepDiveBtn');
      }
    });
  });
}

// ── #5: AI-Powered Personalized Recommendations ────────────
async function generateAIRecommendations() {
  const btn = document.getElementById('btn-ai-recommend');
  const panel = document.getElementById('ai-recommendations');
  const content = document.getElementById('ai-rec-content');

  if (!maturityModel) {
    showToast(t('meta.modelNotLoaded'), 'error');
    return;
  }

  const hasData = Object.keys(assessments).length > 0;
  if (!hasData) {
    showToast(t('meta.assessmentRequired'), 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = t('meta.generatingBtn');
  panel.style.display = 'block';
  content.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>${t('meta.geminiAnalyzing')}</span></div>`;

  // Build dimension scores for the prompt
  const dimScores = {};
  const gaps = [];
  maturityModel.dimensions.forEach(dim => {
    const sd = getDimensionScore(dim);
    dimScores[dim.id] = { name: dim.name, score: sd.score, level: sd.level, fulfilled: sd.fulfilled, total: sd.total };
    if (sd.score < 70) {
      const unfulfilled = dim.checkpoints.filter(cp => !assessments[cp.id]?.fulfilled).map(cp => cp.text);
      gaps.push({ dimension: dim.name, score: sd.score, unfulfilled_items: unfulfilled.slice(0, 5) });
    }
  });

  try {
    const res = await fetch('/api/ingest/personalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimension_scores: dimScores, gaps }),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    renderAIRecommendations(data);
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${t('meta.generationFailed').replace('{msg}', e.message)}</div></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = t('meta.generateAiRec');
  }
}

function renderAIRecommendations(data) {
  const content = document.getElementById('ai-rec-content');
  if (!content || !data?.recommendations) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-text">${t('meta.noRecommendations')}</div></div>`;
    return;
  }

  const dimColors = {
    strategy: '#3b82f6', data: '#06b6d4', governance: '#f59e0b',
    technology: '#8b5cf6', talent: '#10b981', ethics: '#ef4444', processes: '#f97316',
  };

  content.innerHTML = `
    ${data.executive_summary ? `
      <div class="strategy-key-insight mb-lg">
        <span class="strategy-insight-icon">📋</span>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">${t('meta.executiveSummary')}</div>
          <span>${data.executive_summary}</span>
        </div>
      </div>
    ` : ''}
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${data.recommendations.map((rec, i) => {
        const color = dimColors[rec.dimension] || '#8890b5';
        return `
          <div class="ingest-arg-card" style="border-left: 3px solid ${color};">
            <div class="flex items-center gap-md" style="margin-bottom: 6px;">
              <span style="font-size: 0.85rem; font-weight: 700; color: ${color};">#${i + 1}</span>
              <span style="font-size: 0.6rem; padding: 2px 6px; border-radius: 999px; background: ${color}18; color: ${color}; font-weight: 600;">${rec.dimension || 'general'}</span>
              ${rec.priority ? `<span style="font-size: 0.6rem; padding: 2px 6px; border-radius: 999px; background: rgba(239,68,68,0.1); color: #ef4444; font-weight: 600;">${rec.priority}</span>` : ''}
              ${rec.timeframe ? `<span style="font-size: 0.6rem; color: var(--text-muted); margin-left: auto;">⏱ ${rec.timeframe}</span>` : ''}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 600; margin-bottom: 4px;">${rec.action}</div>
            ${rec.reasoning ? `<div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5;">${rec.reasoning}</div>` : ''}
            ${rec.expected_impact ? `<div style="font-size: 0.7rem; color: #10b981; margin-top: 4px;">${t('meta.expectedImpact')} ${rec.expected_impact}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
