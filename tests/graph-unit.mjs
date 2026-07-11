import assert from "node:assert/strict";
import { createFakeVault } from "../src/graph/fakeVault.js";
import { createSimulation } from "../src/graph/simulation.js";

function snapshot(vault) {
  return {
    nodes: vault.nodes.map(({ id, title, cluster, x, y, degree, radius, attachment, existing, isOrphan }) => ({
      id,
      title,
      cluster,
      x,
      y,
      degree,
      radius,
      attachment,
      existing,
      isOrphan,
    })),
    links: vault.links.map((link) => [link.source.id, link.target.id, link.kind]),
    clusters: vault.clusters,
  };
}

function averageRadius(nodes) {
  return nodes.reduce((total, node) => total + Math.hypot(node.x, node.y), 0) / nodes.length;
}

const first = createFakeVault();
const second = createFakeVault();
assert.deepEqual(snapshot(first), snapshot(second), "the seeded vault should be deterministic");
assert.equal(first.nodes.length, 450, "vault should contain the specified 450-node scale");
assert.equal(first.clusters.length, 6, "vault should contain six visual groups");
assert.equal(new Set(first.nodes.map((node) => node.id)).size, first.nodes.length, "node ids must be unique");

const ids = new Set(first.nodes.map((node) => node.id));
const edgeKeys = new Set();
for (const link of first.links) {
  assert.ok(ids.has(link.source.id) && ids.has(link.target.id), "every link endpoint must exist");
  assert.notEqual(link.source.id, link.target.id, "self links are not allowed");
  const key = [link.source.id, link.target.id].sort().join("|");
  assert.equal(edgeKeys.has(key), false, `duplicate link ${key}`);
  edgeKeys.add(key);
}

for (const node of first.nodes) {
  assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.id} must have finite coordinates`);
  assert.ok(node.radius >= 2, `${node.id} must have a degree-derived radius`);
  assert.ok(node.title && node.body && node.tag, `${node.id} must have preview content`);
}
assert.equal(first.nodes.filter((node) => node.degree === 0).length, 12, "the filter fixture should include twelve orphans");

const settledA = createFakeVault({ count: 96, seed: 12 });
const settledB = createFakeVault({ count: 96, seed: 12 });
createSimulation(settledA.nodes, settledA.links).settle(140);
createSimulation(settledB.nodes, settledB.links).settle(140);
for (let index = 0; index < settledA.nodes.length; index += 1) {
  assert.ok(Math.abs(settledA.nodes[index].x - settledB.nodes[index].x) < 1e-9, "settling should be deterministic on x");
  assert.ok(Math.abs(settledA.nodes[index].y - settledB.nodes[index].y) < 1e-9, "settling should be deterministic on y");
}

const lowRepel = createFakeVault({ count: 96, seed: 44 });
const highRepel = createFakeVault({ count: 96, seed: 44 });
createSimulation(lowRepel.nodes, lowRepel.links, { repel: 3 }).settle(160);
createSimulation(highRepel.nodes, highRepel.links, { repel: 64 }).settle(160);
assert.ok(averageRadius(highRepel.nodes) > averageRadius(lowRepel.nodes), "repel control should materially expand the graph");

const coincident = [
  { id: "a", x: 0, y: 0, vx: 0, vy: 0 },
  { id: "b", x: 0, y: 0, vx: 0, vy: 0 },
  { id: "c", x: 0, y: 0, vx: 0, vy: 0 },
];
const fixed = coincident[0];
fixed.fx = 12;
fixed.fy = -8;
const coincidentSimulation = createSimulation(coincident, []);
coincidentSimulation.settle(20);
assert.equal(fixed.x, 12, "a dragged/fixed node must retain its x position");
assert.equal(fixed.y, -8, "a dragged/fixed node must retain its y position");
assert.ok(coincident.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)), "coincident nodes must not produce NaN");

console.log(`Graph unit tests passed (${first.nodes.length} nodes, ${first.links.length} links)`);

