import { describe, it, expect } from 'vitest';
import {
  createSovereignPAL,
  createSovereignRegistry,
} from '../src/index.js';

describe('Sovereign Build Target (outskirts-sovereign)', () => {
  it('contains zero remote or outside-perimeter models in the sovereign registry', () => {
    const registry = createSovereignRegistry();
    const models = registry.getAll();

    expect(models.length).toBeGreaterThanOrEqual(3);

    for (const m of models) {
      expect(m.trustBoundary).toBe('inside-perimeter');
      expect(['in-process', 'loopback', 'lan']).toContain(m.locality);
      expect(m.locality).not.toBe('internet');
    }
  });

  it('sovereign PAL is hardcoded to SOVEREIGN mode and only registers local adapters', () => {
    const pal = createSovereignPAL();
    expect(pal.getMode()).toBe('SOVEREIGN');

    const vllm = pal.getAdapter('vllm');
    const ollama = pal.getAdapter('ollama');

    expect(vllm).toBeDefined();
    expect(vllm?.locality).toBe('loopback');
    expect(vllm?.trustBoundary).toBe('inside-perimeter');

    expect(ollama).toBeDefined();
    expect(ollama?.locality).toBe('loopback');
    expect(ollama?.trustBoundary).toBe('inside-perimeter');

    // NIM or internet remote adapters are absent
    expect(pal.getAdapter('nim')).toBeUndefined();
  });
});
