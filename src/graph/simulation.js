const DEFAULTS = {
  repel: 22,
  linkDistance: 38,
  linkStrength: 0.095,
  center: 0.055,
  velocityDecay: 0.82,
  alphaDecay: 0.955,
};

function makeCell(x, y, size) {
  return { x, y, size, mass: 0, cx: 0, cy: 0, point: null, children: null };
}

function childIndex(cell, node) {
  const right = node.x >= cell.x + cell.size / 2 ? 1 : 0;
  const bottom = node.y >= cell.y + cell.size / 2 ? 2 : 0;
  return right + bottom;
}

function splitCell(cell) {
  const half = cell.size / 2;
  cell.children = [
    makeCell(cell.x, cell.y, half),
    makeCell(cell.x + half, cell.y, half),
    makeCell(cell.x, cell.y + half, half),
    makeCell(cell.x + half, cell.y + half, half),
  ];
}

function insert(cell, node, depth = 0) {
  if (!cell.children && !cell.point) {
    cell.point = node;
    return;
  }
  if (!cell.children) {
    if (depth > 18 || cell.size < 0.05) return;
    const existing = cell.point;
    cell.point = null;
    splitCell(cell);
    insert(cell.children[childIndex(cell, existing)], existing, depth + 1);
  }
  insert(cell.children[childIndex(cell, node)], node, depth + 1);
}

function aggregate(cell) {
  if (!cell.children) {
    if (cell.point) {
      cell.mass = 1;
      cell.cx = cell.point.x;
      cell.cy = cell.point.y;
    }
    return;
  }
  let mass = 0;
  let cx = 0;
  let cy = 0;
  for (const child of cell.children) {
    aggregate(child);
    mass += child.mass;
    cx += child.cx * child.mass;
    cy += child.cy * child.mass;
  }
  cell.mass = mass;
  if (mass) {
    cell.cx = cx / mass;
    cell.cy = cy / mass;
  }
}

function buildTree(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const size = Math.max(1, maxX - minX, maxY - minY) * 1.001;
  const root = makeCell(minX, minY, size);
  for (const node of nodes) insert(root, node);
  aggregate(root);
  return root;
}

function applyRepulsion(node, cell, strength, alpha) {
  if (!cell.mass) return;
  const dx = node.x - cell.cx;
  const dy = node.y - cell.cy;
  const distanceSq = dx * dx + dy * dy + 3.5;
  const distance = Math.sqrt(distanceSq);
  const isSelfLeaf = !cell.children && cell.point === node;
  if (isSelfLeaf) return;

  if (!cell.children || cell.size / distance < 0.72) {
    const force = (strength * cell.mass * alpha) / distanceSq;
    node.vx += (dx / distance) * force;
    node.vy += (dy / distance) * force;
    return;
  }
  for (const child of cell.children) applyRepulsion(node, child, strength, alpha);
}

export function createSimulation(nodes, links, initial = {}) {
  let options = { ...DEFAULTS, ...initial };
  let alpha = 1;

  function tick() {
    if (alpha < 0.001) return false;
    const tree = buildTree(nodes);
    for (const node of nodes) applyRepulsion(node, tree, options.repel, alpha);

    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const delta = distance - options.linkDistance;
      const force = delta * options.linkStrength * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (link.source.fx == null) {
        link.source.vx += fx;
        link.source.vy += fy;
      }
      if (link.target.fx == null) {
        link.target.vx -= fx;
        link.target.vy -= fy;
      }
    }

    for (const node of nodes) {
      if (node.fx != null && node.fy != null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += -node.x * options.center * alpha * 0.012;
      node.vy += -node.y * options.center * alpha * 0.012;
      node.vx *= options.velocityDecay;
      node.vy *= options.velocityDecay;
      node.x += node.vx;
      node.y += node.vy;
    }
    alpha *= options.alphaDecay;
    return alpha >= 0.001;
  }

  return {
    tick,
    settle(iterations = 220) {
      alpha = 1;
      for (let index = 0; index < iterations && alpha >= 0.001; index += 1) tick();
      alpha = 0;
    },
    reheat(value = 0.42) {
      alpha = Math.max(alpha, value);
    },
    setOptions(next) {
      options = { ...options, ...next };
    },
    getAlpha() {
      return alpha;
    },
    isActive() {
      return alpha >= 0.001;
    },
  };
}

