import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';

export interface RenderOutput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DocSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { columns: string[]; rows: Array<Array<string | number>> };
}

export interface XlsxSheet {
  name: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface PptxSlide {
  title: string;
  bullets: string[];
  notes?: string;
}

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  html: 'text/html; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
} as const;

export type ArtifactMime = (typeof MIME)[keyof typeof MIME];

/** Render a real, template-shaped .docx engineering approval note. */
export async function renderDocx(options: {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  sections: DocSection[];
  signature?: { name: string; role: string; timestamp: string; keyId: string };
}): Promise<RenderOutput> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: options.title, bold: true })],
    }),
  );

  if (options.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: options.subtitle, italics: true, color: '555555' })],
      }),
    );
  }
  children.push(new Paragraph(''));

  if (options.meta?.length) {
    for (const m of options.meta) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${m.label}: `, bold: true }),
            new TextRun({ text: m.value }),
          ],
        }),
      );
    }
    children.push(new Paragraph(''));
  }

  for (const section of options.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: section.heading }));

    for (const p of section.paragraphs ?? []) {
      children.push(new Paragraph({ children: [new TextRun(p)] }));
    }

    for (const b of section.bullets ?? []) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b)] }));
    }

    if (section.table) {
      const header = new TableRow({
        tableHeader: true,
        children: section.table.columns.map(
          (c) =>
            new TableCell({
              shading: { fill: 'E8EEF7' },
              children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })],
            }),
        ),
      });
      const rows = section.table.rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun(String(cell))] })],
                }),
            ),
          }),
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
          },
          rows: [header, ...rows],
        }),
      );
      children.push(new Paragraph(''));
    }
  }

  if (options.signature) {
    children.push(new Paragraph(''));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '— Cryptographically signed —', bold: true, color: '1F6F43' })],
      }),
    );
    children.push(new Paragraph({ children: [new TextRun(`Reviewer: ${options.signature.name} (${options.signature.role})`)] }));
    children.push(new Paragraph({ children: [new TextRun(`Signed at: ${options.signature.timestamp}`)] }));
    children.push(new Paragraph({ children: [new TextRun(`Signing key: ${options.signature.keyId}`)] }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return { fileName: sanitize(options.title) + '.docx', mimeType: MIME.docx, buffer: Buffer.from(buffer) };
}

/** Render a real multi-sheet .xlsx workbook with styled headers. */
export async function renderXlsx(options: { title: string; sheets: XlsxSheet[] }): Promise<RenderOutput> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Outskirts Sovereign Workbench';
  wb.created = new Date();

  for (const sheet of options.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c, key: c, width: Math.max(14, c.length + 6) }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
    });

    for (const row of sheet.rows) {
      ws.addRow(row);
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return {
    fileName: sanitize(options.title) + '.xlsx',
    mimeType: MIME.xlsx,
    buffer: Buffer.from(arrayBuffer as ArrayBuffer),
  };
}

/** Render a real .pptx deck. */
export async function renderPptx(options: {
  title: string;
  subtitle?: string;
  slides: PptxSlide[];
}): Promise<RenderOutput> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Outskirts Sovereign Workbench';
  pptx.company = 'Outskirts';
  pptx.title = options.title;

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: '0F172A' };
  titleSlide.addText(options.title, {
    x: 0.6,
    y: 2.2,
    w: 12,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: '38BDF8',
  });
  if (options.subtitle) {
    titleSlide.addText(options.subtitle, { x: 0.6, y: 3.4, w: 12, h: 0.8, fontSize: 18, color: 'CBD5E1' });
  }
  titleSlide.addText('Sovereign AI Workbench · Ed25519-signed provenance', {
    x: 0.6,
    y: 6.6,
    w: 12,
    h: 0.5,
    fontSize: 11,
    color: '64748B',
  });

  for (const slideDef of options.slides) {
    const slide = pptx.addSlide();
    slide.addText(slideDef.title, { x: 0.5, y: 0.4, w: 12, h: 0.9, fontSize: 26, bold: true, color: '1F4E79' });
    slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.25, w: 12, h: 0, line: { color: '38BDF8', width: 2 } });

    if (slideDef.bullets.length > 0) {
      slide.addText(
        slideDef.bullets.map((b) => ({ text: b, options: { bullet: true, color: '1E293B', fontSize: 16 } })),
        { x: 0.7, y: 1.6, w: 11.5, h: 4.8, valign: 'top' },
      );
    }
    if (slideDef.notes) {
      slide.addNotes(slideDef.notes);
    }
    slide.addText('Outskirts · Decision DNA bound', {
      x: 0.5,
      y: 6.95,
      w: 12,
      h: 0.35,
      fontSize: 9,
      color: '94A3B8',
    });
  }

  const data = await pptx.write({ outputType: 'nodebuffer' });
  return { fileName: sanitize(options.title) + '.pptx', mimeType: MIME.pptx, buffer: Buffer.from(data as ArrayBuffer) };
}

export function renderText(options: { title: string; body: string; extension?: string; mime?: string }): RenderOutput {
  const ext = options.extension ?? 'md';
  return {
    fileName: sanitize(options.title) + '.' + ext,
    mimeType: options.mime ?? MIME.markdown,
    buffer: Buffer.from(options.body, 'utf-8'),
  };
}

export function renderHtml(options: { title: string; html: string }): RenderOutput {
  return {
    fileName: sanitize(options.title) + '.html',
    mimeType: MIME.html,
    buffer: Buffer.from(options.html, 'utf-8'),
  };
}

export function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase() || 'artifact';
}
