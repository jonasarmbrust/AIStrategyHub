/**
 * Dependency Map — Interactive force-directed graph of checkpoint relationships.
 * Uses Canvas 2D API for performance (no D3 dependency).
 */
import { api, getScoreColor } from '../main.js';
import { t } from '../i18n.js';

const DIM_COLORS = {
  strategy: '#3b82f6',
  data: '#10b981',
  governance: '#f59e0b',
  technology: '#8b5cf6',
  talent: '#ec4899',
  ethics: '#06b6d4',
  processes: '#f97316',
};

const DIM_LABELS = {
  strategy: 'Strategy',
  data: 'Data & Infra',
  governance: 'Governance',
  technology: 'Tech & MLOps',
  talent: 'Talent',
  ethics: 'Ethics & RAI',
  processes: 'Processes',
};

export function renderDependencies(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">🔗 ${t('nav.dependencies') || 'Checkpoint Dependency Map'}</h1>
      <p class="page-description">Interactive visualization of checkpoint relationships across dimensions. Nodes are sized by maturity level, colored by dimension. Connected checkpoints share source frameworks.</p>
    </div>

    <div class="card mb-xl fade-in" style="animation-delay: 100ms">
      <div class="card-header">
        <span class="card-title">Force-Directed Graph</span>
        <div class="flex gap-md" style="align-items: center;">
          <label style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <input type="checkbox" id="dep-show-labels" checked style="accent-color: var(--accent-blue);"> Labels
          </label>
          <button id="dep-reset" class="btn btn-secondary btn-sm">Reset View</button>
        </div>
      </div>
      <div style="position: relative; border-radius: var(--radius-md); overflow: hidden; background: rgba(0,0,0,0.15);">
        <canvas id="dep-canvas" style="width: 100%; height: 520px; display: block; cursor: grab;"></canvas>
      </div>
    </div>

    <div class="card fade-in" style="animation-delay: 200ms">
      <div class="card-header">
        <span class="card-title">Legend</span>
      </div>
      <div id="dep-legend" class="flex gap-md" style="flex-wrap: wrap; padding: 8px 0;"></div>
    </div>

    <div class="card fade-in mt-lg" style="animation-delay: 300ms">
      <div class="card-header">
        <span class="card-title">Selected Checkpoint</span>
      </div>
      <div id="dep-details" style="padding: 8px 0; min-height: 60px;">
        <p style="color: var(--text-muted); font-size: 0.85rem;">Click a node to see checkpoint details.</p>
      </div>
    </div>
  `;

  renderLegend();
  initGraph();
}

function renderLegend() {
  const el = document.getElementById('dep-legend');
  if (!el) return;
  el.innerHTML = Object.entries(DIM_LABELS).map(([id, label]) => {
    const color = DIM_COLORS[id];
    return `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-secondary);">
      <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
      ${label}
    </span>`;
  }).join('');
}

async function initGraph() {
  const canvas = document.getElementById('dep-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = 520 * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const W = rect.width;
  const H = 520;

  let model;
  try {
    model = await api.get('/checklist/model');
  } catch { return; }

  // Build nodes and edges
  const nodes = [];
  const edges = [];
  const nodeMap = {};

  model.dimensions.forEach((dim, di) => {
    const angle = (di / model.dimensions.length) * Math.PI * 2;
    const cx = W / 2 + Math.cos(angle) * (W * 0.3);
    const cy = H / 2 + Math.sin(angle) * (H * 0.3);

    dim.checkpoints.forEach((cp, ci) => {
      const spread = 40;
      const node = {
        id: cp.id,
        text: cp.text,
        dim: dim.id,
        dimName: dim.name,
        level: cp.min_level,
        sources: cp.sources || [],
        category: cp.category || '',
        x: cx + (Math.random() - 0.5) * spread * 3,
        y: cy + (Math.random() - 0.5) * spread * 3,
        vx: 0,
        vy: 0,
        radius: 4 + cp.min_level * 2,
        color: DIM_COLORS[dim.id] || '#888',
      };
      nodes.push(node);
      nodeMap[cp.id] = node;
    });
  });

  // Create edges: connect checkpoints within same category across dimensions
  const categoryMap = {};
  nodes.forEach(n => {
    if (!n.category) return;
    if (!categoryMap[n.category]) categoryMap[n.category] = [];
    categoryMap[n.category].push(n);
  });

  Object.values(categoryMap).forEach(group => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].dim !== group[j].dim) {
          edges.push({ source: group[i], target: group[j] });
        }
      }
    }
  });

  // Also connect sequential level checkpoints within same dimension
  model.dimensions.forEach(dim => {
    const sorted = dim.checkpoints
      .map(cp => nodeMap[cp.id])
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].level - sorted[i].level <= 1) {
        edges.push({ source: sorted[i], target: sorted[i + 1] });
      }
    }
  });

  // Simulation state
  let showLabels = true;
  let selectedNode = null;
  let dragNode = null;
  let offsetX = 0, offsetY = 0;

  document.getElementById('dep-show-labels')?.addEventListener('change', (e) => {
    showLabels = e.target.checked;
  });

  document.getElementById('dep-reset')?.addEventListener('click', () => {
    selectedNode = null;
    nodes.forEach((n, i) => {
      const di = model.dimensions.findIndex(d => d.id === n.dim);
      const angle = (di / model.dimensions.length) * Math.PI * 2;
      n.x = W / 2 + Math.cos(angle) * (W * 0.3) + (Math.random() - 0.5) * 120;
      n.y = H / 2 + Math.sin(angle) * (H * 0.3) + (Math.random() - 0.5) * 120;
      n.vx = 0; n.vy = 0;
    });
  });

  // Mouse interaction
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    for (const n of nodes) {
      const dx = n.x - mx, dy = n.y - my;
      if (dx * dx + dy * dy < (n.radius + 4) ** 2) {
        dragNode = n;
        offsetX = dx; offsetY = dy;
        canvas.style.cursor = 'grabbing';
        selectedNode = n;
        showDetails(n);
        return;
      }
    }
    selectedNode = null;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!dragNode) return;
    const r = canvas.getBoundingClientRect();
    dragNode.x = e.clientX - r.left + offsetX;
    dragNode.y = e.clientY - r.top + offsetY;
    dragNode.vx = 0; dragNode.vy = 0;
  });

  canvas.addEventListener('mouseup', () => {
    dragNode = null;
    canvas.style.cursor = 'grab';
  });

  // Physics simulation
  function simulate() {
    const repulsion = 800;
    const attraction = 0.005;
    const damping = 0.85;
    const centerPull = 0.001;

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = repulsion / (dist * dist);
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        if (a !== dragNode) { a.vx += fx; a.vy += fy; }
        if (b !== dragNode) { b.vx -= fx; b.vy -= fy; }
      }
    }

    // Attraction along edges
    edges.forEach(e => {
      let dx = e.target.x - e.source.x;
      let dy = e.target.y - e.source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = dist * attraction;
      let fx = (dx / dist) * force;
      let fy = (dy / dist) * force;
      if (e.source !== dragNode) { e.source.vx += fx; e.source.vy += fy; }
      if (e.target !== dragNode) { e.target.vx -= fx; e.target.vy -= fy; }
    });

    // Center pull
    nodes.forEach(n => {
      if (n === dragNode) return;
      n.vx += (W / 2 - n.x) * centerPull;
      n.vy += (H / 2 - n.y) * centerPull;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.radius, Math.min(W - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(H - n.radius, n.y));
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw edges
    edges.forEach(e => {
      const isHighlighted = selectedNode && (e.source === selectedNode || e.target === selectedNode);
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.04)';
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(n => {
      const isSelected = n === selectedNode;
      const isConnected = selectedNode && edges.some(e =>
        (e.source === selectedNode && e.target === n) ||
        (e.target === selectedNode && e.source === n)
      );
      const alpha = selectedNode ? (isSelected || isConnected ? 1 : 0.25) : 0.85;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = n.color + (alpha < 1 ? '40' : '');
      if (alpha >= 0.8) ctx.fillStyle = n.color;
      ctx.fill();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (showLabels && n.radius >= 8) {
        ctx.fillStyle = alpha >= 0.8 ? 'rgba(240,241,248,0.7)' : 'rgba(240,241,248,0.2)';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.id, n.x, n.y + n.radius + 12);
      }
    });

    simulate();
    requestAnimationFrame(draw);
  }

  draw();
}

function showDetails(node) {
  const el = document.getElementById('dep-details');
  if (!el || !node) return;

  el.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 16px;">
      <div style="width: 14px; height: 14px; border-radius: 50%; background: ${node.color}; margin-top: 3px; flex-shrink: 0;"></div>
      <div>
        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${node.id}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">${node.text}</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.78rem;">
          <span style="color: var(--text-muted);">📐 Dimension: <strong style="color: ${node.color};">${node.dimName}</strong></span>
          <span style="color: var(--text-muted);">⭐ Level: <strong>${node.level}</strong></span>
          <span style="color: var(--text-muted);">📂 Category: <strong>${node.category}</strong></span>
          <span style="color: var(--text-muted);">📚 Sources: <strong>${node.sources.join(', ') || 'N/A'}</strong></span>
        </div>
      </div>
    </div>
  `;
}
