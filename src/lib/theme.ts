/**
 * 主题系统元数据（新前端交接包定稿）：四套主题共用一套 CSS 变量，
 * 切换 = 换 <html data-theme>；品牌橙跨主题不变。
 * dark 字段驱动 .dark class 同步（tailwind dark: 变体）与 sonner 明暗。
 */
export const THEMES = [
  { key: 'cocoa', label: '深咖啡', swatch: '#1e1610', swatchAccent: '#d8894b', dark: true },
  { key: 'ink', label: '墨黑', swatch: '#0e0e10', swatchAccent: '#8f9aa8', dark: true },
  { key: 'midnight', label: '深夜蓝', swatch: '#0f131c', swatchAccent: '#5d8fca', dark: true },
  { key: 'cream', label: '米色典雅', swatch: '#f5f0e6', swatchAccent: '#b47743', dark: false },
] as const;

export type ThemeKey = (typeof THEMES)[number]['key'];

export const DEFAULT_THEME: ThemeKey = 'cocoa';

export const THEME_KEYS = THEMES.map((t) => t.key);

/** 主题选择器使用的双层色标：保留底色，同时让三个深色主题一眼可区分。 */
export function themeSwatchBackground(theme: (typeof THEMES)[number]): string {
  return `linear-gradient(135deg, ${theme.swatch} 0%, ${theme.swatch} 54%, ${theme.swatchAccent} 55%, ${theme.swatchAccent} 100%)`;
}

export function isDarkTheme(theme: string | undefined): boolean {
  return THEMES.find((t) => t.key === theme)?.dark ?? true;
}
