import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/theme';

/** next-themes 只管 data-theme 属性；tailwind 的 dark: 变体依赖 .dark class，在此同步 */
export function ThemeSync() {
  const { theme } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkTheme(theme));
  }, [theme]);
  return null;
}
