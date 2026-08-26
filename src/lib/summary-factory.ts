import type { ArchiveStory } from '@/types/archive';
import { getBranchLine } from '@/lib/archive-db';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import { generateSummaryId } from '@/types/summary';

export interface ManualSummaryInput {
  story: ArchiveStory;
  kind: SummaryKind;
  branchId: string | null;
  content: string;
  title?: string;
  volumeNumber?: number;
  existingVolumes?: Pick<SummaryItem, 'volumeNumber'>[];
  now?: number;
}

/** Build a manual record with the same branch/range semantics as the generation workbench. */
export function buildManualSummaryItem(input: ManualSummaryInput): SummaryItem {
  const now = input.now ?? Date.now();
  const line = getBranchLine(input.story, input.branchId) ?? getBranchLine(input.story, null)!;
  const volumes = input.existingVolumes ?? [];
  const nextVolume = volumes.length
    ? Math.max(...volumes.map((item) => item.volumeNumber ?? 0)) + 1
    : 1;
  const volume = input.kind === 'volume' ? (input.volumeNumber ?? nextVolume) : undefined;
  return {
    id: generateSummaryId(),
    bookId: input.story.id,
    bookTitle: input.story.title,
    kind: input.kind,
    title: input.title?.trim() || `手动录入 · ${new Date(now).toLocaleString('zh-CN')}`,
    branchId: input.branchId ?? undefined,
    floorStart: 0,
    floorEnd: Math.max(line.session.messages.length - 1, 0),
    content: input.content.trim(),
    volumeNumber: volume,
    createdAt: now,
    updatedAt: now,
  };
}
