/**
 * 角色卡内嵌资产自动识别（2.0 阶段9.5）。
 * ST 的关联逻辑：卡内 character_book 随卡生效、data.extensions.regex_scripts 是
 * 作用域正则。STE 导入卡时把两者各自入资产库，并以 AssetRef 挂到角色的
 * 「关联资产」上——角色页立即可见、可处理（写时复制照常适用）。
 *
 * 只在「新建角色」时提取一次；同一张卡重复手动导入会各建一份（标题相同、id 不同，
 * 文件库落盘自动 ·N 去重）。ST 目录接入路径有 sourcePath 去重，不会重复提取。
 * 内嵌数据格式异常不阻塞导卡，只是不建对应资产。
 */
import type { ArchiveCharacter, AssetRef } from '@/types/archive';
import type { WorldBookItem } from '@/types/worldbook';
import { generateWorldBookId } from '@/types/worldbook';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { characterBookToWorldBook } from '@/lib/character-book';
import { saveWorldBook } from '@/lib/worldbook-db';
import { parseSTRegexImport } from '@/lib/st-regex-interop';
import { buildRegexCollection, saveRegexCollection } from '@/lib/regex-db';

/**
 * 提取并入库内嵌资产，返回应挂到角色上的引用列表（可能为空）。
 * 调用方把返回值并进 character.assets 后再 saveCharacter。
 */
export async function importEmbeddedAssets(character: ArchiveCharacter): Promise<AssetRef[]> {
  const refs: AssetRef[] = [];
  let n;
  try {
    n = normalizeCharacterCard(character.card);
  } catch {
    return refs;
  }

  // 内嵌世界书（character_book：spec 数组条目或独立世界书形态都认）
  try {
    const wb = characterBookToWorldBook(n.characterBook);
    if (wb && Object.keys(wb.entries).length > 0) {
      const bookName = (n.characterBook as { name?: unknown } | null)?.name;
      const now = Date.now();
      const item: WorldBookItem = {
        id: generateWorldBookId(),
        title: typeof bookName === 'string' && bookName.trim() ? bookName.trim() : `${character.name}·内置世界书`,
        worldbook: wb,
        createdAt: now,
        updatedAt: now,
      };
      await saveWorldBook(item);
      refs.push({ kind: 'worldbook', assetId: item.id });
    }
  } catch { /* 内嵌世界书坏了不阻塞导卡 */ }

  // 内嵌正则（extensions.regex_scripts）
  try {
    const scripts = n.extensions?.regex_scripts;
    if (Array.isArray(scripts) && scripts.length > 0) {
      const rules = parseSTRegexImport(scripts);
      if (rules.length > 0) {
        const item = buildRegexCollection(`${character.name}·内置正则`, rules);
        await saveRegexCollection(item);
        refs.push({ kind: 'regex', assetId: item.id });
      }
    }
  } catch { /* 同上 */ }

  return refs;
}
