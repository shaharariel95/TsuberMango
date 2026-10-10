import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { argValue } = createRequire(import.meta.url)('../scripts/cliArgs');

describe('argValue', () => {
  it('returns the value, or undefined when the flag is absent', () => {
    expect(argValue(['--farmer', 'א', '--execute'], '--farmer')).toBe('א');
    expect(argValue(['--execute'], '--farmer')).toBeUndefined();
  });
  it('throws on a missing or flag-like value', () => {
    expect(() => argValue(['--farmer'], '--farmer')).toThrow(/needs a value/);
    expect(() => argValue(['--farmer', '--execute'], '--farmer')).toThrow(/needs a value/);
    expect(() => argValue(['--farmer', ''], '--farmer')).toThrow(/needs a value/);
  });
});
