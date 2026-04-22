/**
 * AI Strategy Hub
 * Main Application Entry Point
 * SPA Router, API client, and toast notifications.
 */
import './styles/index.css';
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
// ── Config ─────────────────────────────────────────────────
const API_BASE = '/api';

// ── API Client ─────────────────────────────────────────────
export const api = {
  async get(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
        let errStr = `API Error: ${res.status}`;
        try {
            const errData = await res.json();
            if (errData.detail) errStr = errData.detail;
        } catch (e) {}
        throw new Error(errStr);
    }
    return res.json();
  },

  async postFile(path, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async postDownload(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1] : 'ai_strategy_hub_report';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  async patch(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async delete(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
};

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
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
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
};

function navigateTo(page) {
  const main = document.getElementById('main-content');
  if (!main) return;

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Fade transition
  main.style.opacity = '0';
  main.style.transform = 'translateY(8px)';

  setTimeout(() => {
    const renderer = routes[page] || routes.dashboard;
    renderer(main);
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
    statusEl.innerHTML = '<span class="status-dot online"></span><span>Backend Online</span>';
  } catch {
    statusEl.innerHTML = '<span class="status-dot offline"></span><span>Backend Offline</span>';
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
  navigateTo(getPage());

  // Health check
  checkBackendHealth();
  setInterval(checkBackendHealth, 15000);
}

// ── Level helpers ──────────────────────────────────────────
export const LEVEL_NAMES = ['', 'Exploring', 'Experimenting', 'Operationalizing', 'Scaling', 'Transforming'];
export const LEVEL_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

export function getLevelBadge(level) {
  return `<span class="level-badge level-${level}">${LEVEL_NAMES[level] || 'Unknown'}</span>`;
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
    const urlAttr = tag.url ? `onclick="window.open('${tag.url}', '_blank')" style="cursor:pointer;"` : '';
    return `<span class="evidence-tag" ${urlAttr} style="--tag-color: ${color};" title="${tag.source}: ${tag.reference}">
      <span class="evidence-tag-source">${tag.source.split(' ').slice(0, 2).join(' ')}</span>
      <span class="evidence-tag-ref">${tag.reference}</span>
    </span>`;
  }).join('');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
