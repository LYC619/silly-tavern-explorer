/**
 * 阅读包导出：选中的角色 + 故事 → 一个 `.ste-reading` 文件。
 *
 * 格式说明见 @/types/reading-pack。这里只管「库里的实体 → 包内条目」的映射，
 * 落盘交给调用方（桌面端走原生保存对话框，网页/移动端走下载或分享）。
 */
import { zipSync, strToU8 } from 'fflate';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { SummaryItem } from '@/types/summary';
import {
  PACK_CHARACTER_DIR, PACK_MANIFEST_PATH, PACK_MEDIA_DIR, PACK_STORY_DIR, PACK_SUMMARY_DIR,
  READING_PACK_FORMAT,
  type PackCharacter, type PackPortraitRow, type PackStory,
  type ReadingPackManifest,
} from '@/types/reading-pack';
import { detectRuntime } from '@/lib/runtime';

export interface BuildReadingPackInput {
  characters: ArchiveCharacter[];
  /** 已按用户勾选过滤过的故事 */
  stories: ArchiveStory[];
  /** 全部总结；本函数只挑属于 stories 的 */
  summaries?: SummaryItem[];
  appVersion: string;
  /** 注入用，测试里固定时间 */
  now?: () => number;
}

export interface BuiltReadingPack {
  bytes: Uint8Array;
  manifest: ReadingPackManifest;
}

/** base64（纯数据无前缀）→ 字节。库里的图片都是这个形态。 */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 从 mime 猜扩展名；猜不出按 png（立绘导入时限过图片类型） */
function extFromMime(mime: string | undefined): string {
  if (!mime) return 'png';
  const m = /^image\/(png|jpeg|jpg|webp|gif|avif)$/i.exec(mime);
  if (!m) return 'png';
  const sub = m[1].toLowerCase();
  return sub === 'jpeg' ? 'jpg' : sub;
}

/**
 * 文件名里可能出现的字符收一下。包内路径是我们自己造的（id + 固定前缀），
 * 但 id 的生成方式将来可能变，这里挡一道免得造出带 ../ 的路径。
 */
function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_') || 'x';
}

export function buildReadingPack(input: BuildReadingPackInput): BuiltReadingPack {
  const now = input.now ?? Date.now;
  const files: Record<string, Uint8Array> = {};
  const media = new Map<string, Uint8Array>();

  const storyIds = new Set(input.stories.map((s) => s.id));

  // ---- 角色 ----
  const packCharacters: PackCharacter[] = input.characters.map((c) => {
    const {
      pngBase64, portraitRows, attachments, assets, unresolvedAssets, sourcePath,
      ...rest
    } = c;
    // attachments/assets/unresolvedAssets/sourcePath 有意丢弃，理由见类型定义
    void attachments; void assets; void unresolvedAssets; void sourcePath;

    let cardMediaPath: string | undefined;
    if (pngBase64) {
      cardMediaPath = `${PACK_MEDIA_DIR}/card-${safeSegment(c.id)}.png`;
      media.set(cardMediaPath, base64ToBytes(pngBase64));
    }

    const packRows: PackPortraitRow[] | undefined = portraitRows?.map((row) => ({
      ...row,
      items: row.items.map((item) => {
        // 客户端的立绘图在库文件夹里（fileName），字节不在条目上——那种情况带不走，
        // 只能留下条目本身（导入端会显示成缺图）。网页/移动端的图在 dataBase64。
        if (!item.dataBase64) {
          return {
            id: item.id, source: item.source, name: item.name,
            mime: item.mime, addedAt: item.addedAt,
          };
        }
        const ext = extFromMime(item.mime);
        const mediaPath = `${PACK_MEDIA_DIR}/portrait-${safeSegment(c.id)}-${safeSegment(row.id)}-${safeSegment(item.id)}.${ext}`;
        media.set(mediaPath, base64ToBytes(item.dataBase64));
        return {
          id: item.id, source: item.source, name: item.name,
          mediaPath, mime: item.mime, addedAt: item.addedAt,
        };
      }),
    }));

    return { ...rest, cardMediaPath, portraitRows: packRows };
  });

  // ---- 故事 ----
  const packStories: PackStory[] = input.stories.map((s) => {
    const { sourcePath, writebacks, assets, unresolvedAssets, ...rest } = s;
    void sourcePath; void writebacks; void assets; void unresolvedAssets;
    return rest;
  });

  // ---- 总结：只带属于被选故事的 ----
  // SummaryItem.bookId 指向故事 id（书架时代的字段名沿用下来的）。
  const packSummaries = (input.summaries ?? []).filter(
    (item) => item.bookId !== null && storyIds.has(item.bookId),
  );

  // ---- 写条目 ----
  for (const c of packCharacters) {
    files[`${PACK_CHARACTER_DIR}/${safeSegment(c.id)}.json`] = strToU8(JSON.stringify(c));
  }
  for (const s of packStories) {
    files[`${PACK_STORY_DIR}/${safeSegment(s.id)}.json`] = strToU8(JSON.stringify(s));
  }
  for (const item of packSummaries) {
    files[`${PACK_SUMMARY_DIR}/${safeSegment(item.id)}.json`] = strToU8(JSON.stringify(item));
  }
  for (const [path, bytes] of media) {
    files[path] = bytes;
  }

  const manifest: ReadingPackManifest = {
    app: 'silly-tavern-explorer',
    kind: 'reading-pack',
    format: READING_PACK_FORMAT,
    exportedAt: new Date(now()).toISOString(),
    producedBy: { runtime: detectRuntime(), appVersion: input.appVersion },
    characters: packCharacters.map((c) => ({
      id: c.id,
      name: c.displayMeta?.name ?? c.name,
      updatedAt: c.updatedAt,
      storyCount: packStories.filter((s) => s.characterId === c.id).length,
    })),
    stories: packStories.map((s) => ({
      id: s.id,
      characterId: s.characterId,
      title: s.title,
      updatedAt: s.updatedAt,
      floors: s.session?.messages?.length ?? 0,
    })),
    summaryCount: packSummaries.length,
    mediaCount: media.size,
  };
  files[PACK_MANIFEST_PATH] = strToU8(JSON.stringify(manifest));

  // media 已经是压过的图片，再 deflate 只是白烧 CPU；level 6 对 JSON 有效，
  // fflate 会按条目各压一次，图片那几条压不动也就多花点时间。
  // ponytail: 想更快可以给 media/ 下的条目单独设 level 0，等真嫌慢再说。
  return { bytes: zipSync(files, { level: 6 }), manifest };
}

/** 建议的文件名：单角色用角色名，多角色用「N 个角色」 */
export function suggestPackFileName(manifest: ReadingPackManifest): string {
  const date = manifest.exportedAt.slice(0, 10);
  const base = manifest.characters.length === 1
    ? manifest.characters[0].name
    : `${manifest.characters.length} 个角色`;
  const safe = base.trim().replace(/[/:*?"<>|\\]/g, '_') || '阅读包';
  return `${safe}-${date}.ste-reading`;
}
