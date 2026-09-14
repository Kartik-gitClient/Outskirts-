import type { KeyObject } from 'node:crypto';
import type { PluginRecord } from '@outskirts/schemas';
import { defineSignedManifest } from './manifest.js';
import { admitPlugin } from './admission.js';
import type { ToolHandlerMap } from './host.js';

export interface MarketplacePlugin {
  id: string;
  record: PluginRecord;
  handlers: ToolHandlerMap;
}

/**
 * Creates the three governed marketplace demo plugins (Section 17 & 18):
 * 1. report-generator (automates structured executive summaries)
 * 2. data-visualizer (emits ECharts visualization exhibits)
 * 3. unit-converter (industrial units conversion)
 */
export function createDemoMarketplacePlugins(
  keyId: string,
  privateKey: string | KeyObject,
  publicKey: string | KeyObject,
): MarketplacePlugin[] {
  const trustedRoots = new Map([[keyId, publicKey]]);
  const plugins: MarketplacePlugin[] = [];

  // 1. report-generator
  const { manifest: mReport } = defineSignedManifest({
    id: 'report-generator',
    version: '1.0.0',
    runtime: 'wasm',
    tools: [
      {
        name: 'generate_summary_report',
        description: 'Format extraction findings into structured executive briefing blocks',
        inputSchemaRef: 'Quantity',
        outputSchemaRef: 'Quantity',
      },
    ],
    keyId,
    privateKey,
  });
  const admReport = admitPlugin(mReport, trustedRoots);
  plugins.push({
    id: 'report-generator',
    record: admReport.record,
    handlers: {
      generate_summary_report: (input: unknown) => input,
    },
  });

  // 2. data-visualizer
  const { manifest: mVis } = defineSignedManifest({
    id: 'data-visualizer',
    version: '1.0.0',
    runtime: 'wasm',
    tools: [
      {
        name: 'visualize_series',
        description: 'Generate ECharts JSON specifications for process trends and exhibits',
        inputSchemaRef: 'Quantity',
        outputSchemaRef: 'Quantity',
      },
    ],
    keyId,
    privateKey,
  });
  const admVis = admitPlugin(mVis, trustedRoots);
  plugins.push({
    id: 'data-visualizer',
    record: admVis.record,
    handlers: {
      visualize_series: (input: unknown) => input,
    },
  });

  // 3. unit-converter
  const { manifest: mUnit } = defineSignedManifest({
    id: 'unit-converter',
    version: '1.0.0',
    runtime: 'wasm',
    tools: [
      {
        name: 'convert_units',
        description: 'Convert engineering quantities across SI and Imperial units',
        inputSchemaRef: 'Quantity',
        outputSchemaRef: 'Quantity',
      },
    ],
    keyId,
    privateKey,
  });
  const admUnit = admitPlugin(mUnit, trustedRoots);
  plugins.push({
    id: 'unit-converter',
    record: admUnit.record,
    handlers: {
      convert_units: (input: unknown) => input,
    },
  });

  return plugins;
}
