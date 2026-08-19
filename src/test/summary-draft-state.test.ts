import { describe, expect, it } from 'vitest';
import { hasUnsavedSummaryDraft } from '@/lib/summary-draft-state';
import type { SummaryItem } from '@/types/summary';

const record = {
  id: 'summary-1',
  bookId: 'story-1',
  bookTitle: '测试故事',
  kind: 'volume',
  title: '第一卷',
  floorStart: 0,
  floorEnd: 10,
  content: '已保存正文',
  createdAt: 1,
  updatedAt: 1,
} satisfies SummaryItem;

describe('总结草稿离开保护', () => {
  it('新建空白和已存记录原文都保持 clean', () => {
    expect(hasUnsavedSummaryDraft({ record: null, title: '', content: '', streaming: false })).toBe(false);
    expect(hasUnsavedSummaryDraft({ record, title: record.title, content: record.content, streaming: false })).toBe(false);
  });

  it('新建内容、已存记录修改或生成中都视为未保存', () => {
    expect(hasUnsavedSummaryDraft({ record: null, title: '', content: '草稿', streaming: false })).toBe(true);
    expect(hasUnsavedSummaryDraft({ record, title: '改名后', content: record.content, streaming: false })).toBe(true);
    expect(hasUnsavedSummaryDraft({ record, title: record.title, content: '修改正文', streaming: false })).toBe(true);
    expect(hasUnsavedSummaryDraft({ record, title: record.title, content: record.content, streaming: true })).toBe(true);
  });
});
