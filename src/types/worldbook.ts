export interface WorldBookEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string; // title/memo
  content: string;
  constant: boolean; // always active
  vectorized: boolean; // vector matching
  selective: boolean;
  selectiveLogic: number; // 0=AND ANY, 1=NOT ALL, 2=NOT ANY, 3=AND ALL
  enabled: boolean;
  position: number;
  depth: number;
  order: number;
  probability: number; // 0-100
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  sticky: number;
  cooldown: number;
  delay: number;
  role: number; // 0=system, 1=user, 2=assistant
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId: string;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  displayIndex: number;
  // preserve unknown fields
  [key: string]: unknown;
}

export interface WorldBook {
  entries: Record<string, WorldBookEntry>;
  originalData?: Record<string, unknown>;
}

export interface WorldBookItem {
  id: string;
  title: string;
  worldbook: WorldBook;
  createdAt: number;
  updatedAt: number;
  /** true=自动保留的导入历史(最近5份，超出自动清理)；false/undefined=用户手动保存到书架，永久留存 */
  autoSaved?: boolean;
}

export const POSITION_LABELS: Record<number, string> = {
  0: '角色设定之前',
  1: '角色设定之后',
  2: '示例消息之前',
  3: '示例消息之后',
  4: '作者注释顶部',
  5: '作者注释底部',
  6: '@ 指定深度',
};

/** 老格式字符串 position → 数字（before_char 等）。来源：ST ≤1.9 / NovelAI Lorebook 风格 */
const STRING_POSITION_MAP: Record<string, number> = {
  before_char: 0,
  after_char: 1,
  before_example: 2,
  after_example: 3,
  before_an: 4,
  after_an: 5,
  at_depth: 6,
};

export const SELECTIVE_LOGIC_LABELS: Record<number, string> = {
  0: 'AND ANY',
  1: 'NOT ALL',
  2: 'NOT ANY',
  3: 'AND ALL',
};

export const ROLE_LABELS: Record<number, string> = {
  0: '系统 (System)',
  1: '用户 (User)',
  2: '助手 (Assistant)',
};

export const DEFAULT_ENTRY: Omit<WorldBookEntry, 'uid'> = {
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  enabled: true,
  position: 1,
  depth: 4,
  order: 100,
  probability: 100,
  group: '',
  groupOverride: false,
  groupWeight: 100,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  role: 0,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: '',
  excludeRecursion: false,
  preventRecursion: false,
  delayUntilRecursion: false,
  displayIndex: 0,
};

/** Parse key string (comma-separated) into array. 兼容数组/逗号串/含 null 元素 */
export function parseKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((k): k is string => typeof k === 'string')
      .map(k => k.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map(k => k.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 把 position 归一为数字（0-6）。
 * - 数字直接用；`-1`(老版"禁用注入") 返回特殊标记交由 normalizeEntry 处理
 * - 字符串老枚举(before_char 等)映射为数字
 */
function normalizePosition(raw: unknown): { position: number; disableByPosition: boolean } {
  if (typeof raw === 'number') {
    if (raw === -1) return { position: 1, disableByPosition: true }; // 老版 position:-1 = 禁用
    return { position: raw, disableByPosition: false };
  }
  if (typeof raw === 'string') {
    const mapped = STRING_POSITION_MAP[raw.trim()];
    if (mapped !== undefined) return { position: mapped, disableByPosition: false };
  }
  return { position: 1, disableByPosition: false };
}

/**
 * 读取 enabled 状态，处理 ST 的反义 `disable` 字段。
 * 优先级：disable(ST 真实字段) → enabled(本应用/部分第三方) → 默认 true。
 */
function readEnabled(raw: Record<string, unknown>): boolean {
  if (raw.disable !== undefined) return !(raw.disable as boolean);
  if (raw.enabled !== undefined) return raw.enabled as boolean;
  return true;
}

/** 取首个已定义的字段值（用于老/新字段名兼容） */
function pick<T>(raw: Record<string, unknown>, ...names: string[]): T | undefined {
  for (const n of names) {
    if (raw[n] !== undefined) return raw[n] as T;
  }
  return undefined;
}

/** Normalize a raw entry from JSON, filling missing fields with defaults.
 *  兼容老格式：字符串 position、snake_case 旧字段名、disable 反义、entry 顶层 name→comment、selectiveLogic:4→0 */
export function normalizeEntry(raw: Record<string, unknown>, uid: number): WorldBookEntry {
  const { position, disableByPosition } = normalizePosition(raw.position);
  const enabled = disableByPosition ? false : readEnabled(raw);
  // selectiveLogic:4(已废弃 XOR) → 0
  const rawLogic = (raw.selectiveLogic as number) ?? 0;
  const selectiveLogic = rawLogic === 4 ? 0 : rawLogic;

  const result: WorldBookEntry = {
    ...DEFAULT_ENTRY,
    ...raw,
    uid,
    key: parseKeys(pick(raw, 'key', 'keys') ?? ''),
    keysecondary: parseKeys(pick(raw, 'keysecondary', 'secondary_keys') ?? ''),
    // entry 顶层 name(NAI 风格) 作为 comment 兜底
    comment: (pick<string>(raw, 'comment', 'name')) ?? '',
    content: (raw.content as string) ?? '',
    constant: (raw.constant as boolean) ?? false,
    vectorized: (raw.vectorized as boolean) ?? false,
    selective: raw.selective !== undefined ? (raw.selective as boolean) : true,
    selectiveLogic,
    enabled,
    position,
    depth: (raw.depth as number) ?? 4,
    order: (pick<number>(raw, 'order', 'insertion_order')) ?? 100,
    probability: (raw.probability as number) ?? 100,
    group: (raw.group as string) ?? '',
    role: (raw.role as number) ?? 0,
    sticky: (raw.sticky as number) ?? 0,
    cooldown: (raw.cooldown as number) ?? 0,
    delay: (raw.delay as number) ?? 0,
    groupOverride: (pick<boolean>(raw, 'groupOverride', 'group_override')) ?? false,
    groupWeight: (pick<number>(raw, 'groupWeight', 'group_weight')) ?? 100,
    scanDepth: (pick<number | null>(raw, 'scanDepth', 'scan_depth')) ?? null,
    caseSensitive: (pick<boolean | null>(raw, 'caseSensitive', 'case_sensitive')) ?? null,
    matchWholeWords: (pick<boolean | null>(raw, 'matchWholeWords', 'match_whole_words')) ?? null,
    useGroupScoring: (raw.useGroupScoring as boolean | null) ?? null,
    automationId: (pick<string>(raw, 'automationId', 'automation_id')) ?? '',
    excludeRecursion: (pick<boolean>(raw, 'excludeRecursion', 'exclude_recursion')) ?? false,
    preventRecursion: (pick<boolean>(raw, 'preventRecursion', 'prevent_recursion')) ?? false,
    delayUntilRecursion: (pick<boolean>(raw, 'delayUntilRecursion', 'delay_until_recursion')) ?? false,
    displayIndex: (pick<number>(raw, 'displayIndex', 'display_index')) ?? 0,
  } as WorldBookEntry;
  // 老字段名已并入规范字段，删掉残留避免污染（保留其它未知字段供 round-trip）
  delete (result as Record<string, unknown>).disable;
  delete (result as Record<string, unknown>).keys;
  delete (result as Record<string, unknown>).secondary_keys;
  delete (result as Record<string, unknown>).insertion_order;
  return result;
}

/** Parse a world book JSON (supports both Record and Array entries).
 *  统一以 String(uid) 为内部记录键，保证与 exportWorldBook 一致。 */
export function parseWorldBook(json: Record<string, unknown>): WorldBook {
  const rawEntries = json.entries;
  const entries: Record<string, WorldBookEntry> = {};

  const addEntry = (raw: Record<string, unknown>, fallbackUid: number) => {
    const uid = (raw.uid as number) ?? fallbackUid;
    entries[String(uid)] = normalizeEntry(raw, uid);
  };

  if (Array.isArray(rawEntries)) {
    rawEntries.forEach((entry, i) => addEntry(entry as Record<string, unknown>, i));
  } else if (rawEntries && typeof rawEntries === 'object') {
    Object.entries(rawEntries as Record<string, unknown>).forEach(([key, entry]) => {
      addEntry(entry as Record<string, unknown>, parseInt(key) || 0);
    });
  }

  // Preserve original data for export
  const originalData: Record<string, unknown> = { ...json };
  delete originalData.entries;

  return { entries, originalData };
}

/** Export world book to ST-compatible JSON.
 *  - 记录键强制 === String(uid)（不一致会被 ST 拒导入，这是历史 bug 根因）
 *  - 内部 enabled → ST 的反义 disable
 *  - key/keysecondary 写成数组（ST 1.10+ 规范）
 */
export function exportWorldBook(wb: WorldBook): string {
  const exportEntries: Record<string, Record<string, unknown>> = {};

  Object.values(wb.entries).forEach((entry) => {
    const { key: keys, keysecondary, enabled, ...rest } = entry;
    const recordKey = String(entry.uid);
    exportEntries[recordKey] = {
      ...rest,
      key: keys,
      keysecondary,
      disable: !enabled,
    };
  });

  const output = {
    ...(wb.originalData ?? {}),
    entries: exportEntries,
  };

  return JSON.stringify(output, null, 2);
}

export function generateWorldBookId(): string {
  return `wb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
