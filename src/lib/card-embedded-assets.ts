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
import { getAllWorldBooks, saveWorldBook } from '@/lib/worldbook-db';
import { parseSTRegexImport } from '@/lib/st-regex-interop';
import { buildRegexCollection, getAllRegexCollections, saveRegexCollection } from '@/lib/regex-db';

export interface EmbeddedAssetImportOptions {
  onDuplicate?: (kind: AssetRef['kind'], assetId: string) => void;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

/** 稳定的 64 位 FNV-1a 内容哈希；仅用于本地去重，不承担安全校验。 */
export function embeddedContentHash(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of stableJson(value)) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function regexContentForHash(rules: ReturnType<typeof parseSTRegexImport>): unknown[] {
  return rules.map(({ id: _id, ...rule }) => rule);
}

/**
 * 提取并入库内嵌资产，返回应挂到角色上的引用列表（可能为空）。
 * 调用方把返回值并进 character.assets 后再 saveCharacter。
 */
export async function importEmbeddedAssets(
  character: ArchiveCharacter,
  options: EmbeddedAssetImportOptions = {},
): Promise<AssetRef[]> {
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
      const contentHash = embeddedContentHash(wb);
      const linkedIds = new Set(
        (character.assets ?? []).filter((ref) => ref.kind === 'worldbook').map((ref) => ref.assetId),
      );
      const existing = (await getAllWorldBooks()).find((item) => (
        (linkedIds.has(item.id) && embeddedContentHash(item.worldbook) === contentHash)
        || (item.embedded?.characterId === character.id && item.embedded.contentHash === contentHash)
      ));
      if (existing) {
        refs.push({ kind: 'worldbook', assetId: existing.id });
        options.onDuplicate?.('worldbook', existing.id);
      } else {
      const bookName = (n.characterBook as { name?: unknown } | null)?.name;
      const now = Date.now();
      const item: WorldBookItem = {
        id: generateWorldBookId(),
        title: typeof bookName === 'string' && bookName.trim() ? bookName.trim() : `${character.name}·内置世界书`,
        worldbook: wb,
        embedded: { characterId: character.id, contentHash, importedAt: now },
        createdAt: now,
        updatedAt: now,
      };
      await saveWorldBook(item);
      refs.push({ kind: 'worldbook', assetId: item.id });
      }
    }
  } catch { /* 内嵌世界书坏了不阻塞导卡 */ }

  // 内嵌正则（extensions.regex_scripts）
  try {
    const scripts = n.extensions?.regex_scripts;
    if (Array.isArray(scripts) && scripts.length > 0) {
      const rules = parseSTRegexImport(scripts);
      if (rules.length > 0) {
        const candidate = buildRegexCollection(`${character.name}·内置正则`, rules);
        const contentHash = embeddedContentHash(regexContentForHash(candidate.rules));
        const linkedIds = new Set(
          (character.assets ?? []).filter((ref) => ref.kind === 'regex').map((ref) => ref.assetId),
        );
        const existing = (await getAllRegexCollections()).find((item) => (
          (linkedIds.has(item.id) && embeddedContentHash(regexContentForHash(item.rules)) === contentHash)
          || (item.embedded?.characterId === character.id && item.embedded.contentHash === contentHash)
        ));
        if (existing) {
          refs.push({ kind: 'regex', assetId: existing.id });
          options.onDuplicate?.('regex', existing.id);
        } else {
          const item = candidate;
          item.embedded = { characterId: character.id, contentHash, importedAt: item.createdAt };
          await saveRegexCollection(item);
          refs.push({ kind: 'regex', assetId: item.id });
        }
      }
    }
  } catch { /* 同上 */ }

  return refs;
}
