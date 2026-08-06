/** 判断图片是否需要按当前会话状态模糊显示。 */
export function shouldBlurNsfw(nsfw: boolean | undefined, blurEnabled: boolean, revealed: boolean): boolean {
  return Boolean(nsfw && blurEnabled && !revealed);
}
