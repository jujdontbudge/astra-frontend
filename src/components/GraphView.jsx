import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Focus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Tag,
  X,
} from "lucide-react";
import { createFakeVault } from "../graph/fakeVault.js";
import { createSimulation } from "../graph/simulation.js";
import { useReducedMotionPreference } from "../lib/useReducedMotionPreference.js";

const DEFAULTS = {
  showArrows: false,
  showTags: false,
  showAttachments: true,
  showExisting: true,
  showOrphans: true,
  textFade: 0.95,
  nodeSize: 1,
  linkThickness: 1,
  repel: 22,
  linkDistance: 38,
  linkStrength: 0.095,
  center: 0.055,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function GraphSection({ title, open, onToggle, children }) {
  return (
    <section className="graph-section">
      <button className="graph-section-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        <span>{title}</span>
      </button>
      {open && <div className="graph-section-body">{children}</div>}
    </section>
  );
}

function RangeControl({ label, value, min, max, step, onChange, valueLabel }) {
  return (
    <label className="graph-range">
      <span>
        {label}
        <output>{valueLabel ?? value}</output>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleControl({ label, checked, onChange }) {
  return (
    <label className="graph-toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="graph-switch" aria-hidden="true" />
    </label>
  );
}

export function GraphView() {
  const [vault] = useState(() => createFakeVault());
  const reducedMotion = useReducedMotionPreference();
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const simulationRef = useRef(null);
  const requestDrawRef = useRef(() => {});
  const focusNodeRef = useRef(() => {});
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.88, targetX: null, targetY: null, initialized: false });
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const hoverRef = useRef(null);
  const frameRef = useRef(0);
  const runtimeRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [zoomPercent, setZoomPercent] = useState(88);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(DEFAULTS);
  const [openSections, setOpenSections] = useState({ filters: true, groups: true, display: true, forces: true });
  const [enabledGroups, setEnabledGroups] = useState(() => Object.fromEntries(vault.clusters.map((cluster) => [cluster.id, true])));
  const [colors, setColors] = useState(() => Object.fromEntries(vault.clusters.map((cluster) => [cluster.id, cluster.color])));

  const stateRef = useRef({ query, settings, enabledGroups, colors, selectedId });
  stateRef.current = { query, settings, enabledGroups, colors, selectedId };

  const selectedNode = selectedId ? vault.nodes.find((node) => node.id === selectedId) : null;
  const selectedNeighbors = useMemo(() => {
    if (!selectedNode) return [];
    const ids = vault.adjacency.get(selectedNode.id) || new Set();
    return [...ids].slice(0, 8).map((id) => vault.nodes.find((node) => node.id === id)).filter(Boolean);
  }, [selectedNode, vault]);

  const visibleGraph = useMemo(() => {
    const search = query.trim().toLowerCase();
    const nodes = vault.nodes.filter(
      (node) =>
        enabledGroups[node.cluster] &&
        (!settings.showExisting || node.existing) &&
        (settings.showAttachments || !node.attachment) &&
        (settings.showOrphans || node.degree > 0) &&
        (!search || node.title.toLowerCase().includes(search) || node.tag.includes(search))
    );
    const ids = new Set(nodes.map((node) => node.id));
    const links = vault.links.filter((link) => ids.has(link.source.id) && ids.has(link.target.id));
    return { nodeCount: nodes.length, linkCount: links.length };
  }, [enabledGroups, query, settings.showAttachments, settings.showExisting, settings.showOrphans, vault]);

  const focusNode = useCallback(
    (node) => {
      if (!node) return;
      setSelectedId(node.id);
      const camera = cameraRef.current;
      const { width, height } = sizeRef.current;
      const targetX = width / 2 - node.x * camera.scale;
      const targetY = height / 2 - node.y * camera.scale;
      if (reducedMotion) {
        camera.x = targetX;
        camera.y = targetY;
        camera.targetX = null;
        camera.targetY = null;
      } else {
        camera.targetX = targetX;
        camera.targetY = targetY;
      }
      requestDrawRef.current();
    },
    [reducedMotion]
  );
  focusNodeRef.current = focusNode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return undefined;

    const simulation = createSimulation(vault.nodes, vault.links, stateRef.current.settings);
    simulationRef.current = simulation;
    if (reducedMotion) simulation.settle(260);

    let disposed = false;
    const pointer = { id: null, mode: null, node: null, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false };

    function nodeVisible(node) {
      const current = stateRef.current;
      const search = current.query.trim().toLowerCase();
      return Boolean(
        current.enabledGroups[node.cluster] &&
          (!current.settings.showExisting || node.existing) &&
          (current.settings.showAttachments || !node.attachment) &&
          (current.settings.showOrphans || node.degree > 0) &&
          (!search || node.title.toLowerCase().includes(search) || node.tag.toLowerCase().includes(search))
      );
    }

    function worldToScreen(node) {
      const camera = cameraRef.current;
      return { x: node.x * camera.scale + camera.x, y: node.y * camera.scale + camera.y };
    }

    function screenToWorld(x, y) {
      const camera = cameraRef.current;
      return { x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale };
    }

    function hitTest(screenX, screenY) {
      const world = screenToWorld(screenX, screenY);
      const scale = cameraRef.current.scale;
      for (let index = vault.nodes.length - 1; index >= 0; index -= 1) {
        const node = vault.nodes[index];
        if (!nodeVisible(node)) continue;
        const radius = node.radius * stateRef.current.settings.nodeSize + 7 / scale;
        const dx = node.x - world.x;
        const dy = node.y - world.y;
        if (dx * dx + dy * dy <= radius * radius) return node;
      }
      return null;
    }

    function drawArrow(ctx, source, target, opacity) {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const length = 3.6;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(target.x, target.y);
      ctx.lineTo(target.x - Math.cos(angle - 0.55) * length, target.y - Math.sin(angle - 0.55) * length);
      ctx.lineTo(target.x - Math.cos(angle + 0.55) * length, target.y - Math.sin(angle + 0.55) * length);
      ctx.closePath();
      ctx.fill();
    }

    function draw() {
      const { width, height, dpr } = sizeRef.current;
      const camera = cameraRef.current;
      const current = stateRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.globalAlpha = 1;
      context.fillStyle = "#1e1e1e";
      context.fillRect(0, 0, width, height);

      const highlightedId = hoverRef.current?.id || current.selectedId;
      const neighborhood = highlightedId ? vault.adjacency.get(highlightedId) || new Set() : null;
      const hasHighlight = Boolean(highlightedId);

      context.lineCap = "round";
      context.strokeStyle = "#8d8a98";
      context.fillStyle = "#8d8a98";
      for (const link of vault.links) {
        if (!nodeVisible(link.source) || !nodeVisible(link.target)) continue;
        const source = worldToScreen(link.source);
        const target = worldToScreen(link.target);
        const connected = !hasHighlight || link.source.id === highlightedId || link.target.id === highlightedId;
        const opacity = connected ? (link.kind === "cross" ? 0.22 : 0.31) : 0.045;
        context.globalAlpha = opacity;
        context.lineWidth = current.settings.linkThickness * (connected ? 0.85 : 0.55);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
        if (current.settings.showArrows && connected && camera.scale > 0.7) drawArrow(context, source, target, opacity + 0.12);
      }

      const labelOpacity = clamp((camera.scale - current.settings.textFade) / 0.46, 0, 1);
      for (const node of vault.nodes) {
        if (!nodeVisible(node)) continue;
        const point = worldToScreen(node);
        if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) continue;
        const emphasized = !hasHighlight || node.id === highlightedId || neighborhood?.has(node.id);
        const active = node.id === highlightedId || node.id === current.selectedId;
        const nodeColor = current.colors[node.cluster] || node.color;
        const radius = Math.max(1.45, node.radius * current.settings.nodeSize * camera.scale);

        if (active) {
          const glow = context.createRadialGradient(point.x, point.y, radius, point.x, point.y, radius * 4.4);
          glow.addColorStop(0, `${nodeColor}88`);
          glow.addColorStop(1, `${nodeColor}00`);
          context.fillStyle = glow;
          context.globalAlpha = 0.9;
          context.beginPath();
          context.arc(point.x, point.y, radius * 4.4, 0, Math.PI * 2);
          context.fill();
        }

        context.fillStyle = nodeColor;
        context.globalAlpha = emphasized ? (active ? 1 : 0.82) : 0.13;
        context.beginPath();
        context.arc(point.x, point.y, active ? radius * 1.26 : radius, 0, Math.PI * 2);
        context.fill();

        const showLabel = active || (emphasized && (labelOpacity > 0.2 || node.degree > 7));
        if (showLabel) {
          context.font = `${active ? 600 : 450} ${active ? 11 : 9.5}px Inter, system-ui, sans-serif`;
          context.textBaseline = "middle";
          context.fillStyle = active ? "#f2f0f7" : "#c3c0ca";
          context.globalAlpha = active ? 1 : clamp(labelOpacity + (node.degree > 7 ? 0.28 : 0), 0.18, emphasized ? 0.84 : 0.12);
          context.fillText(node.title, point.x + radius + 4, point.y);
          if (current.settings.showTags && (active || camera.scale > 1.2)) {
            context.font = "8px Inter, system-ui, sans-serif";
            context.fillStyle = nodeColor;
            context.globalAlpha *= 0.72;
            context.fillText(node.tag, point.x + radius + 4, point.y + 11);
          }
        }
      }
      context.globalAlpha = 1;
    }

    function animate() {
      frameRef.current = 0;
      if (disposed) return;
      let continueFrame = false;
      if (!reducedMotion && simulation.isActive()) {
        simulation.tick();
        continueFrame = true;
      }
      const camera = cameraRef.current;
      if (camera.targetX != null && camera.targetY != null) {
        camera.x += (camera.targetX - camera.x) * 0.16;
        camera.y += (camera.targetY - camera.y) * 0.16;
        if (Math.abs(camera.targetX - camera.x) < 0.35 && Math.abs(camera.targetY - camera.y) < 0.35) {
          camera.x = camera.targetX;
          camera.y = camera.targetY;
          camera.targetX = null;
          camera.targetY = null;
        } else {
          continueFrame = true;
        }
      }
      draw();
      if (continueFrame) frameRef.current = requestAnimationFrame(animate);
    }

    function requestDraw() {
      if (!frameRef.current && !disposed) frameRef.current = requestAnimationFrame(animate);
    }
    requestDrawRef.current = requestDraw;
    runtimeRef.current = { draw, requestDraw, hitTest };

    function resize() {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const previous = sizeRef.current;
      sizeRef.current = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const camera = cameraRef.current;
      if (!camera.initialized) {
        camera.x = rect.width / 2;
        camera.y = rect.height / 2;
        camera.initialized = true;
      } else {
        camera.x += (rect.width - previous.width) / 2;
        camera.y += (rect.height - previous.height) / 2;
      }
      requestDraw();
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      const point = canvasPoint(event);
      const node = hitTest(point.x, point.y);
      pointer.id = event.pointerId;
      pointer.mode = node ? "node" : "pan";
      pointer.node = node;
      pointer.startX = point.x;
      pointer.startY = point.y;
      pointer.lastX = point.x;
      pointer.lastY = point.y;
      pointer.moved = false;
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-grabbing");
    }

    function onPointerMove(event) {
      const point = canvasPoint(event);
      if (pointer.id === event.pointerId) {
        const dx = point.x - pointer.lastX;
        const dy = point.y - pointer.lastY;
        if (Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 4) pointer.moved = true;
        if (pointer.mode === "pan") {
          cameraRef.current.x += dx;
          cameraRef.current.y += dy;
          cameraRef.current.targetX = null;
          cameraRef.current.targetY = null;
        } else if (pointer.node) {
          const world = screenToWorld(point.x, point.y);
          pointer.node.fx = world.x;
          pointer.node.fy = world.y;
          pointer.node.x = world.x;
          pointer.node.y = world.y;
        }
        pointer.lastX = point.x;
        pointer.lastY = point.y;
        requestDraw();
        return;
      }
      const next = hitTest(point.x, point.y);
      if (next?.id !== hoverRef.current?.id) {
        hoverRef.current = next;
        canvas.style.cursor = next ? "pointer" : "grab";
        requestDraw();
      }
    }

    function finishPointer(event) {
      if (pointer.id !== event.pointerId) return;
      if (pointer.node) {
        const clicked = !pointer.moved;
        pointer.node.fx = null;
        pointer.node.fy = null;
        if (clicked) focusNodeRef.current(pointer.node);
        else if (reducedMotion) simulation.settle(80);
        else simulation.reheat(0.36);
      } else if (!pointer.moved) {
        setSelectedId(null);
      }
      pointer.id = null;
      pointer.mode = null;
      pointer.node = null;
      canvas.classList.remove("is-grabbing");
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
      requestDraw();
    }

    function onWheel(event) {
      event.preventDefault();
      const point = canvasPoint(event);
      const camera = cameraRef.current;
      const before = screenToWorld(point.x, point.y);
      const factor = Math.exp(-event.deltaY * 0.0012);
      camera.scale = clamp(camera.scale * factor, 0.22, 3.2);
      camera.x = point.x - before.x * camera.scale;
      camera.y = point.y - before.y * camera.scale;
      setZoomPercent(Math.round(camera.scale * 100));
      camera.targetX = null;
      camera.targetY = null;
      requestDraw();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    function onPointerLeave() {
      if (pointer.id == null && hoverRef.current) {
        hoverRef.current = null;
        requestDraw();
      }
    }
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    resize();
    requestDraw();

    return () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      simulationRef.current = null;
      runtimeRef.current = null;
    };
  }, [reducedMotion, vault]);

  useEffect(() => {
    requestDrawRef.current();
  }, [colors, enabledGroups, query, settings, selectedId]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (["repel", "linkDistance", "linkStrength", "center"].includes(key)) {
      simulationRef.current?.setOptions({ [key]: value });
      if (reducedMotion) simulationRef.current?.settle(90);
      else simulationRef.current?.reheat(0.48);
    }
    requestDrawRef.current();
  }

  function zoomBy(factor) {
    const camera = cameraRef.current;
    const { width, height } = sizeRef.current;
    const worldX = (width / 2 - camera.x) / camera.scale;
    const worldY = (height / 2 - camera.y) / camera.scale;
    camera.scale = clamp(camera.scale * factor, 0.22, 3.2);
    camera.x = width / 2 - worldX * camera.scale;
    camera.y = height / 2 - worldY * camera.scale;
    setZoomPercent(Math.round(camera.scale * 100));
    requestDrawRef.current();
  }

  function resetView() {
    const camera = cameraRef.current;
    const { width, height } = sizeRef.current;
    camera.scale = 0.88;
    camera.x = width / 2;
    camera.y = height / 2;
    camera.targetX = null;
    camera.targetY = null;
    setZoomPercent(88);
    setSelectedId(null);
    requestDrawRef.current();
  }

  function restoreDefaults() {
    setSettings(DEFAULTS);
    simulationRef.current?.setOptions(DEFAULTS);
    if (reducedMotion) simulationRef.current?.settle(120);
    else simulationRef.current?.reheat(0.7);
    requestDrawRef.current();
  }

  function toggleSection(name) {
    setOpenSections((current) => ({ ...current, [name]: !current[name] }));
  }

  function onCanvasKeyDown(event) {
    if (event.key === "+" || event.key === "=") zoomBy(1.18);
    if (event.key === "-") zoomBy(1 / 1.18);
    if (event.key === "0") resetView();
    if (event.key === "Escape") setSelectedId(null);
  }

  return (
    <div className="graph-view screen" data-testid="graph-view">
      <div className="graph-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          tabIndex={0}
          aria-label={`Interactive vault graph with ${visibleGraph.nodeCount} visible notes. Drag to pan, scroll to zoom, and select a node for details.`}
          onKeyDown={onCanvasKeyDown}
          data-testid="graph-canvas"
        />

        <aside className="graph-controls" aria-label="Graph controls">
          <div className="graph-controls-head">
            <span>Graph view</span>
            <button type="button" onClick={restoreDefaults} aria-label="Restore graph defaults" title="Restore defaults">
              <RotateCcw aria-hidden="true" />
            </button>
          </div>

          <GraphSection title="Filters" open={openSections.filters} onToggle={() => toggleSection("filters")}>
            <label className="graph-search">
              <Search aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files…" aria-label="Search graph files" />
            </label>
            <ToggleControl label="Existing files only" checked={settings.showExisting} onChange={(value) => updateSetting("showExisting", value)} />
            <ToggleControl label="Show attachments" checked={settings.showAttachments} onChange={(value) => updateSetting("showAttachments", value)} />
            <ToggleControl label="Show orphans" checked={settings.showOrphans} onChange={(value) => updateSetting("showOrphans", value)} />
          </GraphSection>

          <GraphSection title="Groups" open={openSections.groups} onToggle={() => toggleSection("groups")}>
            <div className="graph-groups">
              {vault.clusters.map((cluster) => (
                <div className="graph-group" key={cluster.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={enabledGroups[cluster.id]}
                      onChange={(event) => setEnabledGroups((current) => ({ ...current, [cluster.id]: event.target.checked }))}
                    />
                    <span>{cluster.label}</span>
                    <small>{cluster.count}</small>
                  </label>
                  <input
                    className="graph-color"
                    type="color"
                    value={colors[cluster.id]}
                    onChange={(event) => setColors((current) => ({ ...current, [cluster.id]: event.target.value }))}
                    aria-label={`${cluster.label} color`}
                  />
                </div>
              ))}
            </div>
          </GraphSection>

          <GraphSection title="Display" open={openSections.display} onToggle={() => toggleSection("display")}>
            <ToggleControl label="Arrows" checked={settings.showArrows} onChange={(value) => updateSetting("showArrows", value)} />
            <ToggleControl label="Tags" checked={settings.showTags} onChange={(value) => updateSetting("showTags", value)} />
            <RangeControl label="Text fade threshold" value={settings.textFade} min={0.25} max={1.5} step={0.05} onChange={(value) => updateSetting("textFade", value)} />
            <RangeControl label="Node size" value={settings.nodeSize} min={0.55} max={2} step={0.05} onChange={(value) => updateSetting("nodeSize", value)} />
            <RangeControl label="Link thickness" value={settings.linkThickness} min={0.35} max={2.2} step={0.05} onChange={(value) => updateSetting("linkThickness", value)} />
          </GraphSection>

          <GraphSection title="Forces" open={openSections.forces} onToggle={() => toggleSection("forces")}>
            <RangeControl label="Center force" value={settings.center} min={0} max={0.16} step={0.005} onChange={(value) => updateSetting("center", value)} valueLabel={settings.center.toFixed(3)} />
            <RangeControl label="Repel force" value={settings.repel} min={2} max={70} step={1} onChange={(value) => updateSetting("repel", value)} />
            <RangeControl label="Link force" value={settings.linkStrength} min={0.015} max={0.24} step={0.005} onChange={(value) => updateSetting("linkStrength", value)} valueLabel={settings.linkStrength.toFixed(3)} />
            <RangeControl label="Link distance" value={settings.linkDistance} min={18} max={100} step={1} onChange={(value) => updateSetting("linkDistance", value)} />
          </GraphSection>
        </aside>

        <div className="graph-toolbar" aria-label="Graph zoom controls">
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in"><Plus aria-hidden="true" /></button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out"><Minus aria-hidden="true" /></button>
          <button type="button" onClick={resetView} aria-label="Fit graph"><Maximize2 aria-hidden="true" /></button>
        </div>

        <div className="graph-status" role="status" aria-live="polite">
          <span>{visibleGraph.nodeCount} nodes</span>
          <span>{visibleGraph.linkCount} links</span>
          <span>{zoomPercent}%</span>
        </div>

        {selectedNode && (
          <article className="graph-preview" data-testid="graph-preview" aria-live="polite">
            <div className="graph-preview-head">
              <span className="graph-preview-icon"><FileText aria-hidden="true" /></span>
              <div>
                <small>{selectedNode.clusterLabel}</small>
                <h2>{selectedNode.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close note preview"><X aria-hidden="true" /></button>
            </div>
            <p>{selectedNode.body}</p>
            <div className="graph-wikilinks" aria-label="Linked notes">
              {selectedNeighbors.map((node) => (
                <button type="button" key={node.id} onClick={() => focusNode(node)}>{`[[${node.title}]]`}</button>
              ))}
            </div>
            <footer>
              <span><Tag aria-hidden="true" />{selectedNode.tag}</span>
              <button type="button" onClick={() => focusNode(selectedNode)}><Focus aria-hidden="true" />Focus</button>
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
