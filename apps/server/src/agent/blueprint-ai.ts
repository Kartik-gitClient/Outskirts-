import type { LlmClient } from './llm.js';

/** Valid P&ID symbol classes the mesh can place. */
export const SYMBOL_CLASSES = [
  'pressure-vessel',
  'centrifugal-pump',
  'gate-valve',
  'flow-control-valve',
  'flow-transmitter',
] as const;

export type SymbolClass = (typeof SYMBOL_CLASSES)[number];

export interface MeshNodeSnapshot {
  id: string;
  tagNumber: string;
  symbolClass: string;
}

export interface MeshEdgeSnapshot {
  from: string;
  to: string;
}

export interface AddNodeOp {
  tag?: string;
  symbolClass: SymbolClass | string;
}

export interface ConnectOp {
  from: string;
  to: string;
}

export interface BlueprintOps {
  addNodes: AddNodeOp[];
  connect: ConnectOp[];
  removeNodes: string[];
  reply: string;
  source: 'llm' | 'parser';
}

const CLASS_KEYWORDS: Array<{ cls: SymbolClass; words: string[] }> = [
  { cls: 'centrifugal-pump', words: ['pump', 'p-101', 'booster'] },
  { cls: 'pressure-vessel', words: ['vessel', 'drum', 'tank', 'separator', 'v-10'] },
  { cls: 'flow-control-valve', words: ['control valve', 'fcv', 'fv-', 'control-valve'] },
  { cls: 'gate-valve', words: ['gate valve', 'isolation valve', 'block valve', 'gv-', 'valve'] },
  { cls: 'flow-transmitter', words: ['transmitter', 'meter', 'sensor', 'ft-', 'instrument', 'gauge'] },
];

const TAG_RE = /\b([A-Z]{1,3}-\d{2,4}[A-Z]?)\b/;

function classFromText(text: string): SymbolClass {
  const lower = text.toLowerCase();
  for (const { cls, words } of CLASS_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return cls;
  }
  return 'pressure-vessel';
}

function prefixFor(cls: string): string {
  switch (cls) {
    case 'centrifugal-pump':
      return 'P';
    case 'gate-valve':
      return 'GV';
    case 'flow-control-valve':
      return 'FV';
    case 'flow-transmitter':
      return 'FT';
    default:
      return 'V';
  }
}

/**
 * Deterministic natural-language builder. Handles the common building
 * phrasings so the mesh constructs graphs even with no LLM reachable:
 *   "join V-102 with a vessel"
 *   "connect P-101A to V-102"
 *   "add a pump"
 *   "start the flow from P-101A" / "use P-101A to start the flow"
 *   "remove GV-1002"
 */
export function parseBlueprintOps(prompt: string, nodes: MeshNodeSnapshot[]): BlueprintOps {
  const ops: BlueprintOps = { addNodes: [], connect: [], removeNodes: [], reply: '', source: 'parser' };
  const lower = prompt.toLowerCase();
  const knownTags = new Set(nodes.map((n) => n.tagNumber));
  const resolveTag = (raw: string): string | undefined => {
    const tag = raw.toUpperCase();
    if (knownTags.has(tag)) return tag;
    const match = [...knownTags].find((t) => t.toUpperCase() === tag);
    return match;
  };
  let createdTag: string | undefined;

  // add: "add/create a pump (called P-205)"
  const addMatch = lower.match(/\b(add|create|place|draw|put)\b/);
  if (addMatch) {
    const cls = classFromText(prompt);
    const called = prompt.match(/\b(?:called|named|tagged)\s+([A-Z]{1,3}-\d{2,4}[A-Z]?)\b/i);
    let tag = called?.[1]?.toUpperCase();
    if (!tag) {
      const tagInPrompt = prompt.match(TAG_RE);
      tag = tagInPrompt?.[1] && !resolveTag(tagInPrompt[1]) ? tagInPrompt[1] : undefined;
    }
    if (!tag) {
      const n = nodes.filter((n) => n.symbolClass === cls).length + 1;
      tag = `${prefixFor(cls)}-${200 + n}`;
    }
    ops.addNodes.push({ tag, symbolClass: cls });
    createdTag = tag;
  }

  // connect/join: "connect A to B", "join A with B", "link A and B"
  const connectMatch = prompt.match(
    /\b(?:connect|join|link|tie|attach)\s+([A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)\s+(?:to|with|and|into)\s+([A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)/i,
  );
  if (connectMatch) {
    const leftRaw = (connectMatch[1] ?? '').trim();
    const rightRaw = (connectMatch[2] ?? '').trim();
    const leftTag = resolveTag(leftRaw) ?? leftRaw.match(TAG_RE)?.[1]?.toUpperCase();
    // right side may be a description like "a vessel" rather than a tag
    const rightTag = resolveTag(rightRaw) ?? rightRaw.match(TAG_RE)?.[1]?.toUpperCase();
    const left = leftTag && knownTags.has(leftTag) ? leftTag : undefined;
    const right = rightTag && knownTags.has(rightTag) ? rightTag : undefined;

    if (left && right) {
      ops.connect.push({ from: left, to: right });
    } else {
      // one side is new: create it from that side's description ("a vessel")
      const anchor = left ?? right;
      if (anchor) {
        if (!createdTag) {
          // classify from whichever side was NOT a known tag
          const descSide = left ? rightRaw : leftRaw;
          const cls = classFromText(descSide);
          const n = nodes.filter((x) => x.symbolClass === cls).length + 1;
          createdTag = `${prefixFor(cls)}-${200 + n}`;
          ops.addNodes.push({ tag: createdTag, symbolClass: cls });
        }
        ops.connect.push(left ? { from: left, to: createdTag } : { from: createdTag, to: anchor });
      }
    }
  }

  // flow source: "start the flow from P-101A" / "use P-101A to start the flow"
  const flowMatch =
    prompt.match(/\bstart\s+the\s+flow\s+from\s+([A-Z]{1,3}-\d{2,4}[A-Z]?)/i) ??
    prompt.match(/\buse\s+([A-Z]{1,3}-\d{2,4}[A-Z]?)\s+to\s+start\s+the\s+flow/i);
  if (flowMatch) {
    const src = resolveTag(flowMatch[1] ?? '');
    if (src) {
      // feed the source into the head of the chain being built: prefer an
      // existing node from the connect ops, else the newly created one.
      const c0 = ops.connect[0];
      const existingTarget =
        c0 && knownTags.has(c0.from) && c0.from !== src
          ? c0.from
          : c0 && knownTags.has(c0.to) && c0.to !== src
            ? c0.to
            : undefined;
      const target =
        existingTarget ??
        createdTag ??
        ops.connect[0]?.to ??
        ops.connect[0]?.from ??
        nodes.find((n) => n.tagNumber !== src && !n.symbolClass.includes('valve'))?.tagNumber;
      if (target && target !== src) {
        ops.connect.push({ from: src, to: target });
      }
    }
  }

  // remove: "remove/delete X"
  const removeMatch = prompt.match(/\b(?:remove|delete|drop)\s+([A-Z]{1,3}-\d{2,4}[A-Z]?)/i);
  if (removeMatch) {
    const tag = resolveTag(removeMatch[1] ?? '');
    if (tag) ops.removeNodes.push(tag);
  }

  const bits: string[] = [];
  if (ops.addNodes.length > 0) bits.push(`added ${ops.addNodes.map((n) => n.tag).join(', ')}`);
  if (ops.connect.length > 0) bits.push(`connected ${ops.connect.map((c) => `${c.from} → ${c.to}`).join(', ')}`);
  if (ops.removeNodes.length > 0) bits.push(`removed ${ops.removeNodes.join(', ')}`);
  ops.reply =
    bits.length > 0
      ? `Graph updated: ${bits.join('; ')}.`
      : 'No graph operations recognized. Try "join V-102 with a vessel" or "add a pump and connect it to V-102".';
  return ops;
}

function normalizeClass(cls: unknown): SymbolClass | undefined {
  if (typeof cls !== 'string') return undefined;
  const lower = cls.toLowerCase().replace(/\s+/g, '-');
  return (SYMBOL_CLASSES as readonly string[]).includes(lower) ? (lower as SymbolClass) : undefined;
}

/**
 * Plan graph operations for a natural-language build instruction.
 * Prefers the LLM (arbitrary phrasing); falls back to the deterministic
 * parser so the mesh always builds something real.
 */
export async function planBlueprintOps(
  prompt: string,
  nodes: MeshNodeSnapshot[],
  edges: MeshEdgeSnapshot[],
  llm?: LlmClient,
): Promise<BlueprintOps> {
  if (llm) {
    try {
      const res = await llm.generateJson<Record<string, unknown>>({
        taskId: `bp-${Date.now().toString(36)}`,
        stepId: 'blueprint-ai',
        taskType: 'code',
        system: `You are a P&ID (piping and instrumentation diagram) construction agent. You edit a process graph.
Valid symbol classes: ${SYMBOL_CLASSES.join(', ')}.
Existing nodes (tagNumber: symbolClass): ${nodes.map((n) => `${n.tagNumber}: ${n.symbolClass}`).join('; ') || '(empty)'}.
Existing edges: ${edges.map((e) => `${e.from}->${e.to}`).join('; ') || '(none)'}.
Respond with JSON only:
{"addNodes":[{"tag":"P-201","symbolClass":"centrifugal-pump"}],"connect":[{"from":"P-101A","to":"V-102"}],"removeNodes":["GV-1002"],"reply":"one sentence describing what you built"}
Rules: connect only uses existing tagNumbers or tags you add in addNodes; flow direction is from -> to (upstream feeds downstream); never invent numbers.`,
        user: prompt,
        maxTokens: 500,
        timeoutMs: 45000,
      });

      if (res.ok && res.value && typeof res.value === 'object') {
        const known = new Set(nodes.map((n) => n.tagNumber));
        const added = new Set<string>();
        const addNodes: AddNodeOp[] = [];
        const rawAdds = Array.isArray(res.value['addNodes']) ? res.value['addNodes'] : [];
        for (const a of rawAdds.slice(0, 12)) {
          if (!a || typeof a !== 'object') continue;
          const cls = normalizeClass((a as Record<string, unknown>)['symbolClass']);
          const tag = typeof (a as Record<string, unknown>)['tag'] === 'string'
            ? String((a as Record<string, unknown>)['tag']).toUpperCase().replace(/[^A-Z0-9-]/g, '')
            : undefined;
          if (!cls) continue;
          const finalTag = tag && !known.has(tag) ? tag : `${prefixFor(cls)}-${200 + known.size + added.size + 1}`;
          if (known.has(finalTag) || added.has(finalTag)) continue;
          added.add(finalTag);
          addNodes.push({ tag: finalTag, symbolClass: cls });
        }
        const connect: ConnectOp[] = [];
        const rawConnect = Array.isArray(res.value['connect']) ? res.value['connect'] : [];
        for (const c of rawConnect.slice(0, 24)) {
          if (!c || typeof c !== 'object') continue;
          const from = String((c as Record<string, unknown>)['from'] ?? '').toUpperCase();
          const to = String((c as Record<string, unknown>)['to'] ?? '').toUpperCase();
          const valid = (t: string): boolean => known.has(t) || added.has(t);
          if (from && to && valid(from) && valid(to) && from !== to) {
            connect.push({ from, to });
          }
        }
        const removeNodes = (Array.isArray(res.value['removeNodes']) ? res.value['removeNodes'] : [])
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.toUpperCase())
          .filter((t) => known.has(t) && !added.has(t))
          .slice(0, 10);

        if (addNodes.length > 0 || connect.length > 0 || removeNodes.length > 0) {
          return {
            addNodes,
            connect,
            removeNodes,
            reply:
              typeof res.value['reply'] === 'string' && res.value['reply'].trim()
                ? res.value['reply'].trim()
                : 'Graph updated.',
            source: 'llm',
          };
        }
      }
    } catch {
      /* fall through to deterministic parser */
    }
  }
  return parseBlueprintOps(prompt, nodes);
}
