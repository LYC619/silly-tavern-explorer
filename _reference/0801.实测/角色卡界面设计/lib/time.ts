// 统一时间口径：7 天内用相对时间，更久显示日期。
// NOW 为演示用的固定「当前时间」，接真实数据时替换为 Date.now()。
export const NOW = new Date("2026-08-01T14:22:00+08:00").getTime()

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = NOW - t
  const min = Math.round(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.round(hour / 24)
  if (day <= 7) return `${day} 天前`
  return absoluteDate(iso)
}

// 固定时区，避免服务端与浏览器时区不一致导致水合前后显示不同
const TZ = "Asia/Shanghai"

function parts(iso: string) {
  const f = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "00"
  return { y: get("year"), M: get("month"), d: get("day"), h: get("hour"), m: get("minute") }
}

export function absoluteDate(iso: string): string {
  const p = parts(iso)
  return `${p.y}/${Number(p.M)}/${Number(p.d)}`
}

export function absoluteDateTime(iso: string): string {
  const p = parts(iso)
  return `${absoluteDate(iso)} - ${p.h}:${p.m}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分`
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US")
}
