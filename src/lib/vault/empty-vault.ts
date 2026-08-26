export interface VaultContentCounts {
  characters: number;
  stories: number;
  worldbooks: number;
  presets: number;
  regexes: number;
}

/** A vault is empty when it contains no user-facing STE records or shared assets. */
export function isEmptyVault(counts: VaultContentCounts): boolean {
  return Object.values(counts).every((value) => value === 0);
}
