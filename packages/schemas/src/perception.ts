import { z } from 'zod';
import { Id } from './common.js';

/**
 * Perception service contracts -- the capability plane boundary.
 *
 * These shapes cross the language boundary: authored here in Zod, generated
 * into Pydantic for the Python service, and handed to the VLM as a decoding
 * constraint so that extraction output is sampled into the contract rather
 * than parsed hopefully out of prose.
 */

export const BBox = z.object({
  page: z.number().int().positive(),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const ExtractedBlock = z.object({
  blockId: Id,
  category: z.enum([
    'title',
    'section-header',
    'text',
    'list-item',
    'table',
    'figure',
    'formula',
    'caption',
    'page-header',
    'page-footer',
    'footnote',
  ]),
  text: z.string(),
  bbox: BBox,
  confidence: z.number().min(0).max(1).optional(),
});

export const ExtractionResult = z.object({
  documentId: Id,
  engine: z.string().describe('e.g. paddleocr-vl-1.6'),
  pageCount: z.number().int().positive(),
  blocks: z.array(ExtractedBlock),
  /** Tables as HTML, formulas as LaTeX -- the conventions every engine reports in. */
  tablesHtml: z.array(z.object({ blockId: Id, html: z.string() })).default([]),
  formulasLatex: z.array(z.object({ blockId: Id, latex: z.string() })).default([]),
  readingOrder: z.array(Id).describe('blockIds in human reading order'),
});

/**
 * A finding lifted from an inspection report.
 *
 * This is the object the flagship pipeline's step 2 must produce, and the
 * reason it is a schema rather than a prompt instruction: every downstream
 * check (C1 numeric grounding especially) needs the values in typed fields,
 * not embedded in a paragraph.
 */
export const InspectionFinding = z.object({
  findingId: Id,
  equipmentTag: z.string().describe('e.g. P-101A'),
  description: z.string(),
  measuredValue: z.number().optional(),
  measuredUnit: z.string().optional(),
  limitValue: z.number().optional(),
  limitUnit: z.string().optional(),
  severity: z.enum(['observation', 'minor', 'major', 'critical']),
  sourceBlockId: Id.optional().describe('Links the finding back to its region on the page'),
});

export const InspectionExtraction = z.object({
  documentId: Id,
  reportDate: z.string().optional(),
  inspector: z.string().optional(),
  findings: z.array(InspectionFinding),
});

/** A tag lifted from a P&ID, with the box that proves where it came from. */
export const DrawingTag = z.object({
  tagId: Id,
  tagNumber: z.string(),
  symbolClass: z.string().describe('ISA-5.1 class, e.g. gate-valve, centrifugal-pump'),
  bbox: BBox,
  detectorConfidence: z.number().min(0).max(1),
  ocrConfidence: z.number().min(0).max(1).optional(),
  lineNumber: z.string().optional(),
});

export const DrawingExtraction = z.object({
  documentId: Id,
  sheetNumber: z.string().optional(),
  tags: z.array(DrawingTag),
  /** Connectivity, once the graph step lands. A P&ID is a graph, not a list. */
  connections: z
    .array(z.object({ fromTagId: Id, toTagId: Id, lineNumber: z.string().optional() }))
    .default([]),
});

export type BBox = z.infer<typeof BBox>;
export type ExtractionResult = z.infer<typeof ExtractionResult>;
export type InspectionFinding = z.infer<typeof InspectionFinding>;
export type InspectionExtraction = z.infer<typeof InspectionExtraction>;
export type DrawingTag = z.infer<typeof DrawingTag>;
export type DrawingExtraction = z.infer<typeof DrawingExtraction>;
