import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DrawingExtraction, DrawingTag } from '@outskirts/schemas';

export interface SyntheticPidSheet {
  sheetId: string;
  width: number;
  height: number;
  svgContent: string;
  groundTruth: DrawingExtraction;
}

export interface SymbolTemplate {
  type: string;
  prefix: string;
  w: number;
  h: number;
  renderSvg: (x: number, y: number, tag: string) => string;
}

export const ISA_SYMBOLS: Record<string, SymbolTemplate> = {
  pump: {
    type: 'centrifugal-pump',
    prefix: 'P',
    w: 80,
    h: 80,
    renderSvg: (x, y, tag) => `
      <g id="symbol-${tag}" transform="translate(${x},${y})">
        <circle cx="40" cy="40" r="35" stroke="#111" stroke-width="2" fill="none"/>
        <polygon points="40,5 75,65 5,65" stroke="#111" stroke-width="2" fill="none"/>
        <text x="40" y="85" font-family="Arial" font-size="12" text-anchor="middle">${tag}</text>
      </g>`,
  },
  vessel: {
    type: 'pressure-vessel',
    prefix: 'V',
    w: 90,
    h: 140,
    renderSvg: (x, y, tag) => `
      <g id="symbol-${tag}" transform="translate(${x},${y})">
        <rect x="5" y="20" width="80" height="100" stroke="#111" stroke-width="2" fill="none"/>
        <path d="M 5,20 C 5,5 85,5 85,20" stroke="#111" stroke-width="2" fill="none"/>
        <path d="M 5,120 C 5,135 85,135 85,120" stroke="#111" stroke-width="2" fill="none"/>
        <text x="45" y="75" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">${tag}</text>
      </g>`,
  },
  gateValve: {
    type: 'gate-valve',
    prefix: 'GV',
    w: 50,
    h: 40,
    renderSvg: (x, y, tag) => `
      <g id="symbol-${tag}" transform="translate(${x},${y})">
        <polygon points="5,5 25,20 5,35" stroke="#111" stroke-width="2" fill="#333"/>
        <polygon points="45,5 25,20 45,35" stroke="#111" stroke-width="2" fill="#333"/>
        <line x1="25" y1="5" x2="25" y2="20" stroke="#111" stroke-width="2"/>
        <text x="25" y="48" font-family="Arial" font-size="9" text-anchor="middle">${tag}</text>
      </g>`,
  },
  controlValve: {
    type: 'flow-control-valve',
    prefix: 'FV',
    w: 60,
    h: 60,
    renderSvg: (x, y, tag) => `
      <g id="symbol-${tag}" transform="translate(${x},${y})">
        <polygon points="5,25 30,35 5,45" stroke="#111" stroke-width="2" fill="none"/>
        <polygon points="55,25 30,35 55,45" stroke="#111" stroke-width="2" fill="none"/>
        <line x1="30" y1="15" x2="30" y2="35" stroke="#111" stroke-width="2"/>
        <path d="M 15,15 C 15,5 45,5 45,15 Z" stroke="#111" stroke-width="2" fill="none"/>
        <text x="30" y="58" font-family="Arial" font-size="9" text-anchor="middle">${tag}</text>
      </g>`,
  },
  transmitterBubble: {
    type: 'flow-transmitter',
    prefix: 'FT',
    w: 40,
    h: 40,
    renderSvg: (x, y, tag) => `
      <g id="symbol-${tag}" transform="translate(${x},${y})">
        <circle cx="20" cy="20" r="18" stroke="#111" stroke-width="1.5" fill="#fff"/>
        <line x1="2" y1="20" x2="38" y2="20" stroke="#111" stroke-width="1"/>
        <text x="20" y="16" font-family="Arial" font-size="8" text-anchor="middle">FT</text>
        <text x="20" y="30" font-family="Arial" font-size="8" text-anchor="middle">${tag.replace('FT-', '')}</text>
      </g>`,
  },
};

/**
 * Synthesise a realistic industrial P&ID sheet with ISA-5.1 symbols,
 * connecting piping lines, tag numbering, and ground truth bounding boxes.
 */
export function generateSyntheticPidSheet(options?: {
  sheetId?: string;
  itemCount?: number;
  width?: number;
  height?: number;
}): SyntheticPidSheet {
  const sheetId = options?.sheetId ?? `pid-synth-${randomUUID().slice(0, 8)}`;
  const width = options?.width ?? 1600;
  const height = options?.height ?? 1100;
  const itemCount = options?.itemCount ?? 12;

  const tags: DrawingTag[] = [];
  const svgElements: string[] = [];

  // Title Block
  svgElements.push(`
    <rect x="20" y="20" width="${width - 40}" height="${height - 40}" stroke="#000" stroke-width="3" fill="none"/>
    <rect x="${width - 350}" y="${height - 120}" width="330" height="100" stroke="#000" stroke-width="2" fill="#fafafa"/>
    <text x="${width - 330}" y="${height - 90}" font-family="Arial" font-size="14" font-weight="bold">MRPL REFINERY COMPLEX</text>
    <text x="${width - 330}" y="${height - 70}" font-family="Arial" font-size="11">PIPING &amp; INSTRUMENTATION DIAGRAM</text>
    <text x="${width - 330}" y="${height - 50}" font-family="Arial" font-size="10">DRAWING NO: ${sheetId.toUpperCase()}</text>
  `);

  // Fixed layout slots across grid to ensure realistic refinery topologies
  const layoutSlots = [
    { x: 150, y: 350, sym: ISA_SYMBOLS.vessel, tag: 'V-101', service: 'Feed Surge Drum' },
    { x: 380, y: 400, sym: ISA_SYMBOLS.gateValve, tag: 'GV-1001', service: 'Suction Isolation' },
    { x: 500, y: 380, sym: ISA_SYMBOLS.pump, tag: 'P-101A', service: 'Charge Pump' },
    { x: 650, y: 400, sym: ISA_SYMBOLS.gateValve, tag: 'GV-1002', service: 'Discharge Isolation' },
    { x: 780, y: 390, sym: ISA_SYMBOLS.controlValve, tag: 'FV-2034', service: 'Charge Flow Control' },
    { x: 800, y: 300, sym: ISA_SYMBOLS.transmitterBubble, tag: 'FT-2034', service: 'Flow Sensing' },
    { x: 950, y: 320, sym: ISA_SYMBOLS.vessel, tag: 'V-102', service: 'Crude Fractionator' },
    { x: 1180, y: 380, sym: ISA_SYMBOLS.pump, tag: 'P-101B', service: 'Charge Pump (Standby)' },
    { x: 1320, y: 400, sym: ISA_SYMBOLS.gateValve, tag: 'GV-1003', service: 'Standby Isolation' },
    { x: 500, y: 600, sym: ISA_SYMBOLS.controlValve, tag: 'FV-2035', service: 'Recycle Control Valve' },
    { x: 520, y: 520, sym: ISA_SYMBOLS.transmitterBubble, tag: 'FT-2035', service: 'Recycle Flow Sensing' },
    { x: 780, y: 600, sym: ISA_SYMBOLS.gateValve, tag: 'GV-1004', service: 'Recycle Isolation' },
  ];

  const activeSlots = layoutSlots.slice(0, itemCount);

  // Draw connecting process piping lines
  svgElements.push(`
    <path d="M 235,420 L 380,420 M 430,420 L 500,420 M 580,420 L 650,420 M 700,420 L 780,420 M 840,420 L 950,420"
          stroke="#000" stroke-width="3" fill="none"/>
    <path d="M 700,420 L 700,620 L 780,620 M 840,620 L 840,420"
          stroke="#000" stroke-width="2" stroke-dasharray="6,3" fill="none"/>
    <path d="M 810,390 L 820,340" stroke="#000" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
    <path d="M 530,600 L 540,560" stroke="#000" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
  `);

  for (const slot of activeSlots) {
    const symbolSvg = slot.sym!.renderSvg(slot.x, slot.y, slot.tag);
    svgElements.push(symbolSvg);

    tags.push({
      tagId: `tag-${slot.tag}`,
      tagNumber: slot.tag,
      symbolClass: slot.sym!.type,
      lineNumber: slot.service,
      detectorConfidence: 1.0,
      ocrConfidence: 1.0,
      bbox: {
        page: 1,
        x: slot.x,
        y: slot.y,
        w: slot.sym!.w,
        h: slot.sym!.h,
      },
    });
  }

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      ${svgElements.join('\n')}
    </svg>
  `;

  const groundTruth: DrawingExtraction = {
    documentId: sheetId,
    sheetNumber: '01',
    tags,
    connections: [
      { fromTagId: 'tag-V-101', toTagId: 'tag-GV-1001', lineNumber: 'L-101' },
      { fromTagId: 'tag-GV-1001', toTagId: 'tag-P-101A', lineNumber: 'L-101' },
      { fromTagId: 'tag-P-101A', toTagId: 'tag-GV-1002', lineNumber: 'L-102' },
      { fromTagId: 'tag-GV-1002', toTagId: 'tag-FV-2034', lineNumber: 'L-102' },
      { fromTagId: 'tag-FV-2034', toTagId: 'tag-V-102', lineNumber: 'L-103' },
    ],
  };

  return {
    sheetId,
    width,
    height,
    svgContent,
    groundTruth,
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('pid-synth/generator.ts')) {
  console.log('================================================================================');
  console.log('  OUTSKIRTS SYNTHETIC P&ID DATASET GENERATOR (ISA-5.1)');
  console.log('================================================================================');
  const synth = generateSyntheticPidSheet({
    sheetId: 'MRPL-CDU-01',
    itemCount: 12,
    width: 1600,
    height: 1100,
  });

  const outDir = path.resolve(process.cwd(), 'datasets/samples');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const svgPath = path.join(outDir, 'mrpl-cdu-01.svg');
  const jsonPath = path.join(outDir, 'mrpl-cdu-01.ground-truth.json');

  fs.writeFileSync(svgPath, synth.svgContent, 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify(synth.groundTruth, null, 2), 'utf-8');

  console.log(`  Drawing Generated  : ${synth.sheetId} (${synth.width}x${synth.height}px)`);
  console.log(`  ISA-5.1 Tags       : ${synth.groundTruth.tags.length} symbols with bounding boxes`);
  console.log(`  Process Topology   : ${synth.groundTruth.connections?.length ?? 0} piping line connections`);
  console.log(`  SVG Output         : ${svgPath}`);
  console.log(`  Ground Truth JSON  : ${jsonPath}`);
  console.log('================================================================================');
}

