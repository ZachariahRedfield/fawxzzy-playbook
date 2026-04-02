import { describe, expect, it } from 'vitest';
import { runExecution } from './run.js';

describe('execution run command', () => {
  it('exports runExecution function', () => {
    expect(typeof runExecution).toBe('function');
  });
});

