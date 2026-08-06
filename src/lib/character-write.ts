import type { ArchiveCharacter } from '@/types/archive';

export type CharacterPatch =
  | Partial<ArchiveCharacter>
  | ((current: ArchiveCharacter) => Partial<ArchiveCharacter> | undefined | Promise<Partial<ArchiveCharacter> | undefined>);

export type PersistCharacterPatch = (
  id: string,
  updater: (current: ArchiveCharacter) => Partial<ArchiveCharacter> | undefined | Promise<Partial<ArchiveCharacter> | undefined>,
) => Promise<ArchiveCharacter | undefined>;

/** 只在持久化成功后提交界面状态，失败时调用方仍持有原来的已落库数据。 */
export async function commitCharacterPatch(
  id: string,
  patch: CharacterPatch,
  persist: PersistCharacterPatch,
  commit: (saved: ArchiveCharacter) => void,
): Promise<ArchiveCharacter> {
  const saved = await persist(id, async (current) => (
    typeof patch === 'function' ? patch(current) : patch
  ));
  if (!saved) throw new Error('角色档案不存在');
  commit(saved);
  return saved;
}
