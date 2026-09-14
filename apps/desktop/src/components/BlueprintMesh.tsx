import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type BlueprintData } from '../lib/api.js';

interface BNode {
  id: string;
  tagNumber: string;
  symbolClass: string;
  x: number;
  y: number;
  service?: string;
}
interface BEdge {
  id: string;
  from: string;
  to: string;
  lineNumber?: string;
}

const DOC_ID = 'MRPL-CDU-01';

const PALETTE: Array<{ cls: string; label: string; prefix: string }> = [
  { cls: 'pressure-vessel', label: 'vessel', prefix: 'V' },
  { cls: 'centrifugal-pump', label: 'pump', prefix: 'P' },
  { cls: 'gate-valve', label: 'gate valve', prefix: 'GV' },
  { cls: 'flow-control-valve', label: 'ctrl valve', prefix: 'FV' },
  { cls: 'flow-transmitter', label: 'instrument', prefix: 'FT' },
];

const NODE_W = 96;
const NODE_H = 44;

function uid(p: string): string {
  return `${p}-${Math.random().toString(36).slice(2, 7)}`;
}

function glyph(cls: string): React.ReactElement {
  switch (cls) {
    case 'centrifugal-pump':
      return (
        <g>
          <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="-5,-6 7,0 -5,6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </g>
      );
    case 'gate-valve':
      return (
        <g>
          <polygon points="-10,-6 0,0 -10,6" fill="currentColor" opacity="0.7" />
          <polygon points="10,-6 0,0 10,6" fill="currentColor" opacity="0.7" />
        </g>
      );
    case 'flow-control-valve':
      return (
        <g>
          <polygon points="-10,-6 0,0 -10,6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="10,-6 0,0 10,6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M -6,-8 Q 0,-16 6,-8 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </g>
      );
    case 'flow-transmitter':
      return (
        <g>
          <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="-9" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth="1" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="-8" y="-12" width="16" height="24" rx="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </g>
      );
  }
}

export const BlueprintMesh: React.FC = () => {
  const [nodes, setNodes] = useState<BNode[]>([]);
  const [edges, setEdges] = useState<BEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 40, y: 20, k: 0.75 });
  const [answer, setAnswer] = useState<{ answer: string; path: string[] } | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('loaded from drawing');
  const [dirty, setDirty] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const loadGenerated = useCallback((data: BlueprintData) => {
    setNodes(
      data.nodes.map((n) => ({
        id: n.tagNumber,
        tagNumber: n.tagNumber,
        symbolClass: n.symbolClass,
        x: n.bbox.x,
        y: n.bbox.y,
        ...(n.service ? { service: n.service } : {}),
      })),
    );
    setEdges(data.edges.map((e) => ({ id: uid('e'), from: e.from, to: e.to, ...(e.lineNumber ? { lineNumber: e.lineNumber } : {}) })));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await api.blueprintLoad(DOC_ID);
        if (saved.source === 'user-edited' && saved.blueprint) {
          const bp = saved.blueprint as { nodes: BNode[]; edges: BEdge[] };
          if (Array.isArray(bp.nodes) && bp.nodes.length > 0) {
            setNodes(bp.nodes);
            setEdges(bp.edges ?? []);
            setStatus('loaded from local DB');
            return;
          }
        }
        const generated = await api.blueprint(12);
        loadGenerated(generated);
      } catch {
        setStatus('blueprint load failed');
      }
    })();
  }, [loadGenerated]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // --- interaction ---------------------------------------------------------

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - transform.x) / transform.k,
        y: (clientY - rect.top - transform.y) / transform.k,
      };
    },
    [transform],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform((t) => {
      const k = Math.min(2.4, Math.max(0.25, t.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      return { k, x: mx - ((mx - t.x) * k) / t.k, y: my - ((my - t.y) * k) / t.k };
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target === svgRef.current || (e.target as Element).classList.contains('bp-bg')) {
        panRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
    },
    [transform],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panRef.current) {
        const p = panRef.current;
        setTransform((t) => ({ ...t, x: p.tx + (e.clientX - p.x), y: p.ty + (e.clientY - p.y) }));
      } else if (dragRef.current) {
        const d = dragRef.current;
        const w = toWorld(e.clientX, e.clientY);
        setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: w.x - d.dx, y: w.y - d.dy } : n)));
        setDirty(true);
      }
    },
    [toWorld],
  );

  const onPointerUp = useCallback(() => {
    panRef.current = null;
    dragRef.current = null;
  }, []);

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: BNode) => {
      e.stopPropagation();
      if (connectFrom) {
        if (connectFrom !== node.id) {
          setEdges((prev) => [...prev, { id: uid('e'), from: connectFrom, to: node.id, lineNumber: 'NEW' }]);
          setDirty(true);
        }
        setConnectFrom(null);
        return;
      }
      setSelected(node.id);
      const w = toWorld(e.clientX, e.clientY);
      dragRef.current = { id: node.id, dx: w.x - node.x, dy: w.y - node.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [connectFrom, toWorld],
  );

  const addNode = useCallback(
    (cls: string, prefix: string) => {
      const w = toWorld((svgRef.current?.clientWidth ?? 800) / 2, (svgRef.current?.clientHeight ?? 500) / 2);
      const count = nodes.filter((n) => n.symbolClass === cls).length + 1;
      const node: BNode = {
        id: uid(prefix),
        tagNumber: `${prefix}-${900 + count}`,
        symbolClass: cls,
        x: w.x,
        y: w.y,
      };
      setNodes((prev) => [...prev, node]);
      setSelected(node.id);
      setDirty(true);
    },
    [nodes, toWorld],
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setNodes((prev) => prev.filter((n) => n.id !== selected));
    setEdges((prev) => prev.filter((e) => e.from !== selected && e.to !== selected));
    setSelected(null);
    setDirty(true);
  }, [selected]);

  const save = useCallback(async () => {
    await api.blueprintSave(DOC_ID, { nodes, edges });
    setDirty(false);
    setStatus(`saved to local DB · ${new Date().toLocaleTimeString()}`);
  }, [nodes, edges]);

  // --- client-side graph query ---------------------------------------------

  const trace = useCallback(
    (queryText: string) => {
      const q = queryText.toLowerCase();
      const tagMatch = queryText.match(/\b([A-Z]{1,3}-\d{3,4}[A-Z]?)\b/);
      const tag = tagMatch?.[1]?.toUpperCase();

      const downstream = (start: string): string[] => {
        const out: string[] = [];
        const seen = new Set<string>([start]);
        const walk = (t: string) => {
          for (const e of edges.filter((x) => x.from === t)) {
            if (!seen.has(e.to)) {
              seen.add(e.to);
              out.push(e.to);
              walk(e.to);
            }
          }
        };
        walk(start);
        return out;
      };
      const upstream = (start: string): string[] => {
        const out: string[] = [];
        const seen = new Set<string>([start]);
        const walk = (t: string) => {
          for (const e of edges.filter((x) => x.to === t)) {
            if (!seen.has(e.from)) {
              seen.add(e.from);
              out.push(e.from);
              walk(e.from);
            }
          }
        };
        walk(start);
        return out;
      };

      if (!tag) return { answer: 'Specify an equipment tag, e.g. "what feeds V-102?"', path: [] };

      if (q.includes('isolation') || (q.includes('valve') && q.includes('for'))) {
        const up = upstream(tag);
        const down = downstream(tag);
        const suction = up.filter((t) => t.startsWith('GV') || nodeById.get(t)?.symbolClass === 'gate-valve');
        const discharge = down.filter((t) => t.startsWith('GV') || nodeById.get(t)?.symbolClass === 'gate-valve');
        return {
          answer: `Isolation envelope for ${tag}: suction [${suction.join(', ') || 'none'}], discharge [${discharge.join(', ') || 'none'}].`,
          path: [...suction, ...discharge],
        };
      }
      if (q.includes('what feeds') || q.includes('upstream')) {
        const up = upstream(tag);
        return { answer: `Equipment ${tag} is fed by process path: ${up.join(' <- ') || 'no upstream equipment on this sheet'}.`, path: up };
      }
      if (q.includes('feed') || q.includes('downstream')) {
        const down = downstream(tag);
        return { answer: `Equipment ${tag} feeds into: ${down.join(' -> ') || 'no downstream equipment on this sheet'}.`, path: down };
      }
      return { answer: `Query understood for ${tag}. Try "what feeds ${tag}?" or "isolation valves for ${tag}".`, path: [tag] };
    },
    [edges, nodeById],
  );

  const runQuery = useCallback(() => {
    const result = trace(query);
    setAnswer(result);
    setSelected(null);
  }, [query, trace]);

  const highlight = useMemo(() => new Set(answer?.path ?? []), [answer]);

  const edgePath = (from: BNode, to: BNode): string => {
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  };

  return (
    <section className="center" style={{ flex: 1 }}>
      <div className="blueprint-layout">
        <div className="blueprint-toolbar">
          <span className="center-title">Blueprint Mesh</span>
          <div className="mode-toggle">
            {PALETTE.map((p) => (
              <button key={p.cls} onClick={() => addNode(p.cls, p.prefix)} title={`add ${p.label}`}>
                + {p.label}
              </button>
            ))}
          </div>
          <button className={`btn-secondary`} style={{ padding: '5px 10px' }} onClick={() => setConnectFrom((c) => (c ? null : selected))} disabled={!selected}>
            {connectFrom ? 'pick target…' : 'connect'}
          </button>
          <button className="btn-secondary" style={{ padding: '5px 10px' }} onClick={deleteSelected} disabled={!selected}>
            delete
          </button>
          <button className="btn-primary" style={{ padding: '5px 12px' }} onClick={() => void save()} disabled={!dirty}>
            {dirty ? 'save blueprint' : 'saved'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              void api.blueprint(12).then(loadGenerated);
              setStatus('reset to drawing');
              setDirty(true);
            }}
          >
            reset
          </button>
          <span className="center-sub" style={{ marginLeft: 'auto' }}>
            {nodes.length} nodes · {edges.length} edges · {status}
          </span>
        </div>

        <div className="blueprint-canvas" style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            viewBox="0 0 1000 560"
            style={{ width: '100%', height: '100%', cursor: panRef.current ? 'grabbing' : 'default', touchAction: 'none' }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#141414" strokeWidth="1" />
              </pattern>
              <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#00ff66" />
              </marker>
            </defs>
            <rect className="bp-bg" width="1000" height="560" fill="url(#grid)" />

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
              {edges.map((e) => {
                const from = nodeById.get(e.from);
                const to = nodeById.get(e.to);
                if (!from || !to) return null;
                const lit = highlight.has(e.from) && highlight.has(e.to);
                const d = edgePath(from, to);
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={lit ? '#00ff66' : '#262626'}
                      strokeWidth={lit ? 2 : 1.5}
                      markerEnd={lit ? 'url(#bp-arrow)' : undefined}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEdges((prev) => prev.filter((x) => x.id !== e.id));
                        setDirty(true);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    {lit && (
                      <circle r="3" fill="#00ff66">
                        <animateMotion dur="1.6s" repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}

              {nodes.map((n) => {
                const lit = highlight.has(n.id);
                const isSel = selected === n.id;
                const color = connectFrom === n.id ? '#f5a623' : lit ? '#00ff66' : isSel ? '#ffffff' : '#888';
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className="mesh-node"
                    onPointerDown={(e) => onNodePointerDown(e, n)}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="8"
                      fill="#0a0a0a"
                      stroke={color}
                      strokeWidth={lit || isSel ? 2 : 1}
                    />
                    <g transform={`translate(${NODE_W - 18},${NODE_H / 2})`} color={color}>
                      {glyph(n.symbolClass)}
                    </g>
                    <text x="8" y="19" fill={color} fontSize="11" fontFamily="monospace">
                      {n.tagNumber}
                    </text>
                    <text x="8" y="33" fill="#555" fontSize="8" fontFamily="monospace">
                      {n.symbolClass}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="hint" style={{ position: 'absolute', left: 12, bottom: 10 }}>
            scroll zoom · drag background pan · drag node move · click edge to delete
          </div>
        </div>

        {selected && nodeById.get(selected) && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="metric-tag">{nodeById.get(selected)!.tagNumber}</span>
              <span className="hint">{nodeById.get(selected)!.symbolClass}</span>
              <span className="hint">
                x {Math.round(nodeById.get(selected)!.x)} · y {Math.round(nodeById.get(selected)!.y)}
              </span>
              {nodeById.get(selected)!.service && <span className="hint">{nodeById.get(selected)!.service}</span>}
            </div>
          </div>
        )}

        {answer && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', background: 'var(--surface-1)' }}>
            <div className="hint" style={{ color: 'var(--text)' }}>
              {answer.answer}
            </div>
            {answer.path.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {answer.path.map((p) => (
                  <span className="metric-tag" key={p}>
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="blueprint-composer">
          <div className="composer-box">
            <textarea
              rows={1}
              placeholder="mesh query — e.g. what feeds V-102? · isolation valves for P-101A"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  runQuery();
                }
              }}
            />
            <button className="btn-primary" onClick={runQuery} disabled={!query.trim()}>
              trace
            </button>
          </div>
          <div className="composer-hint">traces resolve against this editable graph — save persists to the local DB</div>
        </div>
      </div>
    </section>
  );
};
