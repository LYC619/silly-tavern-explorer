/**
 * 阅读包这条来源的 DataSource 实现。
 * 解析/预览/还原的细节在 lib/reading-pack/*；这里只把它们接到统一接口上。
 */
import type { DataSource, ImportPlan, ImportResult, ImportSink } from './types';
import {
  buildExistingIndex, parseReadingPackBytes, previewReadingPack,
  restoreCharacter, restoreStory,
} from '@/lib/reading-pack/import';
import type { ParsedReadingPack } from '@/types/reading-pack';

export interface ReadingPackInput {
  /** 包字节 */
  bytes: Uint8Array;
  /** 展示用来源名（文件名） */
  origin: string;
  /** 本地现有条目的 id→updatedAt，用来判 add/overwrite/skip */
  existing: {
    characters: { id: string; updatedAt: number }[];
    stories: { id: string; updatedAt: number }[];
    summaries: { id: string; updatedAt: number }[];
  };
}

/**
 * 解析结果按 bytes 缓存一次：inspect 和 apply 会连着被调用，
 * 解一个几十 MB 的包两遍纯属浪费。只留最近一份，够用。
 */
let lastParsed: { bytes: Uint8Array; parsed: ParsedReadingPack } | null = null;

function parseCached(bytes: Uint8Array): ParsedReadingPack {
  if (lastParsed && lastParsed.bytes === bytes) return lastParsed.parsed;
  const parsed = parseReadingPackBytes(bytes);
  lastParsed = { bytes, parsed };
  return parsed;
}

export const readingPackSource: DataSource<ReadingPackInput> = {
  kind: 'reading-pack',
  label: '阅读包文件',
  isAvailable: () => true,

  async inspect(input) {
    const parsed = parseCached(input.bytes);
    const index = buildExistingIndex(
      input.existing.characters, input.existing.stories, input.existing.summaries,
    );
    const preview = previewReadingPack(parsed, index);
    return {
      kind: 'reading-pack',
      origin: input.origin,
      producedBy: parsed.manifest.producedBy,
      characters: preview.characters,
      stories: preview.stories,
      summaries: preview.summaries,
      totals: preview.totals,
    };
  },

  async apply(input, plan, sink) {
    const parsed = parseCached(input.bytes);
    const warnings: string[] = [];
    const written = { characters: 0, stories: 0, summaries: 0 };
    let skipped = 0;

    const actionOf = (rows: ImportPlan['characters'], id: string) =>
      rows.find((r) => r.id === id)?.action ?? 'skip';

    for (const packChar of parsed.characters) {
      if (actionOf(plan.characters, packChar.id) === 'skip') { skipped++; continue; }
      const restored = restoreCharacter(parsed, packChar);
      if (packChar.cardMediaPath && !restored.pngBase64) {
        warnings.push(`角色「${restored.name}」的卡面图片在包里缺失`);
      }
      await sink.saveCharacter(restored);
      written.characters++;
    }

    for (const packStory of parsed.stories) {
      if (actionOf(plan.stories, packStory.id) === 'skip') { skipped++; continue; }
      const local = await sink.getStory(packStory.id);
      await sink.saveStory(restoreStory(packStory, local));
      written.stories++;
    }

    for (const item of parsed.summaries) {
      if (actionOf(plan.summaries, item.id) === 'skip') { skipped++; continue; }
      await sink.saveSummary(item);
      written.summaries++;
    }

    return { written, skipped, warnings };
  },
};
