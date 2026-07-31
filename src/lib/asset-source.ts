export type AssetSource = 'fromST' | 'manual' | 'derived' | 'autoSaved';

export interface AssetSourceFlags {
  derived?: boolean;
  autoSaved?: boolean;
  fromST?: boolean;
}

export function classifyAssetSource(flags: AssetSourceFlags): AssetSource {
  if (flags.derived) return 'derived';
  if (flags.autoSaved) return 'autoSaved';
  if (flags.fromST) return 'fromST';
  return 'manual';
}
