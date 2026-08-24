import { describe, expect, it } from 'vitest';
import { cardFontSizes, FONT_MAX, FONT_MIN, MIN_FONT_PX } from '@/lib/library-view';

/**
 * 卡面字号跟着「外观 → 卡面字体大小」滑杆缩放。基准值 × FONT_MIN 会把简介算到
 * 10px，比字号下限还小，所以 cardFontSizes 统一夹了一道底。
 */
describe('卡面字号下限', () => {
  it('滑杆拉到最小时，三处字号都不低于 11px', () => {
    const sizes = cardFontSizes(FONT_MIN);
    expect(sizes.intro).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(sizes.name).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(sizes.rowName).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it('整个滑杆区间都不低于 11px', () => {
    for (let scale = FONT_MIN; scale <= FONT_MAX + 1e-9; scale += 0.05) {
      const sizes = cardFontSizes(scale);
      for (const [key, value] of Object.entries(sizes)) {
        expect(value, `scale=${scale.toFixed(2)} ${key}`).toBeGreaterThanOrEqual(MIN_FONT_PX);
      }
    }
  });

  /** 夹下限不能把名称和简介压成同一档，否则卡面就没有层级了。 */
  it('放大时名称仍然大于简介', () => {
    const sizes = cardFontSizes(FONT_MAX);
    expect(sizes.name).toBeGreaterThan(sizes.intro);
  });

  it('滑杆确实在缩放，不是常量', () => {
    expect(cardFontSizes(FONT_MAX).name).toBeGreaterThan(cardFontSizes(FONT_MIN).name);
  });
});
