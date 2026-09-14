import { sha256Hex } from './canonical.js';

export const ZERO_HASH = '0'.repeat(64);

/**
 * Compute the binary Merkle root from a sequence of leaf SHA-256 hashes.
 * If the number of nodes at a level is odd, the last node is duplicated.
 */
export function computeMerkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) {
    return ZERO_HASH;
  }
  if (leaves.length === 1) {
    return leaves[0]!;
  }

  let currentLevel: string[] = [...leaves];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left;
      nextLevel.push(sha256Hex(left + right));
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}
