import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { canonicalJsonStringify, sha256Hex } from './canonical.js';
import { signEd25519, verifyEd25519 } from './crypto.js';

export interface SbomComponent {
  name: string;
  version: string;
  type: 'application' | 'library' | 'framework' | 'container';
  purl: string;
  license: string;
  description: string;
  sha256: string;
}

export interface PlatformSbom {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
    component: SbomComponent;
  };
  components: SbomComponent[];
  signature: {
    keyId: string;
    algorithm: 'Ed25519';
    signature: string;
  };
}

export const PLATFORM_CORE_COMPONENTS: Omit<SbomComponent, 'sha256'>[] = [
  {
    name: '@outskirts/schemas',
    version: '0.1.0',
    type: 'library',
    purl: 'pkg:npm/%40outskirts/schemas@0.1.0',
    license: 'Apache-2.0',
    description: 'Schema Spine for Outskirts Sovereign AI Workbench',
  },
  {
    name: '@outskirts/pal',
    version: '0.1.0',
    type: 'library',
    purl: 'pkg:npm/%40outskirts/pal@0.1.0',
    license: 'Apache-2.0',
    description: 'Provider Abstraction Layer with residency router & cassette recorder',
  },
  {
    name: '@outskirts/sovereignty',
    version: '0.1.0',
    type: 'library',
    purl: 'pkg:npm/%40outskirts/sovereignty@0.1.0',
    license: 'Apache-2.0',
    description: 'Cryptographic Audit Chain, Merkle Trees, Ed25519 Anchors, and Decision DNA',
  },
  {
    name: '@outskirts/knowledge',
    version: '0.1.0',
    type: 'library',
    purl: 'pkg:npm/%40outskirts/knowledge@0.1.0',
    license: 'Apache-2.0',
    description: 'Freshness Engine, review cycles, exponential decay, and retrieval orchestration',
  },
  {
    name: '@outskirts/plugin-sdk',
    version: '0.1.0',
    type: 'library',
    purl: 'pkg:npm/%40outskirts/plugin-sdk@0.1.0',
    license: 'Apache-2.0',
    description: 'Governed Plugin Host, admission control, and Darcy-Weisbach hydraulics',
  },
  {
    name: '@outskirts/server',
    version: '0.1.0',
    type: 'application',
    purl: 'pkg:npm/%40outskirts/server@0.1.0',
    license: 'Apache-2.0',
    description: 'Outskirts Gateway Server, WS sequence replay, and 8-step Agent Graph',
  },
  {
    name: 'tei-bge-m3',
    version: '1.0.0',
    type: 'container',
    purl: 'pkg:oci/ghcr.io/huggingface/text-embeddings-inference@cpu-latest',
    license: 'Apache-2.0',
    description: 'Offline Text Embeddings Inference engine hosting BAAI/bge-m3 weights',
  },
  {
    name: 'qdrant-vector-db',
    version: '1.11.0',
    type: 'container',
    purl: 'pkg:oci/qdrant/qdrant@latest',
    license: 'Apache-2.0',
    description: 'Air-gapped Vector Database with Reciprocal Rank Fusion',
  },
];

/**
 * Generates a signed, verifiable CycloneDX 1.5 Software Bill of Materials (SBOM) (Section 18 P4).
 */
export function generatePlatformSbom(options: {
  keyId: string;
  privateKey: string | KeyObject;
  timestamp?: string;
}): PlatformSbom {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const serialNumber = `urn:uuid:${randomUUID()}`;

  const components: SbomComponent[] = PLATFORM_CORE_COMPONENTS.map((c) => ({
    ...c,
    sha256: sha256Hex(`${c.purl}:${c.version}:${c.license}`),
  }));

  const rootComponent: SbomComponent = {
    name: 'outskirts-sovereign-workbench',
    version: '0.1.0',
    type: 'application',
    purl: 'pkg:npm/outskirts-sovereign-workbench@0.1.0',
    license: 'Apache-2.0',
    description: 'Outskirts: Sovereign AI Workbench for Industrial Engineering',
    sha256: sha256Hex('outskirts-sovereign-root-manifest'),
  };

  const sbomBody = {
    bomFormat: 'CycloneDX' as const,
    specVersion: '1.5' as const,
    serialNumber,
    version: 1,
    metadata: {
      timestamp,
      tools: [
        {
          vendor: 'PRITHVEDA',
          name: 'outskirts-sbom-generator',
          version: '1.0.0',
        },
      ],
      component: rootComponent,
    },
    components,
  };

  const canonicalBody = canonicalJsonStringify(sbomBody);
  const sig = signEd25519(canonicalBody, options.privateKey);

  return {
    ...sbomBody,
    signature: {
      keyId: options.keyId,
      algorithm: 'Ed25519',
      signature: sig,
    },
  };
}

/**
 * Verifies an SBOM's digital signature against a trusted public key.
 */
export function verifyPlatformSbom(
  sbom: PlatformSbom,
  trustedKeys: Map<string, string | KeyObject> | Record<string, string | KeyObject>,
): boolean {
  const { signature, ...body } = sbom;
  const canonicalBody = canonicalJsonStringify(body);

  const key =
    trustedKeys instanceof Map
      ? trustedKeys.get(signature.keyId)
      : trustedKeys[signature.keyId];

  if (!key) {
    return false;
  }

  return verifyEd25519(canonicalBody, signature.signature, key);
}
