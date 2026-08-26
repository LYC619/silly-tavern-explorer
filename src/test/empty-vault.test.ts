import { describe, expect, it } from 'vitest';
import { isEmptyVault } from '@/lib/vault/empty-vault';

describe('isEmptyVault', () => {
  it('treats a vault with no user records or shared assets as empty', () => {
    expect(isEmptyVault({ characters: 0, stories: 0, worldbooks: 0, presets: 0, regexes: 0 })).toBe(true);
  });

  it('keeps a vault non-empty when any user-facing record exists', () => {
    expect(isEmptyVault({ characters: 1, stories: 0, worldbooks: 0, presets: 0, regexes: 0 })).toBe(false);
    expect(isEmptyVault({ characters: 0, stories: 0, worldbooks: 0, presets: 0, regexes: 1 })).toBe(false);
  });
});
