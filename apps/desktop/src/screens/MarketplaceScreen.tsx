import React, { useState } from 'react';
import { useAppStore } from '../store/index.js';

export const MarketplaceScreen: React.FC = () => {
  const plugins = useAppStore((s) => s.plugins);
  const togglePluginEnabled = useAppStore((s) => s.togglePluginEnabled);
  const recordAlert = useAppStore((s) => s.recordAlert);

  const [selectedPluginId, setSelectedPluginId] = useState<string>('report-generator');

  const defaultPlugins = plugins.length > 0 ? plugins : [
    {
      manifest: {
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
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-4a88f',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['admin', 'senior'],
      manifestHash: 'sha256:7f8e9d0a...',
    },
    {
      manifest: {
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
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-9b21e',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['admin', 'senior', 'junior'],
      manifestHash: 'sha256:4a65b8c9...',
    },
    {
      manifest: {
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
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-2c77d',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:1a2b3c4d...',
    },
    {
      manifest: {
        id: 'ocr-engine',
        version: '1.2.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'extract_pdf_ocr',
            description: 'PDF OCR & layout preservation engine with multi-column text recognition',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-ocr-3f',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:5a6b7c8d...',
    },
    {
      manifest: {
        id: 'vision-analyzer',
        version: '2.0.1',
        runtime: 'wasm',
        tools: [
          {
            name: 'analyze_engineering_diagram',
            description: 'Perceive engineering schematics, blueprints, and equipment photos',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-vis-8e',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:6b7c8d9e...',
    },
    {
      manifest: {
        id: 'pid-analyzer',
        version: '1.5.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'extract_pid_topology',
            description: 'Extract ISA-5.1 tags, pumps, valves, vessels, and piping connectivity multigraph',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-pid-1a',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:7c8d9e0f...',
    },
    {
      manifest: {
        id: 'handwriting-reader',
        version: '1.1.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'transcribe_field_notes',
            description: 'Transcribe handwritten field inspection logs and probe scan sheets',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-hwr-9b',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:8d9e0f1a...',
    },
    {
      manifest: {
        id: 'engineering-calc',
        version: '2.1.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'solve_engineering_formula',
            description: 'Solve physics equations with full intermediate variable derivations',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-calc-4c',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:9e0f1a2b...',
    },
    {
      manifest: {
        id: 'piping-simulator',
        version: '1.4.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'simulate_hydraulic_network',
            description: 'Hydraulic network pressure drop simulation (Darcy-Weisbach / Colebrook-White)',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-pipe-7d',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:0f1a2b3c...',
    },
    {
      manifest: {
        id: 'excel-analytics',
        version: '1.3.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'generate_excel_workbook',
            description: 'Generate multi-sheet Excel workbooks with dynamic formula cells (.xlsx)',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-xls-3e',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:1a2b3c4d...',
    },
    {
      manifest: {
        id: 'translation-hindi',
        version: '1.0.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'translate_hindi_english',
            description: 'Bilingual technical translation preserving engineering terminology',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-trn-5f',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:2b3c4d5e...',
    },
    {
      manifest: {
        id: 'qr-generator',
        version: '1.0.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'generate_equipment_qr',
            description: 'Generate industrial equipment tag QR codes with asset metadata payload',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-qr-6a',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: true,
      roleGates: ['junior', 'senior', 'admin'],
      manifestHash: 'sha256:3c4d5e6f...',
    },
    {
      manifest: {
        id: 'image-generator',
        version: '1.0.0',
        runtime: 'wasm',
        tools: [
          {
            name: 'render_schematic_render',
            description: 'Render process equipment diagrams and visual exhibits (API-backed)',
            inputSchemaRef: 'Quantity',
            outputSchemaRef: 'Quantity',
          },
        ],
        keyId: 'publisher-tpm-root',
        signature: 'ed25519:valid-sig-img-7b',
      },
      installedAt: '2026-09-13T10:00:00Z',
      signatureValid: true,
      keyTrusted: true,
      enabled: false,
      roleGates: ['senior', 'admin'],
      manifestHash: 'sha256:4d5e6f7a...',
    },
  ];

  const activePlugin = defaultPlugins.find((p) => p.manifest.id === selectedPluginId) ?? defaultPlugins[0];

  const handleSimulateRogueVariant1 = () => {
    recordAlert({
      alertId: `alert-rogue-1-${Date.now()}`,
      seq: 99 as any,
      ts: new Date().toISOString(),
      kind: 'egress-attempt-blocked' as any,
      pluginId: 'rogue-lying-manifest',
      pluginVersion: '1.0.0',
      detail: 'Execution Boundary: covert network socket blocked by capability sandbox',
    });
    alert('Rogue Variant 1 Simulated: Lying manifest blocked at capability boundary!');
  };

  const handleSimulateRogueVariant2 = () => {
    recordAlert({
      alertId: `alert-rogue-2-${Date.now()}`,
      seq: 100 as any,
      ts: new Date().toISOString(),
      kind: 'key-untrusted' as any,
      pluginId: 'rogue-untrusted-key',
      pluginVersion: '1.0.0',
      detail: 'Admission Boundary: signing key "attacker-untrusted-key" is not in the pinned trust root allowlist',
    });
    alert('Rogue Variant 2 Simulated: Untrusted key rejected at admission boundary!');
  };

  return (
    <div className="marketplace-layout">
      <div className="marketplace-header">
        <div>
          <h2>Governed Capabilities &amp; Marketplace</h2>
          <p>Every capability beyond the core loop is a manifest-declared, signed package admitted by the guard.</p>
        </div>
        <div className="rogue-actions">
          <button className="btn-rogue" onClick={handleSimulateRogueVariant1}>
            Test Rogue Variant 1 (Lying Manifest)
          </button>
          <button className="btn-rogue" onClick={handleSimulateRogueVariant2}>
            Test Rogue Variant 2 (Untrusted Key)
          </button>
        </div>
      </div>

      <div className="marketplace-grid">
        {/* Plugin Cards List */}
        <div className="plugins-column">
          {defaultPlugins.map((p) => {
            const isSelected = p.manifest.id === selectedPluginId;
            return (
              <div
                key={p.manifest.id}
                className={`plugin-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedPluginId(p.manifest.id)}
              >
                <div className="plugin-card-top">
                  <span className="plugin-id">{p.manifest.id}</span>
                  <span className={`runtime-badge ${p.manifest.runtime}`}>{p.manifest.runtime}</span>
                </div>
                <div className="plugin-meta">
                  <span>Version: {p.manifest.version}</span>
                  <span className={`status-pill ${p.enabled ? 'enabled' : 'disabled'}`}>
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Plugin Details & Permission Inspector */}
        {activePlugin && (
          <div className="plugin-details-column">
            <div className="details-header">
              <h3>{activePlugin.manifest.id}</h3>
              <button
                className={`toggle-enabled-btn ${activePlugin.enabled ? 'disable' : 'enable'}`}
                onClick={() => togglePluginEnabled(activePlugin.manifest.id, !activePlugin.enabled)}
              >
                {activePlugin.enabled ? 'Disable Plugin' : 'Enable Plugin'}
              </button>
            </div>

            <div className="details-section">
              <h4>Security &amp; Admission Boundary</h4>
              <div className="badge-row">
                <span className={`status-pill ${activePlugin.keyTrusted ? 'pass' : 'fail'}`}>
                  {activePlugin.keyTrusted ? '✓ Pinned Trust Root Verified' : '✗ Untrusted Key'}
                </span>
                <span className={`status-pill ${activePlugin.signatureValid ? 'pass' : 'fail'}`}>
                  {activePlugin.signatureValid ? '✓ Ed25519 Signature Valid' : '✗ Invalid Signature'}
                </span>
                <span className="key-id">Key ID: {activePlugin.manifest.keyId}</span>
              </div>
            </div>

            <div className="details-section">
              <h4>Declared Tool Specs &amp; Schema Contracts</h4>
              <div className="tools-list">
                {activePlugin.manifest.tools.map((t) => (
                  <div key={t.name} className="tool-spec-card">
                    <div className="tool-name"><code>{t.name}</code></div>
                    <div className="tool-desc">{t.description}</div>
                    <div className="tool-schemas">
                      <span>Input: <code>{t.inputSchemaRef}</code></span> &bull; 
                      <span>Output: <code>{t.outputSchemaRef}</code></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="details-section">
              <h4>Cedar RBAC Role Gates</h4>
              <div className="roles-row">
                {activePlugin.roleGates.map((role) => (
                  <span key={role} className="role-tag">{role}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
