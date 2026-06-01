/**
 * AI Strategy Hub
 * Main Application Entry Point
 * SPA Router and toast notifications.
 * Build: 2026-06-01T09:15
 */
import './styles/index.css';
import './styles/toast.css';
import './styles/evidence.css';
import { renderDashboard } from './pages/dashboard.js';
import { renderExplorer } from './pages/explorer.js';
import { renderAssessment } from './pages/checklist.js';
import { renderAnalyzer } from './pages/analyzer.js';
import { renderResearch } from './pages/research.js';
import { renderRoadmap } from './pages/roadmap.js';
import { renderMetaStrategy } from './pages/meta_strategy.js';
import { renderReport } from './pages/report.js';
import { renderEuAiAct } from './pages/eu_ai_act.js';
import { renderFrameworkBuilder } from './pages/framework_builder.js';
import { renderAdvisor } from './pages/advisor.js';
import { renderSimulator } from './pages/simulator.js';
import { renderSources } from './pages/sources.js';
import { renderEvolution } from './pages/evolution.js';
import { renderPlaybook } from './pages/playbook.js';
import { renderDependencies } from './pages/dependencies.js';
import { t, getLang, toggleLang, updateStaticDOM } from './i18n.js';
import { sanitizeHTML, escapeHTML } from './sanitize.js';
import { api } from './api/client.js';
// The import auto-registers window.api via the module
export { api };
export { sanitizeHTML, escapeHTML };

// ── Toast Notifications ────────────────────────────────────
let toastContainer = null;

export function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const sanitizedMessage = sanitizeHTML(message);
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${sanitizedMessage}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Router ─────────────────────────────────────────────────
const routes = {
  dashboard: renderDashboard,
  explorer: renderExplorer,
  assessment: renderAssessment,
  checklist: renderAssessment,  // backward compat
  analyzer: renderAnalyzer,
  research: renderResearch,
  roadmap: renderRoadmap,
  'meta-strategy': renderMetaStrategy,
  metastrategy: renderMetaStrategy,  // backward compat
  report: renderReport,
  'eu-ai-act': renderEuAiAct,
  'framework-builder': renderFrameworkBuilder,
  advisor: renderAdvisor,
  simulator: renderSimulator,
  dependencies: renderDependencies,
  sources: renderSources,
  evolution: renderEvolution,
  playbook: renderPlaybook,
};

let currentCleanup = null;

function navigateTo(page) {
  const main = document.getElementById('main-content');
  if (!main) return;

  // Cleanup previous page
  if (currentCleanup) {
    try { currentCleanup(); } catch (e) { console.warn('Page cleanup error:', e); }
    currentCleanup = null;
  }

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Fade transition
  main.style.opacity = '0';
  main.style.transform = 'translateY(8px)';

  setTimeout(() => {
    const renderer = routes[page] || routes.dashboard;
    const result = renderer(main);

    // Store cleanup if the page module provides one
    if (result && typeof result.cleanup === 'function') {
      currentCleanup = result.cleanup;
    } else if (typeof result === 'function') {
      currentCleanup = result;
    }

    main.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    main.style.opacity = '1';
    main.style.transform = 'translateY(0)';
  }, 150);
}

// ── Health Check ───────────────────────────────────────────
async function checkBackendHealth() {
  const statusEl = document.getElementById('api-status');
  if (!statusEl) return;
  try {
    await api.get('/health');
    statusEl.innerHTML = `<span class="status-dot online"></span><span data-i18n="nav.backendOnline">${t('nav.backendOnline')}</span>`;
  } catch {
    statusEl.innerHTML = `<span class="status-dot offline"></span><span data-i18n="nav.backendOffline">${t('nav.backendOffline')}</span>`;
  }
}

// ── Init ───────────────────────────────────────────────────
function init() {
  // Handle hash navigation
  const getPage = () => (window.location.hash.slice(1) || 'dashboard');

  window.addEventListener('hashchange', () => navigateTo(getPage()));

  // Nav link clicks
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = link.dataset.page;
    });
  });

  // Initial render
  updateStaticDOM();
  navigateTo(getPage());

  // Lang toggle click
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      toggleLang();
      navigateTo(getPage()); // Re-render current page
    });
  }

  // Theme toggle
  initTheme();
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ash_theme', next);
      updateThemeIcon(next);
    });
  }

  // Health check
  checkBackendHealth();
  setInterval(checkBackendHealth, 15000);
}

function initTheme() {
  const saved = localStorage.getItem('ash_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
    updateThemeIcon('light');
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
}

// ── Level helpers ──────────────────────────────────────────
export const LEVEL_NAMES = ['', 'Exploring', 'Experimenting', 'Operationalizing', 'Scaling', 'Transforming'];
export const LEVEL_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

export function getLevelName(level) {
  const levels = ['', t('levels.exploring'), t('levels.experimenting'), t('levels.operationalizing'), t('levels.scaling'), t('levels.transforming')];
  return levels[level] || 'Unknown';
}

export function getLevelBadge(level) {
  return `<span class="level-badge level-${level}">${getLevelName(level)}</span>`;
}

export function getScoreColor(score) {
  if (score >= 80) return '#3b82f6';
  if (score >= 60) return '#22c55e';
  if (score >= 40) return '#eab308';
  if (score >= 20) return '#f97316';
  return '#ef4444';
}

// ── Evidence Tag helpers ───────────────────────────────────
const SOURCE_COLORS = {
  'NIST': '#3b82f6',
  'EU AI Act': '#f59e0b',
  'Google': '#10b981',
  'Microsoft': '#8b5cf6',
  'OWASP': '#f97316',
  'UNESCO': '#06b6d4',
};

export function getSourceColor(sourceName) {
  for (const [key, color] of Object.entries(SOURCE_COLORS)) {
    if (sourceName.includes(key)) return color;
  }
  return '#8890b5';
}

export function renderEvidenceTags(tags) {
  if (!tags || tags.length === 0) return '';
  return tags.map(tag => {
    const color = getSourceColor(tag.source);
    const urlEscaped = tag.url ? escapeHTML(tag.url) : '';
    const sourceText = escapeHTML(tag.source.split(' ').slice(0, 2).join(' '));
    const refText = escapeHTML(tag.reference);
    const titleText = escapeHTML(`${tag.source}: ${tag.reference}`);
    
    const tagContent = `
      <span class="evidence-tag-source">${sourceText}</span>
      <span class="evidence-tag-ref">${refText}</span>
    `;
    
    if (urlEscaped) {
      return `<a href="${urlEscaped}" target="_blank" rel="noopener" class="evidence-tag" style="--tag-color: ${color}; text-decoration: none; display: inline-flex;" title="${titleText}">
        ${tagContent}
      </a>`;
    }
    return `<span class="evidence-tag" style="--tag-color: ${color};" title="${titleText}">
      ${tagContent}
    </span>`;
  }).join('');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
