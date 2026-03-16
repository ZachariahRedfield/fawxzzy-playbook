import { describe, expect, it } from 'vitest';
import { runCycle } from './run.js';

describe('cycle/run module', () => {
  it('exports runCycle', () => {
    expect(typeof runCycle).toBe('function');
  });
});
