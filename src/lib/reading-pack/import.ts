/**
 * 阅读包解析与导入。
 *
 * 两段式，和整库备份（lib/storage-utils）一致：先 parse + preview 让用户看清要写什么、
 * 会覆盖什么，确认了再 apply。理由不只是礼貌——导入会覆盖本地条目，而移动端上
 * 本地条目里攒着用户自己的阅读进度和评分。
 *
 * 去重策略：按 id 匹配，`updatedAt` 新的赢（last-write-wins），但**本地阅读进度永远保留**。
 * 三个考虑：
 * 1. 重复导入同一个包 = 无操作（包里的 updatedAt 不比本地新），不会把用户后来打的分冲掉。
 * 2. 电脑上确实改过内容（updatedAt 更新）时才覆盖，符合「电脑是工作台」的分工。
 * 3. 但 lastFloor/lastViewedAt/lastViewedBranchId 是「这台设备读到哪」，不是内容。
 *    覆盖它们等于把读者的书签撕了，所以无论谁新都保留本地值。
 */
import { unzipSync, strFromU8 } from 'fflate';
import type { ArchiveCharacter, ArchiveStory, PortraitRow } from '@/types/archive';
import type { SummaryItem } from '@/types/summary';
import {
  MAX_READING_PACK_BYTES, PACK_CHARACTER_DIR, PACK_MANIFEST_PATH, PACK_MEDIA_DIR,
  PACK_STORY_DIR, PACK_SUMMARY_DIR, READING_PACK_FORMAT,
  type PackCharacter, type PackStory, type ParsedReadingPack, type ReadingPackManifest,
} from '@/types/reading-pack';

export class ReadingPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingPackError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  // 分块避免 apply 的参数个数上限（大图会超）
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function parseJsonEntry<T>(bytes: Uint8Array, path: string): T {
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch (e) {
    throw new ReadingPackError(`包内 ${path} 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 解析包字节。只解析不写库。 */
export function parseReadingPackBytes(bytes: Uint8Array): ParsedReadingPack {
  if (bytes.length > MAX_READING_PACK_BYTES) {
    throw new ReadingPackError(
      `文件过大（${(bytes.length / 1024 / 1024).toFixed(1)} MB），超过上限，已拒绝导入以免撑爆内存`,
    );
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new ReadingPackError(`无法解压：文件可能损坏或不是阅读包（${e instanceof Error ? e.message : String(e)}）`);
  }

  const manifestBytes = entries[PACK_MANIFEST_PATH];
  if (!manifestBytes) throw new ReadingPackError('包里没有 manifest.json，不像阅读包');

  const manifest = parseJsonEntry<ReadingPackManifest>(manifestBytes, PACK_MANIFEST_PATH);
  if (manifest.app !== 'silly-tavern-explorer' || manifest.kind !== 'reading-pack') {
    throw new ReadingPackError('这不像本应用导出的阅读包（缺少标记），已拒绝导入');
  }
  if (typeof manifest.format !== 'number' || manifest.format > READING_PACK_FORMAT) {
    throw new ReadingPackError(
      `包的格式版本（${manifest.format}）比当前版本（${READING_PACK_FORMAT}）新，请先升级应用`,
    );
  }

  const characters: PackCharacter[] = [];
  const stories: PackStory[] = [];
  const summaries: SummaryItem[] = [];
  const media = new Map<string, Uint8Array>();

  for (const [path, data] of Object.entries(entries)) {
    if (path === PACK_MANIFEST_PATH) continue;
    if (path.startsWith(`${PACK_MEDIA_DIR}/`)) { media.set(path, data); continue; }
    if (!path.endsWith('.json')) continue;
    if (path.startsWith(`${PACK_CHARACTER_DIR}/`)) characters.push(parseJsonEntry(data, path));
    else if (path.startsWith(`${PACK_STORY_DIR}/`)) stories.push(parseJsonEntry(data, path));
    else if (path.startsWith(`${PACK_SUMMARY_DIR}/`)) summaries.push(parseJsonEntry(data, path));
  }

  return { manifest, characters, stories, summaries, media };
}

export async function parseReadingPackFile(file: File): Promise<ParsedReadingPack> {
  if (file.size > MAX_READING_PACK_BYTES) {
    throw new ReadingPackError(
      `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），超过上限，已拒绝导入以免撑爆内存`,
    );
  }
  return parseReadingPackBytes(new Uint8Array(await file.arrayBuffer()));
}

// ---------- 预览 ----------

export interface ReadingPackPreviewRow {
  id: string;
  label: string;
  action: 'add' | 'overwrite' | 'skip';
  /** action=skip 的原因（本地更新） */
  reason?: string;
}

export interface ReadingPackPreview {
  manifest: ReadingPackManifest;
  characters: ReadingPackPreviewRow[];
  stories: ReadingPackPreviewRow[];
  summaries: ReadingPackPreviewRow[];
  totals: { add: number; overwrite: number; skip: number };
}

interface ExistingIndex {
  characters: Map<string, number>;
  stories: Map<string, number>;
  summaries: Map<string, number>;
}

/** id → 本地 updatedAt。缺失=本地没有。 */
export function buildExistingIndex(
  characters: Pick<ArchiveCharacter, 'id' | 'updatedAt'>[],
  stories: Pick<ArchiveStory, 'id' | 'updatedAt'>[],
  summaries: Pick<SummaryItem, 'id' | 'updatedAt'>[],
): ExistingIndex {
  return {
    characters: new Map(characters.map((c) => [c.id, c.updatedAt])),
    stories: new Map(stories.map((s) => [s.id, s.updatedAt])),
    summaries: new Map(summaries.map((s) => [s.id, s.updatedAt])),
  };
}

function decide(
  incomingUpdatedAt: number,
  existing: number | undefined,
): { action: 'add' | 'overwrite' | 'skip'; reason?: string } {
  if (existing === undefined) return { action: 'add' };
  // 相等也跳过：重复导入同一个包应该是无操作
  if (incomingUpdatedAt <= existing) {
    return { action: 'skip', reason: '本地版本不更旧，保留本地' };
  }
  return { action: 'overwrite' };
}

export function previewReadingPack(pack: ParsedReadingPack, existing: ExistingIndex): ReadingPackPreview {
  const totals = { add: 0, overwrite: 0, skip: 0 };

  const characters = pack.characters.map((c) => {
    const d = decide(c.updatedAt, existing.characters.get(c.id));
    totals[d.action]++;
    return { id: c.id, label: c.displayMeta?.name ?? c.name, ...d };
  });
  const stories = pack.stories.map((s) => {
    const d = decide(s.updatedAt, existing.stories.get(s.id));
    totals[d.action]++;
    return { id: s.id, label: s.title, ...d };
  });
  const summaries = pack.summaries.map((s) => {
    const d = decide(s.updatedAt, existing.summaries.get(s.id));
    totals[d.action]++;
    return { id: s.id, label: s.title, ...d };
  });

  return { manifest: pack.manifest, characters, stories, summaries, totals };
}

// ---------- 还原成库内实体 ----------

/** 把包内角色还原成 ArchiveCharacter：media 路径换回 base64 */
export function restoreCharacter(pack: ParsedReadingPack, packChar: PackCharacter): ArchiveCharacter {
  const { cardMediaPath, portraitRows, ...rest } = packChar;

  const cardBytes = cardMediaPath ? pack.media.get(cardMediaPath) : undefined;
  const restoredRows: PortraitRow[] | undefined = portraitRows?.map((row) => ({
    id: row.id,
    title: row.title,
    items: row.items.map((item) => {
      const bytes = item.mediaPath ? pack.media.get(item.mediaPath) : undefined;
      return {
        id: item.id,
        source: item.source,
        name: item.name,
        // 图片缺失（客户端立绘只存了文件名，或包被裁过）时条目照样留下，
        // 界面上会显示成缺图——比静默丢掉整行好。
        dataBase64: bytes ? bytesToBase64(bytes) : undefined,
        mime: item.mime,
        addedAt: item.addedAt,
      };
    }),
  }));

  return {
    ...rest,
    pngBase64: cardBytes ? bytesToBase64(cardBytes) : undefined,
    portraitRows: restoredRows,
  };
}

/**
 * 把包内故事还原成 ArchiveStory。
 * local 是本地同 id 的现有故事（可能没有）——阅读进度从它那儿继承。
 */
export function restoreStory(packStory: PackStory, local?: ArchiveStory): ArchiveStory {
  const restored: ArchiveStory = { ...packStory };
  if (local) {
    // 本地读到哪永远保留，见文件头注释第 3 条
    restored.lastFloor = local.lastFloor;
    restored.lastViewedAt = local.lastViewedAt;
    restored.lastViewedBranchId = local.lastViewedBranchId;
    // 这些是本机专有、包里也没带的字段，别让覆盖把它们抹成 undefined
    restored.sourcePath = local.sourcePath;
    restored.writebacks = local.writebacks;
    restored.assets = local.assets;
    restored.unresolvedAssets = local.unresolvedAssets;
  }
  return restored;
}
