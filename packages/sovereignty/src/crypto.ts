import {
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

export interface Ed25519KeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * Generate a new Ed25519 keypair formatted as PEM strings.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Sign UTF-8 data using an Ed25519 private key (PEM or KeyObject).
 * Returns lowercase hex-encoded signature.
 */
export function signEd25519(data: string, privateKey: string | KeyObject): string {
  const keyObj = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  const sigBuffer = sign(null, Buffer.from(data, 'utf8'), keyObj);
  return sigBuffer.toString('hex');
}

/**
 * Verify an Ed25519 signature over UTF-8 data using a public key (PEM or KeyObject).
 */
export function verifyEd25519(data: string, signatureHex: string, publicKey: string | KeyObject): boolean {
  try {
    const keyObj = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    return verify(null, Buffer.from(data, 'utf8'), keyObj, sigBuffer);
  } catch {
    return false;
  }
}
