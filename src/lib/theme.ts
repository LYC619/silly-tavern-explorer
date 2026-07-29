/**
 * 主题系统元数据（新前端交接包定稿）：四套主题共用一套 CSS 变量，
 * 切换 = 换 <html data-theme>；品牌橙跨主题不变。
 * dark 字段驱动 .dark class 同步（tailwind dark: 变体）与 sonner 明暗。
 */
export const THEMES = [
  { key: 'cocoa', label: '深咖啡', swatch: '#1e1610', dark: true },
  { key: 'ink', label: '墨黑', swatch: '#0e0e10', dark: true },
  { key: 'midnight', label: '深夜蓝', swatch: '#0f131c', dark: true },
  { key: 'cream', label: '米色典雅', swatch: '#f5f0e6', dark: false },
] as const;

export type ThemeKey = (typeof THEMES)[number]['key'];

export const DEFAULT_THEME: ThemeKey = 'cocoa';

export const THEME_KEYS = THEMES.map((t) => t.key);

export function isDarkTheme(theme: string | undefined): boolean {
  return THEMES.find((t) => t.key === theme)?.dark ?? true;
}
