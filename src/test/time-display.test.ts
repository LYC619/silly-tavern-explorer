/** 时间显示铁律（10.0）：≤7 天相对 / >7 天日期 / hover 完整 */
import { describe, expect, it } from 'vitest';
import { formatListTime, formatFullTime } from '@/lib/time-display';

const NOW = new Date('2026-08-01T12:00:00').getTime();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('formatListTime', () => {
  it('≤7 天：相对时间分档', () => {
    expect(formatListTime(NOW - 30_000, NOW)).toBe('刚刚');
    expect(formatListTime(NOW - 38 * MIN, NOW)).toBe('38 分钟前');
    expect(formatListTime(NOW - 5 * 60 * MIN, NOW)).toBe('5 小时前');
    expect(formatListTime(NOW - 5 * DAY, NOW)).toBe('5 天前');
    expect(formatListTime(NOW - 7 * DAY, NOW)).toBe('7 天前');
  });

  it('>7 天：具体日期 yyyy/M/d', () => {
    expect(formatListTime(NOW - 8 * DAY, NOW)).toBe('2026/7/24');
    expect(formatListTime(new Date('2025-05-01T10:00:00').getTime(), NOW)).toBe('2025/5/1');
  });
});

describe('formatFullTime', () => {
  it('精确到分钟，两位补零', () => {
    expect(formatFullTime(new Date('2026-08-01T09:05:00').getTime())).toBe('2026/8/1 09:05');
  });
});
