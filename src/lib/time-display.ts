/**
 * 时间显示铁律（10.0，0801 反馈 角色库#6）：
 * ≤7 天显示相对时间（38 分钟前 / 5 天前），>7 天显示具体日期（2026/5/1），
 * 一律配 hover title = 精确到分钟的完整时间戳。
 * UI 用法：<span title={formatFullTime(ts)}>{formatListTime(ts)}</span>
 */

const DAY_MS = 24 * 60 * 60_000;

/** 列表处显示：≤7 天相对，>7 天 yyyy/M/d */
export function formatListTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff > 7 * DAY_MS) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/** hover title：精确到分钟的完整时间戳 */
export function formatFullTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
