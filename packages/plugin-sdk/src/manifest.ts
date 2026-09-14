import type { KeyObject } from 'node:crypto';
import {
  PluginManifest,
  type PluginRuntime,
  type ToolSpec,
} from '@outskirts/schemas';
import {
  canonicalJsonStringify,
  sha256Hex,
  signEd25519,
  verifyEd25519,
} from '@outskirts/sovereignty';

export interface DefinePluginOptions {
  id: string;
  version: string;
  minCore?: string;
  runtime?: PluginRuntime;
  entry?: string;
  fs?: { read?: string[]; write?: string[] };
  resources?: { cpu?: number; mem?: string; timeoutS?: number };
  tools: ToolSpec[];
  keyId: string;
  privateKey: string | KeyObject;
}

/**
 * Construct and cryptographically sign a PluginManifest using Ed25519.
 */
export function defineSignedManifest(options: DefinePluginOptions): {
  manifest: PluginManifest;
  manifestHash: string;
} {
  const body = {
    id: options.id,
    version: options.version,
    minCore: options.minCore ?? '>=0.1.0',
    runtime: options.runtime ?? 'wasm',
    entry: options.entry ?? `dist/${options.id}.wasm`,
    network: 'deny-all' as const,
    fs: {
      read: options.fs?.read ?? [],
      write: options.fs?.write ?? [],
    },
    resources: {
      cpu: options.resources?.cpu ?? 1.0,
      mem: options.resources?.mem ?? '64M',
      timeoutS: options.resources?.timeoutS ?? 10,
    },
    tools: options.tools,
    keyId: options.keyId,
  };

  const canonicalBody = canonicalJsonStringify(body);
  const signatureHex = signEd25519(canonicalBody, options.privateKey);
  const signature = `ed25519:${signatureHex}`;

  const manifest = PluginManifest.parse({
    ...body,
    signature,
  });

  const manifestHash = sha256Hex(canonicalJsonStringify(manifest));

  return { manifest, manifestHash };
}

/**
 * Verify Ed25519 signature of a PluginManifest.
 */
export function verifyManifestSignature(
  manifest: PluginManifest,
  publicKey: string | KeyObject,
): boolean {
  if (!manifest.signature.startsWith('ed25519:')) {
    return false;
  }
  const sigHex = manifest.signature.slice('ed25519:'.length);

  const body = {
    id: manifest.id,
    version: manifest.version,
    minCore: manifest.minCore,
    runtime: manifest.runtime,
    entry: manifest.entry,
    network: manifest.network,
    fs: manifest.fs,
    resources: manifest.resources,
    tools: manifest.tools,
    keyId: manifest.keyId,
  };

  const canonicalBody = canonicalJsonStringify(body);
  return verifyEd25519(canonicalBody, sigHex, publicKey);
}
