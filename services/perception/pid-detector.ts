import type { BBox, DrawingExtraction, DrawingTag } from '@outskirts/schemas';

export interface DetectionMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export function computeBBoxIoU(b1: BBox, b2: BBox): number {
  const xLeft = Math.max(b1.x, b2.x);
  const yTop = Math.max(b1.y, b2.y);
  const xRight = Math.min(b1.x + b1.w, b2.x + b2.w);
  const yBottom = Math.min(b1.y + b1.h, b2.y + b2.h);

  if (xRight <= xLeft || yBottom <= yTop) {
    return 0.0;
  }

  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const area1 = b1.w * b1.h;
  const area2 = b2.w * b2.h;
  const union = area1 + area2 - intersection;

  return intersection / union;
}

/**
 * Perception pipeline for P&ID drawings (Section 7.2).
 * Simulates RF-DETR symbol detection + SAHI tiling + tag bubble OCR over drawing sheets.
 */
export class PidDrawingDetector {
  /**
   * Run tiled inference over a drawing sheet, returning extracted tags and geometry.
   */
  public extractTags(
    drawingId: string,
    groundTruthTags: DrawingTag[],
    noise = false,
  ): DrawingExtraction {
    const detectedTags: DrawingTag[] = [];

    for (const gt of groundTruthTags) {
      // High-precision simulation of fine-tuned RF-DETR model
      const jitterX = noise ? (Math.random() - 0.5) * 4 : 0;
      const jitterY = noise ? (Math.random() - 0.5) * 4 : 0;

      const detected: DrawingTag = {
        tagId: `det-${gt.tagNumber}`,
        tagNumber: gt.tagNumber,
        symbolClass: gt.symbolClass,
        lineNumber: gt.lineNumber,
        detectorConfidence: Number((0.95 + (Math.random() * 0.04)).toFixed(3)),
        ocrConfidence: 0.98,
        bbox: {
          page: 1,
          x: gt.bbox.x + jitterX,
          y: gt.bbox.y + jitterY,
          w: gt.bbox.w,
          h: gt.bbox.h,
        },
      };

      detectedTags.push(detected);
    }

    return {
      documentId: drawingId,
      sheetNumber: '01',
      tags: detectedTags,
      connections: [],
    };
  }

  /**
   * Measure tag symbol detection and OCR Precision & Recall against ground truth.
   */
  public evaluateExtraction(
    detected: DrawingExtraction,
    groundTruth: DrawingExtraction,
    iouThreshold = 0.5,
  ): DetectionMetrics {
    let tp = 0;
    let fp = 0;
    const matchedGt = new Set<string>();

    for (const dTag of detected.tags) {
      let bestIoU = 0;
      let matchedId: string | undefined;

      for (const gtTag of groundTruth.tags) {
        if (dTag.tagNumber === gtTag.tagNumber) {
          const iou = computeBBoxIoU(dTag.bbox, gtTag.bbox);
          if (iou > bestIoU) {
            bestIoU = iou;
            matchedId = gtTag.tagId;
          }
        }
      }

      if (bestIoU >= iouThreshold && matchedId && !matchedGt.has(matchedId)) {
        tp++;
        matchedGt.add(matchedId);
      } else {
        fp++;
      }
    }

    const fn = groundTruth.tags.length - tp;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: Number((precision * 100).toFixed(1)),
      recall: Number((recall * 100).toFixed(1)),
      f1: Number((f1 * 100).toFixed(1)),
    };
  }

  /**
   * Region-link resolver: maps a tag query (e.g. "P-101A") to its normalized crop coordinates
   * for OpenSeadragon or PDF.js viewers.
   */
  public resolveRegionLink(extraction: DrawingExtraction, tagNumber: string): BBox | undefined {
    const tag = extraction.tags.find((t: DrawingTag) => t.tagNumber.toUpperCase() === tagNumber.toUpperCase());
    return tag?.bbox;
  }
}
