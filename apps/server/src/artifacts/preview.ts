import fs from 'node:fs';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import JSZip from 'jszip';

export interface ArtifactPreview {
  previewType: 'html';
  html: string;
}

const SHELL = (title: string, body: string): string => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { background: #0a0a0a; color: #ededed; font-family: ui-monospace, 'Cascadia Code', monospace; margin: 0; padding: 20px; }
  h1 { font-size: 15px; letter-spacing: 0.06em; margin: 0 0 16px; color: #e2e8f0; }
  h2 { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #00ff66; margin: 20px 0 8px; }
  .card { border: 1px solid #262626; border-radius: 8px; background: #0f0f0f; padding: 14px; margin-bottom: 18px; overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th { text-align: left; color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; padding: 6px 8px; border-bottom: 1px solid #262626; position: sticky; top: 0; background: #0f0f0f; white-space: nowrap; }
  td { padding: 5px 8px; border-bottom: 1px solid #1a1a1a; color: #cbd5e1; white-space: nowrap; }
  tr:hover td { background: #141414; }
  .num { text-align: right; color: #00ff66; }
  pre { white-space: pre-wrap; word-break: break-word; color: #cbd5e1; font-size: 11.5px; line-height: 1.6; margin: 0; }
  .docx-body { line-height: 1.7; font-size: 12.5px; }
  .docx-body h1, .docx-body h2 { color: #e2e8f0; text-transform: none; letter-spacing: 0; }
  .docx-body table { margin: 10px 0; }
  .docx-body td, .docx-body th { white-space: normal; }
  .slide { border: 1px solid #262626; border-radius: 8px; background: #0f0f0f; padding: 18px; margin-bottom: 14px; }
  .slide-title { font-size: 14px; color: #38bdf8; margin-bottom: 8px; }
  .slide ul { margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 12px; line-height: 1.8; }
  svg { max-width: 100%; height: auto; }
  .meta { color: #888; font-size: 10px; margin-bottom: 14px; }
</style>
</head>
<body>${body}</body>
</html>`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isNumeric(v: ExcelJS.CellValue): boolean {
  return typeof v === 'number' || (typeof v === 'object' && v !== null && 'result' in (v as object) && typeof (v as { result?: unknown }).result === 'number');
}

/** Render an .xlsx as styled HTML tables, one per sheet. */
async function previewXlsx(buffer: Buffer, title: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`];
  wb.eachSheet((ws) => {
    const rows: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const cells: string[] = [];
      const maxCol = Math.min(row.cellCount, 40);
      for (let c = 1; c <= maxCol; c++) {
        const v = row.getCell(c).value;
        const text = v === null || v === undefined ? '' : typeof v === 'object' && !(v instanceof Date) && 'richText' in (v as object)
          ? (v as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join('')
          : v instanceof Date
            ? v.toISOString().slice(0, 10)
            : String(v);
        cells.push(rn === 1 ? `<th>${escapeHtml(text)}</th>` : `<td class="${isNumeric(v) ? 'num' : ''}">${escapeHtml(text)}</td>`);
      }
      rows.push(`<tr>${cells.join('')}</tr>`);
    });
    parts.push(`<h2>${escapeHtml(ws.name)} · ${ws.rowCount} rows</h2><div class="card" style="max-height: 480px; overflow: auto;"><table>${rows.join('')}</table></div>`);
  });
  return SHELL(title, parts.join(''));
}

/** Render a .docx as HTML via mammoth. */
async function previewDocx(buffer: Buffer, title: string): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return SHELL(
    title,
    `<h1>${escapeHtml(title)}</h1><div class="docx-body">${value}</div>`,
  );
}

/** Render a .pptx as a slide outline (title + bullets per slide). */
async function previewPptx(buffer: Buffer, title: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });

  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`, `<div class="meta">${slideFiles.length} slides</div>`];
  for (const name of slideFiles) {
    const slideFile = zip.files[name];
    if (!slideFile) continue;
    const xml = await slideFile.async('string');
    const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) =>
      [...(m[1] ?? '').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((t) => t[1] ?? '')
        .join('')
        .trim(),
    ).filter(Boolean);

    const slideTitle = paragraphs[0] ?? '(untitled)';
    const bullets = paragraphs.slice(1);
    parts.push(
      `<div class="slide"><div class="slide-title">${escapeHtml(slideTitle)}</div>${
        bullets.length > 0 ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''
      }</div>`,
    );
  }
  return SHELL(title, parts.join(''));
}

/**
 * Convert any stored artifact into a self-contained HTML preview.
 * xlsx -> live sheet tables; docx -> mammoth HTML; pptx -> slide outline;
 * html/svg -> pass-through; md/json/txt -> preformatted.
 */
export async function renderArtifactPreview(fileName: string, buffer: Buffer): Promise<ArtifactPreview> {
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith('.xlsx')) {
      return { previewType: 'html', html: await previewXlsx(buffer, fileName) };
    }
    if (lower.endsWith('.docx')) {
      return { previewType: 'html', html: await previewDocx(buffer, fileName) };
    }
    if (lower.endsWith('.pptx')) {
      return { previewType: 'html', html: await previewPptx(buffer, fileName) };
    }
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      return { previewType: 'html', html: buffer.toString('utf-8') };
    }
    if (lower.endsWith('.svg')) {
      return {
        previewType: 'html',
        html: SHELL(fileName, `<div class="card" style="text-align:center; background:#fff;">${buffer.toString('utf-8')}</div>`),
      };
    }
    if (lower.endsWith('.json')) {
      const pretty = JSON.stringify(JSON.parse(buffer.toString('utf-8')), null, 2);
      return { previewType: 'html', html: SHELL(fileName, `<h1>${escapeHtml(fileName)}</h1><div class="card"><pre>${escapeHtml(pretty)}</pre></div>`) };
    }
    // markdown / txt and anything else textual
    return {
      previewType: 'html',
      html: SHELL(fileName, `<h1>${escapeHtml(fileName)}</h1><div class="card"><pre>${escapeHtml(buffer.toString('utf-8'))}</pre></div>`),
    };
  } catch (err: unknown) {
    return {
      previewType: 'html',
      html: SHELL(
        fileName,
        `<h1>${escapeHtml(fileName)}</h1><div class="card"><pre>Preview failed: ${escapeHtml(err instanceof Error ? err.message : String(err))}</pre></div>`,
      ),
    };
  }
}

/** Read an artifact file from disk for previewing. Throws if unreadable. */
export function readArtifactFile(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}
