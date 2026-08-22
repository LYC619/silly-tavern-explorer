/**
 * 跨页面共用的界面文案（阶段 D4 起）。
 *
 * 加载态原先三套并存：`加载中...`（半角三点，StoryWorkspace / CharacterPage /
 * InlineStoryReader）、`加载中…`（省略号，AssetLibrary / StoryTreeWorkspace 等）、
 * `读取中…` 与 `正在读取归档…`（其他资产浏览器）。同一个应用里同一件事三种说法，
 * 而且半角三点在中文排版里是错的。
 *
 * 约定：默认一律用 LOADING_LABEL。只有在「说清楚正在读什么」确实对用户有用时
 * 才写具体文案（如「正在读取扩展清单…」），并且同样用省略号。
 */
export const LOADING_LABEL = '加载中…';
