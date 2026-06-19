import {
  parseWorldBook,
  normalizeEntry,
  type WorldBook,
  type WorldBookEntry,
} from '@/types/worldbook';

/**
 * 内嵌角色卡世界书 (character_book) → 应用内 WorldBook。
 * 依据 _reference/st-docs/02-character-card-v2-v3.md §5。
 *
 * 卡内 character_book 用 spec 的 snake_case 命名（keys/secondary_keys/insertion_order/enabled），
 * 且大部分运行时字段嵌在 entry.extensions 里（extensions.position 数字才是真正生效的）。
 * 这里把 extensions.* 提到顶层后复用世界书的 normalizeEntry（它已能处理 snake_case + enabled）。
 */

interface CharacterBookEntry {
  keys?: unknown;
  secondary_keys?: unknown;
  comment?: unknown;
  content?: unknown;
  constant?: unknown;
  selective?: unknown;
  insertion_order?: unknown;
  enabled?: unknown;
  position?: unknown; // 字符串枚举，仅 spec 兼容
  use_regex?: unknown;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CharacterBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: Record<string, unknown>;
  entries?: CharacterBookEntry[];
  [key: string]: unknown;
}

/**
 * 把卡内 entry 的 extensions.* 提升到顶层，使其能被世界书 normalizeEntry 消化。
 * extensions.position（数字）优先于顶层 position（字符串）。
 */
function flattenEntry(entry: CharacterBookEntry): Record<string, unknown> {
  const ext = entry.extensions ?? {};
  const flat: Record<string, unknown> = { ...entry, ...ext };
  // extensions.position 数字优先；否则保留顶层字符串 position 交给 normalizeEntry 的字符串映射
  if (ext.position !== undefined) {
    flat.position = ext.position;
  }
  delete flat.extensions;
  return flat;
}

/** 判断一个对象是否像 character_book（有 entries 数组或 spec 顶层字段） */
export function isCharacterBook(obj: unknown): obj is CharacterBook {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.entries) || 'scan_depth' in o || 'recursive_scanning' in o;
}

/**
 * 把 character_book 转为应用内 WorldBook。
 * 若传入的对象已是独立世界书形态（entries 为对象/数组、用 key 而非 keys），
 * 直接走 parseWorldBook。
 */
export function characterBookToWorldBook(book: unknown): WorldBook | null {
  if (!book || typeof book !== 'object') return null;
  const b = book as CharacterBook;

  // entries 是数组（character_book spec 形态）→ 逐条 flatten 后 normalize
  if (Array.isArray(b.entries)) {
    const entries: Record<string, WorldBookEntry> = {};
    b.entries.forEach((entry, i) => {
      const flat = flattenEntry(entry);
      const uid = (flat.uid as number) ?? i;
      entries[String(uid)] = normalizeEntry(flat, uid);
    });
    const originalData: Record<string, unknown> = { ...b };
    delete originalData.entries;
    return { entries, originalData };
  }

  // 否则当独立世界书（entries 为对象）处理
  if (b.entries && typeof b.entries === 'object') {
    return parseWorldBook(b as Record<string, unknown>);
  }

  return null;
}
