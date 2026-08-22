/**
 * 网页版批量下载降级（阶段 D5）行为测试。
 *
 * 原实现给每张卡排一个 setTimeout(index * 200)：1000 张 = 1000 个定时器、
 * 最后一张等 200 秒，且成功提示报的是选中张数而不是真正下成的张数。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  downloadCharactersInBatch,
  WEB_BATCH_DOWNLOAD_LIMIT,
} from '@/lib/character-web-download';
import type { ArchiveCharacter } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';

const card = { spec: 'chara_card_v2', data: { name: '测试' } } as unknown as STCharacterCard;

function makeChar(id: string, name: string, extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return { id, name, card, tags: [], status: '未开始', createdAt: 1, updatedAt: 1, ...extra };
}

describe('网页版批量下载', () => {
  it('按顺序逐张发起，返回真正下成的清单', async () => {
    const seen: string[] = [];
    const targets = ['甲', '乙', '丙'].map((n, i) => makeChar(`c${i}`, n));

    const result = await downloadCharactersInBatch(targets, {
      gapMs: 0,
      download: (c) => { seen.push(c.name); },
    });

    expect(seen).toEqual(['甲', '乙', '丙']);
    expect(result.downloaded).toEqual(['甲', '乙', '丙']);
    expect(result.failed).toEqual([]);
  });

  it('单张失败不中断后面的，失败据实记下来', async () => {
    const targets = ['甲', '乙', '丙'].map((n, i) => makeChar(`c${i}`, n));

    const result = await downloadCharactersInBatch(targets, {
      gapMs: 0,
      download: (c) => { if (c.name === '乙') throw new Error('图片损坏'); },
    });

    expect(result.downloaded).toEqual(['甲', '丙']);
    expect(result.failed).toEqual([{ name: '乙', error: '图片损坏' }]);
  });

  it('用展示名而不是原始卡名报告结果', async () => {
    const targets = [makeChar('c1', '原名', { displayMeta: { name: '改过的名字' } })];

    const result = await downloadCharactersInBatch(targets, { gapMs: 0, download: () => {} });

    expect(result.downloaded).toEqual(['改过的名字']);
  });

  it('间隔只加在两张之间，最后一张后面不再等', async () => {
    vi.useFakeTimers();
    try {
      const targets = ['甲', '乙'].map((n, i) => makeChar(`c${i}`, n));
      const done = vi.fn();
      const pending = downloadCharactersInBatch(targets, { gapMs: 150, download: () => {} }).then(done);

      // 第一张发起后卡在间隔上
      await vi.advanceTimersByTimeAsync(0);
      expect(done).not.toHaveBeenCalled();

      // 一个间隔之后第二张发起，且不再等第二个间隔
      await vi.advanceTimersByTimeAsync(150);
      await pending;
      expect(done).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('上限是个正数且小到浏览器不会拦截', () => {
    // 这条不是凑数：上限一旦被改大回几百张，D5 修的问题就原样回来了
    expect(WEB_BATCH_DOWNLOAD_LIMIT).toBeGreaterThan(0);
    expect(WEB_BATCH_DOWNLOAD_LIMIT).toBeLessThanOrEqual(50);
  });
});
