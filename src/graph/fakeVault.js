const CLUSTERS = [
  { id: "work", label: "Work", color: "#9a8cff", seeds: ["Client notes", "Weekly review", "Operations", "Strategy", "Finance"] },
  { id: "projects", label: "Projects", color: "#73a7ff", seeds: ["RovaOS", "Q3 planning", "Launch notes", "Research sprint", "Roadmap"] },
  { id: "daily", label: "Daily notes", color: "#a9a5bf", seeds: ["Daily", "Journal", "Morning pages", "Weekly note", "Retrospective"] },
  { id: "people", label: "People", color: "#e1a96b", seeds: ["Meeting with", "One-on-one", "Conversation", "Follow-up", "Introductions"] },
  { id: "research", label: "Research", color: "#6fc2a3", seeds: ["Reading list", "Book notes", "Article", "Idea", "Reference"] },
  { id: "personal", label: "Personal", color: "#d884ad", seeds: ["Health", "Travel", "Home", "Goals", "Learning"] },
];

const SUFFIXES = [
  "overview",
  "next actions",
  "open questions",
  "notes",
  "ideas",
  "archive",
  "decisions",
  "resources",
  "checklist",
  "draft",
  "review",
  "follow-up",
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function noteTitle(cluster, index, random) {
  if (cluster.id === "daily") {
    const day = String((index % 28) + 1).padStart(2, "0");
    const month = String(((index * 5) % 12) + 1).padStart(2, "0");
    const year = 2024 + (index % 3);
    return `Daily ${year}-${month}-${day}`;
  }
  if (cluster.id === "people") {
    const names = ["Rohan", "Ben", "Maya", "Ariane", "Ananta", "Prashant", "Raj", "Shivani", "Maneesh"];
    return `${pick(cluster.seeds, random)} ${pick(names, random)}`;
  }
  return `${pick(cluster.seeds, random)} — ${pick(SUFFIXES, random)}`;
}

function linkKey(source, target) {
  return source < target ? `${source}|${target}` : `${target}|${source}`;
}

export function createFakeVault({ count = 450, seed = 20260710 } = {}) {
  const random = mulberry32(seed);
  const nodes = [];
  const links = [];
  const linkSet = new Set();
  const clusterBuckets = new Map(CLUSTERS.map((cluster) => [cluster.id, []]));

  for (let index = 0; index < count; index += 1) {
    const clusterIndex = index % CLUSTERS.length;
    const cluster = CLUSTERS[clusterIndex];
    const angle = (clusterIndex / CLUSTERS.length) * Math.PI * 2 - Math.PI / 2;
    const centerRadius = 235;
    const centerX = Math.cos(angle) * centerRadius;
    const centerY = Math.sin(angle) * centerRadius * 0.72;
    const spread = 36 + Math.sqrt(index / CLUSTERS.length) * 18;
    const theta = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * spread;
    const title = noteTitle(cluster, index, random);
    const id = `note-${String(index + 1).padStart(3, "0")}`;
    const node = {
      id,
      index,
      title,
      cluster: cluster.id,
      clusterLabel: cluster.label,
      color: cluster.color,
      tag: `#${cluster.id}`,
      attachment: index % 23 === 0,
      existing: index % 17 !== 0,
      isOrphan: index >= count - 12,
      body: `Working notes for ${title.toLowerCase()}.\nCapture context, decisions, and the next useful action while the idea is fresh.`,
      x: centerX + Math.cos(theta) * radius,
      y: centerY + Math.sin(theta) * radius,
      vx: (random() - 0.5) * 0.3,
      vy: (random() - 0.5) * 0.3,
      degree: 0,
      radius: 2.4,
    };
    nodes.push(node);
    clusterBuckets.get(cluster.id).push(node);
  }

  function addLink(source, target, kind = "local") {
    if (!source || !target || source.id === target.id || source.isOrphan || target.isOrphan) return;
    const key = linkKey(source.id, target.id);
    if (linkSet.has(key)) return;
    linkSet.add(key);
    links.push({ source, target, kind });
    source.degree += 1;
    target.degree += 1;
  }

  for (const cluster of CLUSTERS) {
    const bucket = clusterBuckets.get(cluster.id);
    for (let index = 1; index < bucket.length; index += 1) {
      const node = bucket[index];
      addLink(node, bucket[Math.floor(random() * Math.min(index, 18))]);
      if (random() > 0.22) addLink(node, bucket[Math.floor(random() * index)]);
      if (random() > 0.64) addLink(node, bucket[Math.floor(random() * index)]);
    }
  }

  for (let index = 0; index < count * 0.24; index += 1) {
    const source = nodes[Math.floor(random() * nodes.length)];
    let target = nodes[Math.floor(random() * nodes.length)];
    if (target.cluster === source.cluster) {
      target = nodes[(target.index + 1 + Math.floor(random() * 47)) % nodes.length];
    }
    addLink(source, target, "cross");
  }

  for (const node of nodes) {
    node.radius = Math.min(7.2, 2.05 + Math.sqrt(node.degree + 1) * 0.72);
  }

  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const link of links) {
    adjacency.get(link.source.id).add(link.target.id);
    adjacency.get(link.target.id).add(link.source.id);
  }

  return {
    nodes,
    links,
    adjacency,
    clusters: CLUSTERS.map((cluster) => ({ ...cluster, count: clusterBuckets.get(cluster.id).length })),
  };
}
