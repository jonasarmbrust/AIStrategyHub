/**
 * Sources & Attribution — Full transparency on framework origins.
 * Shows all source frameworks, checkpoint counts, and official references.
 */
import { api, getSourceColor } from '../main.js';
import { t } from '../i18n.js';
import { sanitizeHTML, escapeHTML } from '../sanitize.js';

const FRAMEWORKS = [
  {
    id: 'nist',
    name: 'NIST AI Risk Management Framework',
    short: 'NIST AI RMF',
    version: 'AI RMF 1.0',
    org: 'National Institute of Standards and Technology (U.S. Department of Commerce)',
    type: 'Voluntary',
    typeBadge: '🟢 Voluntary',
    url: 'https://airc.nist.gov/AI_RMF_Playbook',
    icon: '🇺🇸',
    description: 'A risk-based framework structured around four core functions — Govern, Map, Measure, Manage — designed to help organizations identify, assess, and mitigate AI risks throughout the system lifecycle.',
    focus: ['Risk management', 'Governance', 'Trustworthy AI characteristics', 'Accountability'],
    published: 'January 2023',
    matchKey: 'NIST',
  },
  {
    id: 'eu',
    name: 'EU AI Act',
    short: 'EU AI Act',
    version: 'Regulation (EU) 2024/1689',
    org: 'European Parliament & Council of the European Union',
    type: 'Mandatory',
    typeBadge: '🔴 Mandatory (EU)',
    url: 'https://eur-lex.europa.eu/eli/reg/2024/1689',
    icon: '🇪🇺',
    description: 'The world\'s first comprehensive, legally binding AI regulation. Classifies AI systems into four risk tiers (Unacceptable → Minimal) and imposes obligations proportional to the risk level. Non-compliance fines up to €35M or 7% global turnover.',
    focus: ['Risk classification', 'Compliance requirements', 'Prohibited practices', 'Transparency obligations'],
    published: 'July 2024 (enforcement: Feb 2025 – Aug 2027)',
    matchKey: 'EU AI Act',
  },
  {
    id: 'google',
    name: 'Google Cloud AI Adoption Framework',
    short: 'Google AI Adoption',
    version: 'Cloud AI Adoption Framework',
    org: 'Google Cloud',
    type: 'Best Practice',
    typeBadge: '🟡 Best Practice',
    url: 'https://cloud.google.com/adoption-framework/ai',
    icon: '🔷',
    description: 'A cloud-native AI adoption guide structured around three pillars — Learn, Lead, Scale — covering strategy, talent, processes, and technology for enterprise AI transformation at scale.',
    focus: ['AI strategy alignment', 'Executive sponsorship', 'Cloud ML infrastructure', 'Scaling patterns'],
    published: '2023 (continuously updated)',
    matchKey: 'Google',
  },
  {
    id: 'microsoft',
    name: 'Microsoft Responsible AI Maturity Model',
    short: 'Microsoft RAI MM',
    version: 'Responsible AI Maturity Model',
    org: 'Microsoft Corporation',
    type: 'Best Practice',
    typeBadge: '🟡 Best Practice',
    url: 'https://www.microsoft.com/en-us/ai/responsible-ai',
    icon: '🟦',
    description: 'A maturity model for operationalizing responsible AI practices at enterprise scale. Covers fairness, reliability, privacy, security, inclusiveness, transparency, and accountability across five maturity stages.',
    focus: ['Responsible AI principles', 'Fairness & bias', 'Transparency', 'Impact assessments'],
    published: '2022 (updated 2024)',
    matchKey: 'Microsoft',
  },
  {
    id: 'owasp',
    name: 'OWASP AI Security & Privacy Guide',
    short: 'OWASP AI Security',
    version: 'AI Security Matrix v1',
    org: 'OWASP Foundation (Open Worldwide Application Security Project)',
    type: 'Voluntary',
    typeBadge: '🟢 Voluntary',
    url: 'https://owasp.org/www-project-ai-security-and-privacy-guide/',
    icon: '🛡️',
    description: 'A comprehensive guide addressing security threats specific to AI/ML systems — including adversarial attacks, model theft, data poisoning, and supply chain risks. Maps AI-specific threats to mitigation strategies.',
    focus: ['AI-specific security threats', 'Adversarial robustness', 'Model supply chain', 'Privacy engineering'],
    published: '2023 (continuously updated)',
    matchKey: 'OWASP',
  },
  {
    id: 'unesco',
    name: 'UNESCO Recommendation on the Ethics of AI',
    short: 'UNESCO AI Readiness',
    version: 'AI Readiness Assessment Methodology',
    org: 'United Nations Educational, Scientific and Cultural Organization',
    type: 'Recommendation',
    typeBadge: '🔵 UN Recommendation',
    url: 'https://www.unesco.org/en/artificial-intelligence/recommendation-ethics',
    icon: '🌍',
    description: 'A global ethical framework adopted by 193 member states. The AI Readiness Assessment Methodology evaluates national and organizational preparedness across legal, economic, technological, social, and educational dimensions.',
    focus: ['Ethical AI principles', 'Human rights', 'AI literacy', 'Global readiness indicators'],
    published: 'November 2021',
    matchKey: 'UNESCO',
  },
];

export async function renderSources(container) {
  let model = null;
  try {
    model = await api.get('/checklist/model');
  } catch { /* offline fallback */ }

  // Count checkpoints per framework
  const fwCounts = {};
  let totalCheckpoints = 0;
  if (model?.dimensions) {
    model.dimensions.forEach(dim => {
      dim.checkpoints.forEach(cp => {
        totalCheckpoints++;
        const allSources = [
          ...(cp.sources || []),
          ...(cp.evidence_tags || []).map(t => t.source),
        ];
        FRAMEWORKS.forEach(fw => {
          if (allSources.some(s => s.includes(fw.matchKey))) {
            fwCounts[fw.id] = (fwCounts[fw.id] || 0) + 1;
          }
        });
      });
    });
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('sources.title')}</h1>
      <p class="page-description">${t('sources.desc')}</p>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 0ms">
      <div class="card-header border-none">
        <span class="card-title">${t('sources.coverageTitle')}</span>
        <span style="font-size: 0.78rem; color: var(--text-muted);">${t('sources.checkpointsTotal').replace('{count}', totalCheckpoints)}</span>
      </div>
      <div class="grid-3" style="gap: 12px;">
        ${FRAMEWORKS.map(fw => {
          const count = fwCounts[fw.id] || 0;
          const pct = totalCheckpoints > 0 ? Math.round(count / totalCheckpoints * 100) : 0;
          const color = getSourceColor(fw.short);
          return `
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.04);">
              <span style="font-size: 1.4rem;">${fw.icon}</span>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fw.short}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${t('sources.checkpointsPct').replace('{count}', count).replace('{pct}', pct)}</div>
              </div>
              <div style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${color}15; border: 2px solid ${color}40;">
                <span style="font-size: 0.85rem; font-weight: 700; color: ${color};">${count}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div id="framework-details">
      ${FRAMEWORKS.map((fw, idx) => {
        const count = fwCounts[fw.id] || 0;
        const color = getSourceColor(fw.short);
        return `
          <div class="card mb-lg fade-in" style="animation-delay: ${(idx + 1) * 60}ms; border-left: 3px solid ${color};">
            <div style="display: flex; gap: 20px; align-items: flex-start;">
              <div style="font-size: 2.5rem; line-height: 1;">${fw.icon}</div>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${fw.name}</h3>
                    <div style="font-size: 0.78rem; color: var(--text-secondary);">${fw.org}</div>
                  </div>
                  <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <span style="font-size: 0.68rem; padding: 3px 10px; border-radius: 999px; background: ${color}12; color: ${color}; font-weight: 600;">${fw.typeBadge}</span>
                    <span style="font-size: 0.68rem; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,0.04); color: var(--text-muted);">${t('builder.checkpointsLabel').replace('{count}', count)}</span>
                  </div>
                </div>

                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; margin: 12px 0;">${fw.description}</p>

                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                  ${fw.focus.map(f => `<span style="font-size: 0.7rem; padding: 3px 10px; border-radius: 6px; background: rgba(255,255,255,0.04); color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.06);">${f}</span>`).join('')}
                </div>

                <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.75rem; color: var(--text-muted);">
                  <span>${t('sources.version').replace('{version}', fw.version)}</span>
                  <span>${t('sources.published').replace('{date}', fw.published)}</span>
                  <a href="${fw.url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-blue); text-decoration: none; transition: opacity 0.2s;">${t('sources.officialSource')}</a>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="card fade-in" style="animation-delay: 450ms;">
      <div class="card-header">
        <span class="card-title">${t('sources.disclaimerTitle')}</span>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.8;">
        <p style="margin-bottom: 12px;">
          ${t('sources.disclaimer1')}
        </p>
        <p style="margin-bottom: 12px;">
          ${t('sources.disclaimer2')}
        </p>
        <p>
          ${t('sources.disclaimer3')}
        </p>
      </div>
    </div>
  `;
}
