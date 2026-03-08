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
}

export const POSITION_LABELS: Record<number, string> = {
  0: '角色设定之前',
  1: '角色设定之后',
  2: '示例消息之前',
  3: '示例消息之后',
  4: '作者注释顶部',
  5: '作者注释底部',
  6: '@ 指定深度',
  7: 'Outlet',
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

/** Parse key string (comma-separated) into array */
export function parseKeys(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw.map(k => k.trim()).filter(Boolean);
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

/** Normalize a raw entry from JSON, filling missing fields with defaults */
export function normalizeEntry(raw: Record<string, unknown>, uid: number): WorldBookEntry {
  return {
    ...DEFAULT_ENTRY,
    ...raw,
    uid,
    key: parseKeys((raw.key as string | string[]) ?? ''),
    keysecondary: parseKeys((raw.keysecondary as string | string[]) ?? ''),
    comment: (raw.comment as string) ?? '',
    content: (raw.content as string) ?? '',
    constant: (raw.constant as boolean) ?? false,
    vectorized: (raw.vectorized as boolean) ?? false,
    selective: raw.selective !== undefined ? (raw.selective as boolean) : true,
    selectiveLogic: (raw.selectiveLogic as number) ?? 0,
    enabled: raw.enabled !== undefined ? (raw.enabled as boolean) : true,
    position: (raw.position as number) ?? 1,
    depth: (raw.depth as number) ?? 4,
    order: (raw.order as number) ?? 100,
    probability: (raw.probability as number) ?? 100,
    group: (raw.group as string) ?? '',
    role: (raw.role as number) ?? 0,
    sticky: (raw.sticky as number) ?? 0,
    cooldown: (raw.cooldown as number) ?? 0,
    delay: (raw.delay as number) ?? 0,
  };
}

/** Parse a world book JSON (supports both Record and Array entries) */
export function parseWorldBook(json: Record<string, unknown>): WorldBook {
  const rawEntries = json.entries;
  const entries: Record<string, WorldBookEntry> = {};
  
  if (Array.isArray(rawEntries)) {
    rawEntries.forEach((entry, i) => {
      const uid = (entry as Record<string, unknown>).uid as number ?? i;
      entries[String(uid)] = normalizeEntry(entry as Record<string, unknown>, uid);
    });
  } else if (rawEntries && typeof rawEntries === 'object') {
    Object.entries(rawEntries as Record<string, unknown>).forEach(([key, entry]) => {
      const raw = entry as Record<string, unknown>;
      const uid = (raw.uid as number) ?? parseInt(key) || 0;
      entries[key] = normalizeEntry(raw, uid);
    });
  }

  // Preserve original data for export
  const originalData: Record<string, unknown> = { ...json };
  delete originalData.entries;

  return { entries, originalData };
}

/** Export world book to ST-compatible JSON */
export function exportWorldBook(wb: WorldBook): string {
  const exportEntries: Record<string, Record<string, unknown>> = {};
  
  Object.entries(wb.entries).forEach(([key, entry]) => {
    const { key: keys, keysecondary, ...rest } = entry;
    exportEntries[key] = {
      ...rest,
      key: keys.join(', '),
      keysecondary: keysecondary.join(', '),
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
