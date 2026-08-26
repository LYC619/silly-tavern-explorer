import { describe, expect, it } from 'vitest';
import { buildManualSummaryItem } from '@/lib/summary-factory';
import type { ArchiveStory } from '@/types/archive';

const story = {
  id: 'story-1', title: '故事', session: { messages: [{ id: 'm1' }, { id: 'm2' }] },
  branches: [{ id: 'branch-1', name: '支线', session: { messages: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] } }],
} as unknown as ArchiveStory;

describe('buildManualSummaryItem', () => {
  it('uses the selected branch range and allocates the next volume', () => {
    const item = buildManualSummaryItem({ story, kind: 'volume', branchId: 'branch-1', content: '# 记录', existingVolumes: [{ volumeNumber: 2 }] });
    expect(item.floorStart).toBe(0);
    expect(item.floorEnd).toBe(2);
    expect(item.volumeNumber).toBe(3);
    expect(item.content).toBe('# 记录');
  });

  it('honors a user supplied volume number', () => {
    expect(buildManualSummaryItem({ story, kind: 'volume', branchId: null, content: 'x', volumeNumber: 9 }).volumeNumber).toBe(9);
  });
});
