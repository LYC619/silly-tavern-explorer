/** Normalize a user-entered archive story title before passing it to the queued writer. */
export function normalizeStoryTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error('故事名称不能为空');
  return title;
}
